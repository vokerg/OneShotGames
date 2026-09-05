#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openChromeDevToolsSession } from './lib/chrome-devtools-session.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/group-construction-browser');
const host = '127.0.0.1';
const appPort = 4191;
const browserPort = 9241;
const pageUrl = `http://${host}:${appPort}/`;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const mime = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript',
  '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
    .find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const projectRelative = relative(root, file);
    if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) throw new Error('Invalid path');
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) { response.statusCode = 404; response.end(error.message); }
});

await mkdir(artifacts, { recursive: true });
await new Promise((resolveReady, rejectReady) => { server.once('error', rejectReady); server.listen(appPort, host, resolveReady); });

const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

let session = null;
const report = {
  schema: 'fields-of-resolve.group-construction-browser-smoke', version: 7, status: 'FAIL', browser,
  marquee: null, mixedSelection: null, engineerSubgroup: null, engineerSubgroupRestored: null,
  singleEngineer: null, placementArmed: false, authoredCampaign: null,
};

async function dispatchKey(call, key, code) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  await delay(100);
}

async function selectionState(evaluate) {
  return evaluate(`(() => {
    const cards = [...document.querySelectorAll('#selectionGrid .selectionUnitCard')];
    const primary = cards.find((card) => card.classList.contains('primary'));
    return {
      count: cards.length,
      primaryName: primary?.querySelector('.selectionUnitName')?.textContent || '',
      names: cards.map((card) => card.querySelector('.selectionUnitName')?.textContent || ''),
      subgroupTabs: [...document.querySelectorAll('#selectionSubgroups .selectionSubgroupTab')].map((button) => button.textContent?.trim() || ''),
    };
  })()`);
}

async function constructionState(evaluate) {
  for (let page = 0; page < 6; page += 1) {
    const state = await evaluate(`(() => {
      const actions = [...document.querySelectorAll('.commandCardAction')];
      const builds = actions.filter((button) => button.dataset.commandGroup === 'construction');
      const next = [...document.querySelectorAll('.commandCardPageButton')].find((button) => button.textContent?.trim() === 'Next');
      const primary = document.querySelector('#selectionGrid .selectionUnitCard.primary .selectionUnitName');
      return {
        page: Number(document.querySelector('#abilities')?.dataset?.commandCardPage || 0),
        pages: Number(document.querySelector('#abilities')?.dataset?.commandCardPages || 1),
        canAdvance: Boolean(next && !next.disabled),
        primaryName: primary?.textContent || '',
        builds: builds.map((button) => ({
          id: button.dataset.commandId, disabled: button.disabled,
          title: button.querySelector('.commandTitle')?.textContent || '',
          description: button.querySelector('.commandDescription')?.textContent || '',
          meta: button.querySelector('.abilityMeta')?.textContent || '', ariaLabel: button.getAttribute('aria-label') || '',
        })),
      };
    })()`);
    if (state.builds.length || !state.canAdvance) return state;
    await evaluate(`[...document.querySelectorAll('.commandCardPageButton')].find((button) => button.textContent?.trim() === 'Next' && !button.disabled)?.click()`);
    await delay(70);
  }
  throw new Error('Construction commands were not found within six command-card pages.');
}

async function cycleUntilEngineer(call, evaluate, maxCycles = 10) {
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const selection = await selectionState(evaluate);
    if (/Combat Engineers/i.test(selection.primaryName)) return selection;
    await dispatchKey(call, 'Tab', 'Tab');
  }
  const selection = await selectionState(evaluate);
  throw new Error(`Engineer subgroup was not restored after ${maxCycles} cycles: ${JSON.stringify(selection)}`);
}

async function startFirstAuthoredOperation(evaluate, waitFor) {
  await waitFor(`document.querySelector('[data-campaign-operation-id] button:not([disabled])')`, 'first unlocked authored operation');
  await evaluate(`document.querySelector('[data-campaign-operation-id] button:not([disabled])').click()`);
  await waitFor(`document.querySelector('[data-campaign-briefing] button.primary')`, 'authored briefing');
  await evaluate(`document.querySelector('[data-campaign-briefing] button.primary').click()`);
  await waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.stage === 'battlefield'`,
    'authored battlefield',
  );
  return evaluate(`window.__fieldsOfResolveAuthoredCampaign?.snapshot?.()`);
}

try {
  session = await openChromeDevToolsSession({ browser, browserPort, profilePrefix: 'ufrts-group-construction-', windowSize: '1280,900', startupTimeoutMs: 15_000 });
  const { call, evaluate, waitFor, captureScreenshot } = session;
  await call('Page.navigate', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.missionCard button')`, 'mission selection');
  report.authoredCampaign = await startFirstAuthoredOperation(evaluate, waitFor);
  await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Dismiss all')?.click()`);
  await delay(120);

  const marquee = await evaluate(`(() => {
    const canvas = document.querySelector('#game');
    if (!canvas) return null;
    const rect = { left: 140, top: 160, right: Math.min(innerWidth - 180, 1100), bottom: Math.min(innerHeight - 140, 760) };
    const fire = (type, x, y) => canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1,
    }));
    fire('mousedown', rect.left, rect.top); fire('mousemove', rect.right, rect.bottom); fire('mouseup', rect.right, rect.bottom);
    return { ...rect, delivery: 'direct-canvas-production-input', viewport: { width: innerWidth, height: innerHeight } };
  })()`);
  if (!marquee) throw new Error('Could not dispatch the battlefield selection marquee.');
  report.marquee = marquee;
  await waitFor(`document.querySelectorAll('#selectionGrid .selectionUnitCard').length >= 4`, 'mixed starting-force selection');

  const selected = await selectionState(evaluate);
  if (selected.names.filter((name) => /Combat Engineers/i.test(name)).length !== 2) {
    throw new Error(`Battlefield marquee did not select exactly two engineers: ${JSON.stringify(selected)}`);
  }
  await cycleUntilEngineer(call, evaluate);

  const engineer = await constructionState(evaluate);
  if (engineer.builds.length !== 3 || engineer.builds.some((build) => build.disabled)) {
    throw new Error(`Engineer-primary mixed selection did not expose enabled construction actions: ${JSON.stringify(engineer)}`);
  }
  if (!engineer.builds.every((build) => /2×\s*Combat Engineers/i.test(build.meta))) {
    throw new Error(`Engineer subgroup ownership was not visible in command metadata: ${JSON.stringify(engineer.builds)}`);
  }
  report.engineerSubgroup = engineer;

  await dispatchKey(call, 'Tab', 'Tab');
  let mixed = await constructionState(evaluate);
  if (/Combat Engineers/i.test(mixed.primaryName)) { await dispatchKey(call, 'Tab', 'Tab'); mixed = await constructionState(evaluate); }
  if (mixed.builds.length !== 3 || mixed.builds.some((build) => !build.disabled)) {
    throw new Error(`Non-engineer subgroup did not disable construction actions: ${JSON.stringify(mixed)}`);
  }
  if (!mixed.builds.every((build) => /engineer subgroup active/i.test(`${build.description} ${build.ariaLabel}`))) {
    throw new Error(`Disabled mixed-selection actions did not explain subgroup activation: ${JSON.stringify(mixed.builds)}`);
  }
  report.mixedSelection = mixed;

  const restoredSelection = await cycleUntilEngineer(call, evaluate);
  const engineerAgain = await constructionState(evaluate);
  if (engineerAgain.builds.length !== 3 || engineerAgain.builds.some((build) => build.disabled)) {
    throw new Error(`Cycling back to the engineer subgroup did not restore construction: ${JSON.stringify(engineerAgain)}`);
  }
  report.engineerSubgroupRestored = { selection: restoredSelection, commands: engineerAgain };

  const clickedBuild = await evaluate(`(() => {
    const button = document.querySelector('.commandCardAction[data-command-id="group-builddepot"]');
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`);
  if (!clickedBuild) throw new Error(`Could not activate the enabled group-builddepot command: ${JSON.stringify(engineerAgain.builds)}`);
  await waitFor(`document.body.classList.contains('placing')`, 'group construction placement to arm');
  report.placementArmed = true;

  const cancelledPlacement = await evaluate(`(() => {
    const canvas = document.querySelector('#game'); if (!canvas) return false;
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 320, clientY: 320, button: 2, buttons: 2 }));
    return true;
  })()`);
  if (!cancelledPlacement) throw new Error('Could not dispatch production context-menu construction cancellation.');
  await waitFor(`!document.body.classList.contains('placing')`, 'group construction placement cancellation');

  const clickedEngineer = await evaluate(`(() => {
    const button = [...document.querySelectorAll('#selectionGrid .selectionUnitCard')].find((candidate) => /Combat Engineers/i.test(candidate.querySelector('.selectionUnitName')?.textContent || ''));
    if (!button) return false; button.click(); return true;
  })()`);
  if (!clickedEngineer) throw new Error('Could not find an engineer card for the single-engineer browser case.');
  await waitFor(`document.querySelectorAll('#selectionGrid .selectionUnitCard').length === 1`, 'single engineer selection');
  const single = await constructionState(evaluate);
  if (single.builds.length !== 3 || single.builds.some((build) => build.disabled)) throw new Error(`Single engineer did not retain construction actions: ${JSON.stringify(single)}`);
  report.singleEngineer = single;

  report.status = 'PASS';
  await captureScreenshot(resolve(artifacts, 'group-construction-browser.png'));
  await writeFile(resolve(artifacts, 'group-construction-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('[group-construction-browser] PASS authored campaign, mixed selection, engineer subgroup, placement arming, and single engineer');
} catch (error) {
  report.error = error.stack || String(error);
  try { if (session) await session.captureScreenshot(resolve(artifacts, 'group-construction-browser-failure.png')); } catch {}
  await writeFile(resolve(artifacts, 'group-construction-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (session) await session.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
