import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateAutoplayResumeTrace } from '../src/audio/audio-release-qa.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4174;
const browserPort = 9223;
const pageUrl = `http://${host}:${port}/`;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) => pathEntries.some((directory) => existsSync(join(directory, name))));
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The browser audio smoke requires the Node.js WebSocket global.');

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

const profile = await mkdtemp(join(tmpdir(), 'ufrts-audio-release-'));
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

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && window.__fieldsOfResolveComposition?.audio()?.settings`, 'audio composition');

  const trace = [{ state: await evaluate(`window.__fieldsOfResolveComposition.audio().mixer.status`), cause: 'startup' }];
  await evaluate(`(() => {
    const toggle = document.querySelector('#audioSettingsToggle');
    toggle.focus();
    toggle.click();
    const policy = document.querySelector('[data-audio-setting="backgroundPolicy"]');
    policy.value = 'pause';
    policy.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#audioSettingsDone').click();
  })()`);
  await waitFor(`window.__fieldsOfResolveComposition.audio().settings.settings.settings.backgroundPolicy === 'pause'`, 'pause background policy');

  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 8, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 8, button: 'left', clickCount: 1 });
  await waitFor(`window.__fieldsOfResolveComposition.audio().mixer.status === 'running'`, 'gesture audio unlock');
  trace.push({ state: 'running', cause: 'user-gesture' });

  await evaluate(`(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(`window.__fieldsOfResolveComposition.audio().mixer.status === 'paused'`, 'background audio pause');
  trace.push({ state: 'paused', cause: 'visibility' });

  await evaluate(`(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await waitFor(`window.__fieldsOfResolveComposition.audio().mixer.status === 'running'`, 'foreground audio resume');
  trace.push({ state: 'running', cause: 'resume' });
  await evaluate(`delete document.hidden`);

  const mixer = JSON.parse(await evaluate(`JSON.stringify(window.__fieldsOfResolveComposition.audio().mixer)`));
  const lifecycle = validateAutoplayResumeTrace(trace);
  const pageFailures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Inspector.targetCrashed' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params?.canceled));
  const diagnosticErrors = mixer.diagnostics.filter((entry) => entry.kind === 'error');
  if (!lifecycle.ok || pageFailures.length || diagnosticErrors.length) {
    throw new Error(`Browser audio release smoke failed: ${JSON.stringify({ lifecycle, pageFailures, diagnosticErrors })}`);
  }
  await writeFile(join(artifacts, 'audio-release-browser-smoke.json'), JSON.stringify({ status: 'passed', trace, mixer, pageFailures }, null, 2));
  console.log(`[audio-release-browser] gesture unlock, background pause, and foreground resume passed with ${diagnosticErrors.length} audio errors.`);
} catch (error) {
  await writeFile(join(artifacts, 'audio-release-browser.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2000)]);
  if (!chromeExited) chrome.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
}
