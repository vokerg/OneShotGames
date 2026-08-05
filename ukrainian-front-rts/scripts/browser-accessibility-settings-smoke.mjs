import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ACCESSIBILITY_SETTINGS_STORAGE_KEY } from '../src/audio/accessibility-settings.js';
import { ACCESSIBILITY_FOCUS_PAUSE_REASON } from '../src/core/accessibility-events.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4176;
const browserPort = 9225;
const pageUrl = `http://${host}:${port}/`;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) => pathEntries.some((directory) => existsSync(join(directory, name))));
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The browser accessibility smoke requires the Node.js WebSocket global.');

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
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(port, host, resolveReady);
});

const profile = await mkdtemp(join(tmpdir(), 'ufrts-accessibility-settings-'));
const logs = [];
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (chunk) => logs.push(chunk.toString()));
chrome.on('error', (error) => logs.push(`[spawn] ${error.stack || error.message}\n`));
let chromeExited = false;
const chromeExit = new Promise((resolveExit) => chrome.once('exit', (code, signal) => {
  chromeExited = true;
  logs.push(`[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
  resolveExit();
}));

let socket;
let nextId = 1;
const pending = new Map();
const events = [];

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (chromeExited) throw new Error('Chrome exited before DevTools became available.');
    try {
      const response = await fetch(`http://${host}:${browserPort}/json`);
      const target = response.ok ? (await response.json()).find((entry) => entry.type === 'page') : null;
      if (target?.webSocketDebuggerUrl) {
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolveOpen, rejectOpen) => {
          socket.addEventListener('open', resolveOpen, { once: true });
          socket.addEventListener('error', rejectOpen, { once: true });
        });
        socket.addEventListener('message', ({ data }) => {
          const message = JSON.parse(data);
          if (message.id && pending.has(message.id)) {
            const entry = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(entry.timeout);
            message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
          } else if (message.method) events.push(message);
        });
        return;
      }
    } catch (error) {
      logs.push(`[connect ${attempt + 1}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not become available.');
}

function call(method, params = {}, timeoutMilliseconds = 5000) {
  const id = nextId++;
  return new Promise((resolveCall, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome DevTools call timed out: ${method}`)); }, timeoutMilliseconds);
    pending.set(id, { resolve: resolveCall, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text || 'unknown error'}`);
  return result.result?.value;
}

async function waitFor(expression, description) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

const pauseSnapshotExpression = `window.__fieldsOfResolveAccessibilityPause.snapshot()`;
const settingsSnapshotExpression = `window.__fieldsOfResolveComposition.audio().settings.accessibility.controller.settings`;

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && window.__fieldsOfResolveComposition?.audio()?.settings?.accessibility?.controller && window.__fieldsOfResolveAccessibilityPause?.snapshot`, 'accessibility settings composition');

  const initialPause = JSON.parse(await evaluate(`JSON.stringify(${pauseSnapshotExpression})`));
  await evaluate(`(() => {
    document.querySelector('#audioSettingsToggle').click();
    const setSelect = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setCheckbox = (selector, checked) => {
      const control = document.querySelector(selector);
      control.checked = checked;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setSelect('[data-accessibility-setting="uiScale"]', '1.15');
    setSelect('[data-accessibility-setting="textScale"]', '1.3');
    setSelect('[data-accessibility-setting="colorVisionPreset"]', 'deuteranopia');
    setSelect('[data-accessibility-setting="contrastMode"]', 'high');
    setSelect('[data-accessibility-setting="cursorSize"]', 'large');
    setCheckbox('[data-accessibility-setting="reducedMotion"]', true);
    setCheckbox('[data-accessibility-setting="reduceFlashes"]', true);
    const binding = document.querySelector('[data-accessibility-action="attackMove"]');
    binding.value = 'z';
    document.querySelector('[data-accessibility-assign="attackMove"]').click();
  })()`);
  await waitFor(`${settingsSnapshotExpression}.uiScale === 1.15 && ${settingsSnapshotExpression}.textScale === 1.3 && ${settingsSnapshotExpression}.actionBindings.attackMove[0] === 'z'`, 'persisted visual settings and attack-move binding');
  await waitFor(`document.documentElement.dataset.accessibilityContrast === 'high' && document.documentElement.dataset.accessibilityReducedMotion === 'true' && document.documentElement.dataset.accessibilityCursorSize === 'large'`, 'live accessibility attributes');

  const persisted = JSON.parse(await evaluate(`localStorage.getItem(${JSON.stringify(ACCESSIBILITY_SETTINGS_STORAGE_KEY)})`));
  if (persisted.uiScale !== 1.15 || persisted.textScale !== 1.3 || persisted.actionBindings.attackMove[0] !== 'z') {
    throw new Error(`Accessibility persistence mismatch: ${JSON.stringify(persisted)}`);
  }

  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await waitFor(`${pauseSnapshotExpression}.reasons.includes(${JSON.stringify(ACCESSIBILITY_FOCUS_PAUSE_REASON)})`, 'focus-loss pause reason');
  await waitFor(`document.documentElement.dataset.accessibilityFocusPaused === 'true'`, 'focus-loss visual state');
  const blurredPause = JSON.parse(await evaluate(`JSON.stringify(${pauseSnapshotExpression})`));

  await evaluate(`window.dispatchEvent(new Event('focus'))`);
  await waitFor(`!${pauseSnapshotExpression}.reasons.includes(${JSON.stringify(ACCESSIBILITY_FOCUS_PAUSE_REASON)})`, 'focus-return pause release');
  const restoredPause = JSON.parse(await evaluate(`JSON.stringify(${pauseSnapshotExpression})`));
  if (JSON.stringify(restoredPause.reasons) !== JSON.stringify(initialPause.reasons) || restoredPause.paused !== initialPause.paused) {
    throw new Error(`Focus resume changed pre-existing pause ownership: ${JSON.stringify({ initialPause, restoredPause })}`);
  }

  await evaluate(`(() => {
    const control = document.querySelector('[data-accessibility-setting="pauseOnFocusLoss"]');
    control.checked = false;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
  })()`);
  await delay(250);
  const disabledPause = JSON.parse(await evaluate(`JSON.stringify(${pauseSnapshotExpression})`));
  const disabledFocusMarker = await evaluate(`document.documentElement.hasAttribute('data-accessibility-focus-paused')`);
  if (JSON.stringify(disabledPause.reasons) !== JSON.stringify(initialPause.reasons) || disabledFocusMarker) {
    throw new Error(`Disabled focus pause still changed runtime state: ${JSON.stringify({ initialPause, disabledPause, disabledFocusMarker })}`);
  }
  await evaluate(`window.dispatchEvent(new Event('focus'))`);

  const settings = JSON.parse(await evaluate(`JSON.stringify(${settingsSnapshotExpression})`));
  const pageFailures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Inspector.targetCrashed' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params?.canceled));
  if (pageFailures.length) throw new Error(`Browser accessibility smoke page failures: ${JSON.stringify(pageFailures)}`);

  const report = { status: 'passed', settings, initialPause, blurredPause, restoredPause, disabledPause, pageFailures };
  await writeFile(join(artifacts, 'accessibility-settings-browser-smoke.json'), JSON.stringify(report, null, 2));
  console.log(`[accessibility-browser] visual settings, persisted rebinding, and focus pause ownership passed with ${pageFailures.length} page failures.`);
} catch (error) {
  await writeFile(join(artifacts, 'accessibility-settings-browser.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2000)]);
  if (!chromeExited) chrome.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
}
