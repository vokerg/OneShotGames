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
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
    .find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const projectRelative = relative(root, file);
    if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) {
      throw new Error('Invalid path');
    }
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});

await mkdir(artifacts, { recursive: true });
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(appPort, host, resolveReady);
});

const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

let session = null;
const report = {
  schema: 'fields-of-resolve.group-construction-browser-smoke',
  version: 1,
  status: 'FAIL',
  browser,
  mixedSelection: null,
  engineerSubgroup: null,
  singleEngineer: null,
  placementArmed: false,
};

async function dispatchKey(call, key, code, { shift = false } = {}) {
  const modifiers = shift ? 8 : 0;
  const common = { key, code, modifiers };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  await delay(80);
}

async function constructionState(evaluate) {
  for (let page = 0; page < 4; page += 1) {
    const state = await evaluate(`(() => {
      const actions = [...document.querySelectorAll('.commandCardAction')];
      const builds = actions.filter((button) => button.dataset.commandGroup === 'construction');
      const next = [...document.querySelectorAll('.commandCardPageButton')]
        .find((button) => button.textContent?.trim() === 'Next');
      return {
        page: Number(document.querySelector('#abilities')?.dataset?.commandCardPage || 0),
        pages: Number(document.querySelector('#abilities')?.dataset?.commandCardPages || 1),
        canAdvance: Boolean(next && !next.disabled),
        builds: builds.map((button) => ({
          id: button.dataset.commandId,
          disabled: button.disabled,
          title: button.querySelector('.commandTitle')?.textContent || '',
          description: button.querySelector('.commandDescription')?.textContent || '',
          meta: button.querySelector('.abilityMeta')?.textContent || '',
          ariaLabel: button.getAttribute('aria-label') || '',
        })),
      };
    })()`);
    if (state.builds.length || !state.canAdvance) return state;
    await evaluate(`[...document.querySelectorAll('.commandCardPageButton')]
      .find((button) => button.textContent?.trim() === 'Next' && !button.disabled)?.click()`);
    await delay(60);
  }
  throw new Error('Construction commands were not found within four command-card pages.');
}

try {
  session = await openChromeDevToolsSession({
    browser,
    browserPort,
    profilePrefix: 'ufrts-group-construction-',
    windowSize: '1280,720',
    startupTimeoutMs: 15_000,
  });
  const { call, evaluate, waitFor, captureScreenshot } = session;
  await call('Page.navigate', { url: pageUrl });
  await waitFor(
    `document.readyState === 'complete' && document.querySelector('.missionCard button')`,
    'mission selection',
  );
  await evaluate(`document.querySelector('.missionCard button').click()`);
  await waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && document.querySelector('#missionTitle')?.textContent`,
    'first mission startup',
  );

  const viewport = await evaluate(`({ width: innerWidth, height: innerHeight })`);
  const screen = (worldX, worldY) => ({
    x: viewport.width / 2 + (worldX - 390) * 0.85,
    y: viewport.height / 2 + (worldY - 1320) * 0.85,
  });
  const start = screen(295, 1335);
  const end = screen(525, 1445);

  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: start.x, y: start.y, button: 'none', buttons: 0,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1,
  });
  await waitFor(
    `document.querySelectorAll('#selectionGrid .selectionUnitCard').length >= 4`,
    'mixed starting-force selection',
  );

  const initial = await constructionState(evaluate);
  if (initial.builds.length !== 3 || initial.builds.some((build) => build.disabled)) {
    throw new Error(`Engineer-primary mixed selection did not expose enabled construction actions: ${JSON.stringify(initial)}`);
  }
  if (!initial.builds.every((build) => /2×\s*Combat Engineers/i.test(build.meta))) {
    throw new Error(`Engineer subgroup ownership was not visible in command metadata: ${JSON.stringify(initial.builds)}`);
  }
  report.engineerSubgroup = initial;

  await dispatchKey(call, 'Tab', 'Tab');
  const mixed = await constructionState(evaluate);
  if (mixed.builds.length !== 3 || mixed.builds.some((build) => !build.disabled)) {
    throw new Error(`Non-engineer subgroup did not disable construction actions: ${JSON.stringify(mixed)}`);
  }
  if (!mixed.builds.every((build) => /engineer subgroup active/i.test(`${build.description} ${build.ariaLabel}`))) {
    throw new Error(`Disabled mixed-selection actions did not explain subgroup activation: ${JSON.stringify(mixed.builds)}`);
  }
  report.mixedSelection = mixed;

  await dispatchKey(call, 'Tab', 'Tab');
  const engineerAgain = await constructionState(evaluate);
  if (engineerAgain.builds.length !== 3 || engineerAgain.builds.some((build) => build.disabled)) {
    throw new Error(`Cycling back to the engineer subgroup did not restore construction: ${JSON.stringify(engineerAgain)}`);
  }

  await evaluate(`document.querySelector('.commandCardAction[data-command-id="group-buildDepot"]')?.click()`);
  await waitFor(`document.body.classList.contains('placing')`, 'group construction placement to arm');
  report.placementArmed = true;
  await dispatchKey(call, 'Escape', 'Escape');
  await waitFor(`!document.body.classList.contains('placing')`, 'group construction placement cancellation');

  const clickedEngineer = await evaluate(`(() => {
    const button = [...document.querySelectorAll('#selectionGrid .selectionUnitCard')]
      .find((candidate) => /Engineer/i.test(candidate.querySelector('.selectionUnitName')?.textContent || ''));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clickedEngineer) throw new Error('Could not find an engineer card for the single-engineer browser case.');
  await waitFor(
    `document.querySelectorAll('#selectionGrid .selectionUnitCard').length === 1`,
    'single engineer selection',
  );
  const single = await constructionState(evaluate);
  if (single.builds.length !== 3 || single.builds.some((build) => build.disabled)) {
    throw new Error(`Single engineer did not retain construction actions: ${JSON.stringify(single)}`);
  }
  report.singleEngineer = single;

  report.status = 'PASS';
  await captureScreenshot(resolve(artifacts, 'group-construction-browser.png'));
  await writeFile(resolve(artifacts, 'group-construction-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('[group-construction-browser] PASS mixed selection, engineer subgroup, placement arming, and single engineer');
} catch (error) {
  report.error = error.stack || String(error);
  try {
    if (session) await session.captureScreenshot(resolve(artifacts, 'group-construction-browser-failure.png'));
  } catch {}
  await writeFile(resolve(artifacts, 'group-construction-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (session) await session.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
