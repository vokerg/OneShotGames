#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = String(process.env.RELEASE_QA_BROWSER || '').toLowerCase();
const candidateCommit = String(process.env.RELEASE_QA_COMMIT || process.env.GITHUB_SHA || '');
const artifacts = resolve(root, 'artifacts', 'release-browser-qa', browser || 'unknown');
const host = '127.0.0.1';
const appPort = Number(process.env.RELEASE_QA_APP_PORT || 4180);
const driverPort = Number(process.env.RELEASE_QA_DRIVER_PORT || 9515);
const appUrl = `http://${host}:${appPort}/`;
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const KEY = Object.freeze({ ESCAPE: '\uE00C', CONTROL: '\uE009', META: '\uE03D' });
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pass = (evidence = {}) => ({ status: 'PASS', evidence });
const na = (reason) => ({ status: 'N/A', reason });

if (!['chrome', 'edge', 'firefox', 'safari'].includes(browser)) throw new Error(`Unsupported RELEASE_QA_BROWSER: ${browser}`);
await mkdir(artifacts, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, appUrl).pathname);
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
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
await new Promise((resolveReady, rejectReady) => { server.once('error', rejectReady); server.listen(appPort, host, resolveReady); });

function driverExecutable() {
  if (process.env.RELEASE_QA_DRIVER) return process.env.RELEASE_QA_DRIVER;
  const windows = process.platform === 'win32';
  const normalize = (value, binary) => {
    if (!value) return null;
    if (existsSync(value) && statSync(value).isDirectory()) return join(value, windows ? `${binary}.exe` : binary);
    return value;
  };
  if (browser === 'chrome') return normalize(process.env.CHROMEWEBDRIVER, 'chromedriver') || 'chromedriver';
  if (browser === 'edge') return normalize(process.env.EDGEWEBDRIVER, 'msedgedriver') || 'msedgedriver';
  if (browser === 'firefox') return normalize(process.env.GECKOWEBDRIVER, 'geckodriver') || 'geckodriver';
  return '/usr/bin/safaridriver';
}
function capabilities() {
  if (browser === 'chrome') return { browserName: 'chrome', 'goog:chromeOptions': { args: ['--disable-search-engine-choice-screen', '--disable-dev-shm-usage'] } };
  if (browser === 'edge') return { browserName: 'MicrosoftEdge', 'ms:edgeOptions': { args: ['--disable-search-engine-choice-screen', '--disable-dev-shm-usage'] } };
  if (browser === 'firefox') return { browserName: 'firefox', 'moz:firefoxOptions': { args: [] } };
  return { browserName: 'safari' };
}

const driverLog = [];
const driver = spawn(driverExecutable(), browser === 'safari' ? ['-p', String(driverPort)] : [`--port=${driverPort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
driver.stdout.on('data', (chunk) => driverLog.push(chunk.toString()));
driver.stderr.on('data', (chunk) => driverLog.push(chunk.toString()));
let driverExited = false;
driver.once('exit', (code, signal) => { driverExited = true; driverLog.push(`[exit] ${code ?? signal}\n`); });
driver.once('error', (error) => driverLog.push(`[spawn] ${error.stack || error}\n`));

async function request(method, path, body, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${driverPort}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `${method} ${path} -> ${response.status}`);
    return payload.value;
  } finally { clearTimeout(timeout); }
}
async function waitDriver() {
  for (let i = 0; i < 160; i += 1) {
    if (driverExited) throw new Error(`WebDriver exited before ready. ${driverLog.join('')}`);
    try { const status = await request('GET', '/status', undefined, 1500); if (status?.ready !== false) return; } catch {}
    await delay(250);
  }
  throw new Error(`WebDriver did not become ready. ${driverLog.join('')}`);
}

let session = null;
const wd = (method, suffix, body, timeoutMs) => request(method, `/session/${session}${suffix}`, body, timeoutMs);
const execute = (script, args = []) => wd('POST', '/execute/sync', { script, args });
async function waitFor(script, label, attempts = 100) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try { if (await execute(`return Boolean(${script});`)) return; } catch (error) { last = error; }
    await delay(120);
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ''}`);
}
async function element(selector) {
  const result = await wd('POST', '/element', { using: 'css selector', value: selector });
  return result?.[ELEMENT];
}
async function click(selector) {
  const id = await element(selector);
  await wd('POST', `/element/${id}/click`, {});
}
async function key(value, modifier = null) {
  const actions = [];
  if (modifier) actions.push({ type: 'keyDown', value: modifier });
  actions.push({ type: 'keyDown', value }, { type: 'keyUp', value });
  if (modifier) actions.push({ type: 'keyUp', value: modifier });
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'release-keyboard', actions }] });
  await wd('DELETE', '/actions');
}
async function setWindow(width, height) {
  await wd('POST', '/window/rect', { x: 0, y: 0, width, height });
  await delay(250);
  return execute('return {outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio};');
}
async function screenshot(name) {
  const base64 = await wd('GET', '/screenshot');
  await writeFile(join(artifacts, name), Buffer.from(base64, 'base64'));
  return name;
}
async function canvasClick(x, y) {
  const canvas = await element('#game');
  const rect = await execute('const r=document.querySelector("#game").getBoundingClientRect(); return {width:r.width,height:r.height};');
  await wd('POST', '/actions', { actions: [{ type: 'pointer', id: 'release-pointer', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', duration: 0, origin: { [ELEMENT]: canvas }, x: Math.round(x - rect.width / 2), y: Math.round(y - rect.height / 2) },
    { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] });
  await wd('DELETE', '/actions');
  await delay(28);
}

async function layout() {
  return execute(`
    const rect=(el)=>{const r=el?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null};
    const topbar=document.querySelector('#topbar'), top=rect(topbar), card=rect(document.querySelector('.commandCardGrid'));
    const children=[...(topbar?.children||[])].map(el=>({id:el.id||el.className||el.tagName,display:getComputedStyle(el).display,...rect(el)}));
    const buttons=[...document.querySelectorAll('.commandCardAction')].map(el=>({id:el.dataset.commandId,group:el.dataset.commandGroup,fallback:el.dataset.iconStatus==='fallback',icon:Boolean(el.querySelector('.commandCardIcon')),...rect(el)}));
    const visible=children.filter(c=>c.display!=='none'&&c.width>0&&c.height>0);
    return { viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, topbar:top, children, commandPanel:rect(document.querySelector('#commandPanel')), card, buttons,
      topbarOverflow:Boolean(top&&visible.some(c=>c.left<top.left-.5||c.right>top.right+.5||c.top<top.top-.5||c.bottom>top.bottom+.5)),
      commandOverflow:Boolean(card&&buttons.some(b=>b.left<card.left-.5||b.right>card.right+.5||b.top<card.top-.5||b.bottom>card.bottom+.5)),
      viewportOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.documentElement.scrollHeight>document.documentElement.clientHeight,
      fallbackCount:buttons.filter(b=>b.fallback).length, missingIconCount:buttons.filter(b=>!b.icon).length,
      selectionName:document.querySelector('#selectionName')?.textContent||'', groups:[...new Set(buttons.map(b=>b.group))] };
  `);
}

async function findSelections() {
  const field = await execute(`const c=document.querySelector('#game').getBoundingClientRect(),p=document.querySelector('#commandPanel').getBoundingClientRect();return {width:c.width,maxY:Math.min(c.height-8,p.top-8)};`);
  const points = [];
  const seen = new Set();
  const add = (x, y) => { const key = `${Math.round(x)}:${Math.round(y)}`; if (!seen.has(key)) { seen.add(key); points.push([x, y]); } };
  // Dense starting-base scan first; units are small while buildings are large.
  for (let y = Math.max(210, field.maxY * 0.36); y < field.maxY - 30; y += 26) {
    for (let x = Math.max(150, field.width * 0.12); x < Math.min(field.width * 0.58, 720); x += 26) add(x, y);
  }
  // Coarser fallback over the playable field for browser/window variance.
  for (let y = 130; y < field.maxY - 20; y += 52) for (let x = 80; x < field.width - 80; x += 52) add(x, y);
  let unit = null, building = null;
  for (const [x, y] of points) {
    await canvasClick(x, y);
    const state = await layout();
    if (!unit && state.buttons.some((button) => button.id === 'attack-move')) unit = { x: Math.round(x), y: Math.round(y), name: state.selectionName };
    if (!building && state.groups.some((group) => ['production', 'modernization', 'construction'].includes(group))) building = { x: Math.round(x), y: Math.round(y), name: state.selectionName };
    if (unit && building) break;
  }
  return { unit, building };
}

async function ensureUtilityControlsVisible() {
  const snapshot = await layout();
  const fullscreen = snapshot.children.find((child) => child.id === 'viewportFullscreenToggle');
  assert(fullscreen && fullscreen.display !== 'none' && fullscreen.width > 0, `Fullscreen control unavailable: ${JSON.stringify(snapshot.children)}`);
  assert(!snapshot.topbarOverflow, `Topbar clips utility controls: ${JSON.stringify(snapshot.children)}`);
}

async function chromeViewport(width, height) {
  assert(browser === 'chrome', 'CDP viewport override is Chrome-only.');
  await wd('POST', '/goog/cdp/execute', { cmd: 'Emulation.setDeviceMetricsOverride', params: { width, height, deviceScaleFactor: 1, mobile: false } });
  await delay(250);
  return layout();
}
async function clearChromeViewport() {
  if (browser === 'chrome') await wd('POST', '/goog/cdp/execute', { cmd: 'Emulation.clearDeviceMetricsOverride', params: {} });
}

const report = {
  schema: 'fields-of-resolve.release-headed-browser-qa', version: 2, browser, headed: true, candidateCommit,
  runner: { os: process.env.ImageOS || process.platform, imageVersion: process.env.ImageVersion || null },
  tester: 'OpenAI assistant using native headed WebDriver and manual review of captured runtime screenshots',
  capabilities: null, surfaces: {}, uiReview: null, screenshots: [], status: 'FAIL',
};

try {
  await waitDriver();
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: capabilities() } }, 60_000);
  session = created?.sessionId || created?.value?.sessionId;
  report.capabilities = created?.capabilities || created?.value?.capabilities || {};
  assert(session, 'WebDriver session was not created.');

  await setWindow(1440, 900);
  await wd('POST', '/url', { url: appUrl });
  await waitFor(`document.readyState==='complete'&&document.querySelector('.missionCard button')&&window.__fieldsOfResolveComposition`, 'app startup', 140);
  await execute(`localStorage.setItem('fields-of-resolve.release-qa-sentinel','${candidateCommit}');`);
  await wd('POST', '/refresh', {});
  await waitFor(`document.readyState==='complete'&&document.querySelector('.missionCard button')&&window.__fieldsOfResolveComposition`, 'reload', 140);
  assert(await execute(`return localStorage.getItem('fields-of-resolve.release-qa-sentinel')==='${candidateCommit}';`), 'Storage sentinel did not survive reload.');
  report.surfaces.storage = pass({ persistedCommit: candidateCommit });
  await execute(`window.__releaseQaErrors=[];addEventListener('error',e=>window.__releaseQaErrors.push(String(e.message||e.error||'error')));addEventListener('unhandledrejection',e=>window.__releaseQaErrors.push(String(e.reason||'unhandled rejection')));const d=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all');d?.click();`);

  await click('.missionCard button');
  await waitFor(`document.querySelector('#missionSelect')?.classList.contains('hidden')&&document.querySelector('#missionTitle')?.textContent`, 'mission start', 140);
  await execute(`const d=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all');d?.click();`);

  const canvas = await execute(`const c=document.querySelector('#game'),r=c.getBoundingClientRect();return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,context:Boolean(c.getContext('2d'))};`);
  assert(canvas.context && canvas.width > 0 && canvas.height > 0 && canvas.cssWidth > 0 && canvas.cssHeight > 0, 'Canvas failed to initialize.');
  report.surfaces.canvas = pass(canvas);

  await click('#audioSettingsToggle');
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'audio settings');
  await execute(`const s=document.querySelector('[data-audio-level="music"]');s.value='43';s.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(`JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music===0.43`, 'audio persistence');
  const audio = await execute(`return {music:JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music,context:window.__fieldsOfResolveComposition.audio()?.output?.contextState||null};`);
  await click('#audioSettingsDone');
  assert(audio.music === 0.43, 'Audio level did not persist.');
  report.surfaces.audio = pass(audio);

  const selections = await findSelections();
  assert(selections.unit, 'Could not locate a live combat unit for keyboard QA.');
  await canvasClick(selections.unit.x, selections.unit.y);
  await key('q');
  await delay(180);
  const keyboard = await execute(`const b=document.querySelector('[data-command-id="attack-move"]');return {found:Boolean(b),targeting:b?.dataset?.targeting,ariaCurrent:b?.getAttribute('aria-current')};`);
  assert(keyboard.found && (keyboard.targeting === 'true' || keyboard.ariaCurrent === 'true'), 'Q did not arm attack-move.');
  report.surfaces.keyboard = pass({ ...keyboard, selected: selections.unit.name });

  await ensureUtilityControlsVisible();
  const fullscreenEnabled = await execute(`return Boolean(document.fullscreenEnabled&&document.querySelector('#viewportFullscreenToggle'));`);
  if (!fullscreenEnabled) report.surfaces.fullscreen = na('Standard Fullscreen API reports unavailable in this WebDriver session.');
  else {
    await click('#viewportFullscreenToggle');
    await waitFor(`document.fullscreenElement!==null`, 'fullscreen enter', 80);
    const entered = await execute('return {active:Boolean(document.fullscreenElement),width:innerWidth,height:innerHeight};');
    await key(KEY.ESCAPE);
    await waitFor(`document.fullscreenElement===null`, 'fullscreen exit', 80);
    if (await execute(`return Boolean(document.querySelector('#pauseMenu')&&!document.querySelector('#pauseMenu').classList.contains('hidden'));`)) await click('#pauseMenuClose');
    report.surfaces.fullscreen = pass(entered);
  }

  await setWindow(1440, 900);
  const beforeZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};');
  const modifier = process.platform === 'darwin' ? KEY.META : KEY.CONTROL;
  await key('+', modifier); await delay(450);
  let afterZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};');
  if (Math.abs(afterZoom.innerWidth - beforeZoom.innerWidth) < 8 && Math.abs(afterZoom.dpr - beforeZoom.dpr) < .01) { await key('=', modifier); await delay(450); afterZoom = await execute('return {innerWidth,innerHeight,dpr:devicePixelRatio};'); }
  assert(Math.abs(afterZoom.innerWidth - beforeZoom.innerWidth) >= 8 || Math.abs(afterZoom.dpr - beforeZoom.dpr) >= .01, `Browser zoom did not change layout metrics: ${JSON.stringify({ beforeZoom, afterZoom })}`);
  const zoomLayout = await layout();
  assert(!zoomLayout.topbarOverflow && !zoomLayout.commandOverflow, 'Zoom created HUD overflow.');
  await key('0', modifier); await delay(300);
  report.surfaces.dpi = pass({ beforeZoom, afterZoom });

  const perf = await wd('POST', '/execute/async', { script: `const done=arguments[arguments.length-1],s=[];let p=performance.now();const f=n=>{s.push(n-p);p=n;if(s.length>=90){const q=[...s].sort((a,b)=>a-b);done({frames:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,p95:q[Math.floor(q.length*.95)],max:Math.max(...s)})}else requestAnimationFrame(f)};requestAnimationFrame(f);`, args: [] }, 15_000);
  assert(perf.frames === 90 && perf.mean < 80 && perf.max < 750, `Frame pacing exceeded smoke bounds: ${JSON.stringify(perf)}`);
  report.surfaces.performance = pass(perf);

  if (browser === 'chrome' && process.platform === 'win32') {
    const reviews = [];
    for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1080]]) {
      const initial = await chromeViewport(width, height);
      assert(initial.viewport.width === width && initial.viewport.height === height, `Chrome viewport override failed for ${width}x${height}: ${JSON.stringify(initial.viewport)}`);
      const found = await findSelections();
      assert(found.unit && found.building, `Could not locate both unit and building at ${width}x${height}.`);

      await canvasClick(found.unit.x, found.unit.y);
      const unitLayout = await layout();
      assert(!unitLayout.topbarOverflow && !unitLayout.viewportOverflow && !unitLayout.commandOverflow, `Unit HUD overflow at ${width}x${height}.`);
      assert(unitLayout.fallbackCount === 0 && unitLayout.missingIconCount === 0, `Unit card icon failure at ${width}x${height}.`);
      assert(unitLayout.topbar?.height <= 64.5 && unitLayout.commandPanel?.height <= 176.5, `Unit HUD height budget exceeded at ${width}x${height}.`);
      const unitShot = await screenshot(`windows-chrome-${width}x${height}-unit.png`); report.screenshots.push(unitShot);

      await canvasClick(found.building.x, found.building.y);
      const buildingLayout = await layout();
      assert(!buildingLayout.topbarOverflow && !buildingLayout.viewportOverflow && !buildingLayout.commandOverflow, `Building HUD overflow at ${width}x${height}.`);
      assert(buildingLayout.fallbackCount === 0 && buildingLayout.missingIconCount === 0, `Building card icon failure at ${width}x${height}.`);
      assert(buildingLayout.groups.some((g) => ['production', 'modernization', 'construction'].includes(g)), `Building commands not classified at ${width}x${height}.`);
      assert(buildingLayout.topbar?.height <= 64.5 && buildingLayout.commandPanel?.height <= 176.5, `Building HUD height budget exceeded at ${width}x${height}.`);
      const buildingShot = await screenshot(`windows-chrome-${width}x${height}-building.png`); report.screenshots.push(buildingShot);
      reviews.push({ viewport: { width, height }, unit: { selection: found.unit, layout: unitLayout }, building: { selection: found.building, layout: buildingLayout } });
    }
    await clearChromeViewport();
    report.uiReview = { issue: 183, status: 'PASS', mode: 'native headed Windows Chrome with DevTools viewport override; screenshots manually reviewed', viewports: reviews };
  }

  const runtimeErrors = await execute('return window.__releaseQaErrors||[];');
  assert(runtimeErrors.length === 0, `Runtime errors: ${runtimeErrors.join('; ')}`);
  const required = ['keyboard', 'audio', 'canvas', 'storage', 'fullscreen', 'dpi', 'performance'];
  assert(required.every((name) => ['PASS', 'N/A'].includes(report.surfaces[name]?.status)), `Incomplete browser matrix: ${JSON.stringify(report.surfaces)}`);
  report.runtimeErrors = runtimeErrors;
  report.status = 'PASS';
  report.screenshots.push(await screenshot(`${browser}-final.png`));
  await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[release-headed-browser-qa-v2] ${browser} PASS ${report.capabilities?.browserVersion || 'unknown'} ${required.map((name) => `${name}=${report.surfaces[name].status}`).join(' ')}`);
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack || String(error);
  try { if (session) report.screenshots.push(await screenshot(`${browser}-failure.png`)); } catch {}
  await writeFile(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifacts, 'driver.log'), `${driverLog.join('')}\n${error.stack || error}\n`);
  throw error;
} finally {
  try { await clearChromeViewport(); } catch {}
  if (session) try { await request('DELETE', `/session/${session}`, undefined, 5000); } catch {}
  if (!driverExited) driver.kill('SIGTERM');
  await delay(500);
  if (!driverExited) driver.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
}
