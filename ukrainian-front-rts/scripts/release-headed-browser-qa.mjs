#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserId = String(process.env.RELEASE_QA_BROWSER || '').trim().toLowerCase();
const commit = String(process.env.RELEASE_QA_COMMIT || process.env.GITHUB_SHA || '').trim();
const artifacts = resolve(root, 'artifacts', 'release-browser-qa', browserId || 'unknown');
const host = '127.0.0.1';
const appPort = Number(process.env.RELEASE_QA_APP_PORT || 4180);
const driverPort = Number(process.env.RELEASE_QA_DRIVER_PORT || 9515);
const pageUrl = `http://${host}:${appPort}/`;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const KEY = Object.freeze({ ESCAPE: '\uE00C', CONTROL: '\uE009', META: '\uE03D' });
const mime = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript',
  '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

if (!['chrome', 'edge', 'firefox', 'safari'].includes(browserId)) {
  throw new Error('Set RELEASE_QA_BROWSER to chrome, edge, firefox, or safari.');
}
await mkdir(artifacts, { recursive: true });

function driverExecutable() {
  if (process.env.RELEASE_QA_DRIVER) return process.env.RELEASE_QA_DRIVER;
  const windows = process.platform === 'win32';
  const fromEnv = (value, name) => {
    if (!value) return null;
    return new RegExp(`${name}(?:\\.exe)?$`, 'i').test(value) ? value : join(value, windows ? `${name}.exe` : name);
  };
  const candidates = browserId === 'chrome'
    ? [fromEnv(process.env.CHROMEWEBDRIVER, 'chromedriver'), 'chromedriver']
    : browserId === 'edge'
      ? [fromEnv(process.env.EDGEWEBDRIVER, 'msedgedriver'), 'msedgedriver']
      : browserId === 'firefox'
        ? [fromEnv(process.env.GECKOWEBDRIVER, 'geckodriver'), 'geckodriver']
        : ['/usr/bin/safaridriver', 'safaridriver'];
  return candidates.find(Boolean);
}

function driverArguments() {
  if (browserId === 'safari') return ['-p', String(driverPort)];
  return [`--port=${driverPort}`];
}

function browserCapabilities() {
  if (browserId === 'chrome') {
    return { browserName: 'chrome', 'goog:chromeOptions': { args: ['--disable-search-engine-choice-screen', '--disable-dev-shm-usage'] } };
  }
  if (browserId === 'edge') {
    return { browserName: 'MicrosoftEdge', 'ms:edgeOptions': { args: ['--disable-search-engine-choice-screen', '--disable-dev-shm-usage'] } };
  }
  if (browserId === 'firefox') return { browserName: 'firefox', 'moz:firefoxOptions': { args: [] } };
  return { browserName: 'safari' };
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
    if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) throw new Error('Invalid path');
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(appPort, host, resolveReady);
});

const driverLogs = [];
const executable = driverExecutable();
const driver = spawn(executable, driverArguments(), { stdio: ['ignore', 'pipe', 'pipe'] });
driver.stdout.on('data', (chunk) => driverLogs.push(chunk.toString()));
driver.stderr.on('data', (chunk) => driverLogs.push(chunk.toString()));
let driverExited = false;
const driverExit = new Promise((resolveExit) => driver.once('exit', (code, signal) => {
  driverExited = true;
  driverLogs.push(`[driver-exit] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
  resolveExit();
}));
driver.once('error', (error) => driverLogs.push(`[driver-spawn] ${error.stack || error.message}\n`));

async function request(method, path, body = undefined, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${driverPort}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json; charset=utf-8' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.value?.error) {
      const message = payload?.value?.message || `${method} ${path} returned HTTP ${response.status}`;
      const error = new Error(message);
      error.webdriver = payload?.value || null;
      throw error;
    }
    return payload.value;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitDriver() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (driverExited) throw new Error(`WebDriver exited before becoming ready. ${driverLogs.join('')}`);
    try {
      const status = await request('GET', '/status', undefined, 1500);
      if (status?.ready !== false) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${browserId} WebDriver. ${driverLogs.join('')}`);
}

let sessionId = null;
const wd = (method, suffix, body, timeoutMs) => request(method, `/session/${sessionId}${suffix}`, body, timeoutMs);
async function execute(script, args = []) { return wd('POST', '/execute/sync', { script, args }); }
async function find(selector) {
  const element = await wd('POST', '/element', { using: 'css selector', value: selector });
  return element?.[ELEMENT];
}
async function click(selector) {
  const id = await find(selector);
  await wd('POST', `/element/${id}/click`, {});
}
async function waitFor(script, label, { attempts = 80, interval = 125 } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await execute(`return Boolean(${script});`)) return;
    } catch (error) { last = error; }
    await delay(interval);
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ''}.`);
}
async function screenshot(name) {
  const base64 = await wd('GET', '/screenshot');
  const path = join(artifacts, name);
  await writeFile(path, Buffer.from(base64, 'base64'));
  return name;
}
async function setWindow(width, height) {
  await wd('POST', '/window/rect', { x: 0, y: 0, width, height });
  await delay(250);
  return execute('return {outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio};');
}
async function key(value, modifier = null) {
  const actions = [];
  if (modifier) actions.push({ type: 'keyDown', value: modifier });
  actions.push({ type: 'keyDown', value }, { type: 'keyUp', value });
  if (modifier) actions.push({ type: 'keyUp', value: modifier });
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions }] });
  await wd('DELETE', '/actions');
}
async function canvasClick(x, y) {
  const canvas = await find('#game');
  const rect = await execute('const r=document.querySelector("#game").getBoundingClientRect(); return {width:r.width,height:r.height};');
  const actions = [{ type: 'pointerMove', duration: 0, origin: { [ELEMENT]: canvas }, x: Math.round(x - rect.width / 2), y: Math.round(y - rect.height / 2) },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }];
  await wd('POST', '/actions', { actions: [{ type: 'pointer', id: 'release-qa-pointer', parameters: { pointerType: 'mouse' }, actions }] });
  await wd('DELETE', '/actions');
  await delay(80);
}

async function layoutSnapshot() {
  return execute(`
    const rect = (el) => { const r=el?.getBoundingClientRect(); return r ? {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height} : null; };
    const topbar=document.querySelector('#topbar');
    const top=rect(topbar);
    const children=[...(topbar?.children||[])].map((el)=>({id:el.id||el.className||el.tagName,display:getComputedStyle(el).display,...rect(el)}));
    const visible=children.filter((child)=>child.display!=='none' && child.width>0 && child.height>0);
    const commandPanel=rect(document.querySelector('#commandPanel'));
    const card=rect(document.querySelector('.commandCardGrid'));
    const buttons=[...document.querySelectorAll('.commandCardAction')].map((el)=>({
      id:el.dataset.commandId, group:el.dataset.commandGroup, fallback:el.dataset.iconStatus==='fallback', icon:Boolean(el.querySelector('.commandCardIcon')),
      ...rect(el)
    }));
    return {
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, topbar:top, children, commandPanel, card, buttons,
      topbarOverflow:Boolean(top && visible.some((child)=>child.left < top.left-.5 || child.right > top.right+.5 || child.top < top.top-.5 || child.bottom > top.bottom+.5)),
      viewportOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth || document.documentElement.scrollHeight > document.documentElement.clientHeight,
      commandOverflow:Boolean(card && buttons.some((button)=>button.left < card.left-.5 || button.right > card.right+.5 || button.top < card.top-.5 || button.bottom > card.bottom+.5)),
      fallbackCount:buttons.filter((button)=>button.fallback).length,
      missingIconCount:buttons.filter((button)=>!button.icon).length,
      selectionName:document.querySelector('#selectionName')?.textContent || '',
      groups:[...new Set(buttons.map((button)=>button.group))],
    };
  `);
}

async function findSelections() {
  const rect = await execute(`const r=document.querySelector('#game').getBoundingClientRect(); const p=document.querySelector('#commandPanel').getBoundingClientRect(); return {width:r.width,height:r.height,maxY:Math.min(r.height-10,p.top-10)};`);
  const xs = [0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82].map((f) => rect.width * f);
  const ys = [0.18, 0.30, 0.42, 0.54, 0.66, 0.78].map((f) => Math.min(rect.maxY - 4, 75 + (rect.maxY - 85) * f));
  let unit = null;
  let building = null;
  for (const y of ys) {
    for (const x of xs) {
      await canvasClick(x, y);
      const state = await layoutSnapshot();
      if (!unit && state.buttons.length && state.groups.some((group) => ['order', 'targeting', 'stance', 'ability'].includes(group))) {
        unit = { x: Math.round(x), y: Math.round(y), name: state.selectionName, groups: state.groups };
      }
      if (!building && state.buttons.length && state.groups.some((group) => ['production', 'modernization', 'construction'].includes(group))) {
        building = { x: Math.round(x), y: Math.round(y), name: state.selectionName, groups: state.groups };
      }
      if (unit && building) return { unit, building };
    }
  }
  return { unit, building };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(details = {}) { return { status: 'PASS', ...details }; }
function na(reason, details = {}) { return { status: 'N/A', reason, ...details }; }

const report = {
  schema: 'fields-of-resolve.release-headed-browser-qa', version: 1, browser: browserId, headed: true,
  candidateCommit: commit || null, runner: { os: process.env.ImageOS || process.platform, imageVersion: process.env.ImageVersion || null },
  tester: 'OpenAI assistant via headed WebDriver; screenshots reviewed as release evidence',
  capabilities: null, surfaces: {}, uiReview: null, screenshots: [], status: 'FAIL',
};

try {
  await waitDriver();
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: browserCapabilities() } }, 60_000);
  sessionId = created?.sessionId || created?.value?.sessionId;
  report.capabilities = created?.capabilities || created?.value?.capabilities || {};
  assert(sessionId, `Could not create ${browserId} WebDriver session.`);

  await setWindow(1440, 900);
  await wd('POST', '/url', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.missionCard button') && window.__fieldsOfResolveComposition`, 'application startup', { attempts: 120 });
  await execute(`window.__releaseQaErrors=[]; addEventListener('error',e=>window.__releaseQaErrors.push(String(e.message||e.error||'error'))); addEventListener('unhandledrejection',e=>window.__releaseQaErrors.push(String(e.reason||'unhandled rejection')));`);

  // Storage persistence in the browser under test.
  await execute(`localStorage.setItem('fields-of-resolve.release-qa-sentinel','${commit || 'candidate'}');`);
  await wd('POST', '/refresh', {});
  await waitFor(`document.readyState === 'complete' && document.querySelector('.missionCard button') && window.__fieldsOfResolveComposition`, 'application reload', { attempts: 120 });
  const persisted = await execute(`return {sentinel:localStorage.getItem('fields-of-resolve.release-qa-sentinel')};`);
  assert(persisted.sentinel === (commit || 'candidate'), 'Browser storage did not survive reload.');
  report.surfaces.storage = pass({ evidence: persisted });

  // Dismiss optional onboarding overlays before real user-gesture checks.
  await execute(`const dismiss=[...document.querySelectorAll('button')].find((button)=>button.textContent?.trim()==='Dismiss all'); if(dismiss) dismiss.click();`);

  // Start first mission via a real WebDriver element click.
  await click('.missionCard button');
  await waitFor(`document.querySelector('#missionSelect')?.classList.contains('hidden') && document.querySelector('#missionTitle')?.textContent`, 'first mission start', { attempts: 120 });
  await execute(`const dismiss=[...document.querySelectorAll('button')].find((button)=>button.textContent?.trim()==='Dismiss all'); if(dismiss) dismiss.click();`);

  const canvasState = await execute(`const c=document.querySelector('#game'),r=c.getBoundingClientRect(); return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,context:Boolean(c.getContext('2d'))};`);
  assert(canvasState.width > 0 && canvasState.height > 0 && canvasState.cssWidth > 0 && canvasState.cssHeight > 0 && canvasState.context, 'Canvas did not initialize.');
  report.surfaces.canvas = pass({ evidence: canvasState });

  // Audio controls and persistence, triggered from a real click before script-level range input.
  await click('#audioSettingsToggle');
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'audio settings open');
  await execute(`const slider=document.querySelector('[data-audio-level="music"]'); slider.value='43'; slider.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(`JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music === 0.43`, 'audio settings persistence');
  const audio = await execute(`return {music:JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music, context:window.__fieldsOfResolveComposition?.audio()?.output?.contextState || window.__fieldsOfResolveComposition?.audio()?.mixer?.contextState || null};`);
  await click('#audioSettingsDone');
  await waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'audio settings close');
  assert(audio.music === 0.43, 'Audio setting did not persist.');
  report.surfaces.audio = pass({ evidence: audio });

  // Locate a live combat unit using real canvas pointer clicks, then exercise keyboard attack-move mode.
  const selections = await findSelections();
  if (selections.unit) {
    await canvasClick(selections.unit.x, selections.unit.y);
    await key('q');
    await delay(200);
    const keyboard = await execute(`const b=document.querySelector('[data-command-id="attack-move"]'); return {found:Boolean(b), targeting:b?.dataset?.targeting, ariaCurrent:b?.getAttribute('aria-current')};`);
    assert(keyboard.found && (keyboard.targeting === 'true' || keyboard.ariaCurrent === 'true'), 'Keyboard Q did not arm attack-move through the active command path.');
    await key(KEY.ESCAPE);
    report.surfaces.keyboard = pass({ evidence: { ...keyboard, selected: selections.unit.name } });
  } else {
    throw new Error('Could not locate a selectable combat unit for headed keyboard QA.');
  }

  // Fullscreen: N/A only when the browser itself reports the standardized API unavailable.
  const fullscreenEnabled = await execute(`return Boolean(document.fullscreenEnabled && document.querySelector('#viewportFullscreenToggle'));`);
  if (!fullscreenEnabled) {
    report.surfaces.fullscreen = na('Browser reports standardized fullscreen unavailable in this WebDriver session.');
  } else {
    await click('#viewportFullscreenToggle');
    await waitFor(`document.fullscreenElement !== null`, 'fullscreen entry', { attempts: 60, interval: 150 });
    const entered = await execute(`return {active:Boolean(document.fullscreenElement),width:innerWidth,height:innerHeight};`);
    await key(KEY.ESCAPE);
    await waitFor(`document.fullscreenElement === null`, 'fullscreen exit', { attempts: 60, interval: 150 });
    report.surfaces.fullscreen = pass({ evidence: entered });
  }

  // Real browser zoom via Ctrl/Cmd + '+', then reset via Ctrl/Cmd + '0'.
  await setWindow(1440, 900);
  const beforeZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};');
  const modifier = process.platform === 'darwin' ? KEY.META : KEY.CONTROL;
  await key('+', modifier);
  await delay(500);
  let afterZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};');
  if (Math.abs(afterZoom.innerWidth - beforeZoom.innerWidth) < 10) {
    await key('=', modifier);
    await delay(500);
    afterZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};');
  }
  const zoomChanged = Math.abs(afterZoom.innerWidth - beforeZoom.innerWidth) >= 10 || Math.abs(afterZoom.dpr - beforeZoom.dpr) > 0.01;
  assert(zoomChanged, `Browser zoom shortcut did not change viewport/DPR: ${JSON.stringify({ beforeZoom, afterZoom })}`);
  const zoomLayout = await layoutSnapshot();
  assert(!zoomLayout.topbarOverflow && !zoomLayout.commandOverflow, 'UI overflowed after browser zoom change.');
  await key('0', modifier);
  await delay(350);
  report.surfaces.dpi = pass({ evidence: { beforeZoom, afterZoom, layout: { topbarOverflow: zoomLayout.topbarOverflow, commandOverflow: zoomLayout.commandOverflow } } });

  // Frame pacing sample in the actual browser process.
  const performanceSample = await wd('POST', '/execute/async', { script: `
    const done=arguments[arguments.length-1]; const samples=[]; let previous=performance.now();
    const tick=(now)=>{ samples.push(now-previous); previous=now; if(samples.length>=90){ const sorted=[...samples].sort((a,b)=>a-b); done({frames:samples.length,mean:samples.reduce((a,b)=>a+b,0)/samples.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...samples)}); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);`, args: [] }, 15_000);
  assert(performanceSample.frames === 90 && performanceSample.mean < 80 && performanceSample.max < 750, `Frame pacing sample exceeded release smoke bounds: ${JSON.stringify(performanceSample)}`);
  report.surfaces.performance = pass({ evidence: performanceSample });

  // Windows Chrome: actual player-visible UFR-183 composition checks at required viewports.
  if (browserId === 'chrome' && process.platform === 'win32') {
    const requiredViewports = [[1280, 720], [1920, 1080], [2560, 1080]];
    const uiReview = [];
    for (const [requestedWidth, requestedHeight] of requiredViewports) {
      const actualWindow = await setWindow(requestedWidth, requestedHeight);
      assert(actualWindow.innerWidth >= requestedWidth - 120 && actualWindow.innerHeight >= requestedHeight - 160, `Runner could not provide requested ${requestedWidth}x${requestedHeight} review viewport: ${JSON.stringify(actualWindow)}`);
      const found = await findSelections();
      assert(found.unit, `No unit selection found at ${requestedWidth}x${requestedHeight}.`);
      assert(found.building, `No production/building selection found at ${requestedWidth}x${requestedHeight}.`);

      await canvasClick(found.unit.x, found.unit.y);
      const unitLayout = await layoutSnapshot();
      assert(!unitLayout.topbarOverflow && !unitLayout.viewportOverflow && !unitLayout.commandOverflow, `Unit layout overflow at ${requestedWidth}x${requestedHeight}.`);
      assert(unitLayout.fallbackCount === 0 && unitLayout.missingIconCount === 0, `Unit command card has missing/fallback icons at ${requestedWidth}x${requestedHeight}.`);
      assert(unitLayout.topbar?.height <= 64.5 && unitLayout.commandPanel?.height <= 176.5, `Unit HUD exceeded height budget at ${requestedWidth}x${requestedHeight}.`);
      const unitShot = await screenshot(`windows-chrome-${requestedWidth}x${requestedHeight}-unit.png`);
      report.screenshots.push(unitShot);

      await canvasClick(found.building.x, found.building.y);
      const buildingLayout = await layoutSnapshot();
      assert(!buildingLayout.topbarOverflow && !buildingLayout.viewportOverflow && !buildingLayout.commandOverflow, `Building layout overflow at ${requestedWidth}x${requestedHeight}.`);
      assert(buildingLayout.fallbackCount === 0 && buildingLayout.missingIconCount === 0, `Building command card has missing/fallback icons at ${requestedWidth}x${requestedHeight}.`);
      assert(buildingLayout.topbar?.height <= 64.5 && buildingLayout.commandPanel?.height <= 176.5, `Building HUD exceeded height budget at ${requestedWidth}x${requestedHeight}.`);
      assert(buildingLayout.groups.some((group) => ['production', 'modernization', 'construction'].includes(group)), `Selected building lacks production/modernization actions at ${requestedWidth}x${requestedHeight}.`);
      const buildingShot = await screenshot(`windows-chrome-${requestedWidth}x${requestedHeight}-building.png`);
      report.screenshots.push(buildingShot);
      uiReview.push({ requested: { width: requestedWidth, height: requestedHeight }, actualWindow, unit: { selection: found.unit, layout: unitLayout }, building: { selection: found.building, layout: buildingLayout } });
    }
    report.uiReview = { issue: 183, status: 'PASS', mode: 'headed Windows Chrome player-flow + screenshot review', viewports: uiReview };
  }

  const runtimeErrors = await execute(`return window.__releaseQaErrors || [];`);
  assert(runtimeErrors.length === 0, `Runtime errors during headed browser QA: ${runtimeErrors.join('; ')}`);
  const required = ['keyboard', 'audio', 'canvas', 'storage', 'fullscreen', 'dpi', 'performance'];
  assert(required.every((surface) => ['PASS', 'N/A'].includes(report.surfaces[surface]?.status)), `Missing/failed browser surface: ${JSON.stringify(report.surfaces)}`);
  report.status = 'PASS';
  report.runtimeErrors = runtimeErrors;
  report.screenshots.push(await screenshot(`${browserId}-final.png`));
  await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[release-headed-browser-qa] ${browserId} PASS ${report.capabilities?.browserVersion || report.capabilities?.version || 'unknown-version'}; ${required.map((id)=>`${id}=${report.surfaces[id].status}`).join(' ')}`);
} catch (error) {
  report.status = 'FAIL';
  report.error = error?.stack || String(error);
  try { if (sessionId) report.screenshots.push(await screenshot(`${browserId}-failure.png`)); } catch {}
  await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifacts, 'driver.log'), `${driverLogs.join('')}\n${error?.stack || error}\n`);
  throw error;
} finally {
  if (sessionId) {
    try { await request('DELETE', `/session/${sessionId}`, undefined, 5000); } catch {}
  }
  if (!driverExited) driver.kill('SIGTERM');
  await Promise.race([driverExit, delay(1500)]);
  if (!driverExited) driver.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
}
