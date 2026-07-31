import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4173;
const browserPort = 9222;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

await mkdir(artifacts, { recursive: true });
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  (process.env.PATH || '').split(':').some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error('Invalid path');
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((resolveReady) => server.listen(port, host, resolveReady));

const logs = [];
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${browserPort}`, '--user-data-dir=/tmp/ufrts-smoke-profile',
  `http://${host}:${port}/`,
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (chunk) => logs.push(chunk.toString()));

let socket;
let nextId = 1;
const pending = new Map();
const events = [];
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://${host}:${browserPort}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page');
      if (target?.webSocketDebuggerUrl) {
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolveOpen, rejectOpen) => {
          socket.addEventListener('open', resolveOpen, { once: true });
          socket.addEventListener('error', rejectOpen, { once: true });
        });
        socket.addEventListener('message', ({ data }) => {
          const message = JSON.parse(data);
          if (message.id && pending.has(message.id)) {
            const { resolve: resolveCall, reject } = pending.get(message.id);
            pending.delete(message.id);
            message.error ? reject(new Error(message.error.message)) : resolveCall(message.result);
          } else if (message.method) events.push(message);
        });
        return;
      }
    } catch {}
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not become available.');
}

function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCall, reject) => pending.set(id, { resolve: resolveCall, reject }));
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await delay(1500);
  await call('Runtime.evaluate', { expression: `document.querySelector('.missionCard button')?.click()` });
  await delay(1500);
  const result = await call('Runtime.evaluate', {
    expression: `JSON.stringify({ title: document.querySelector('#missionTitle')?.textContent, hidden: document.querySelector('#missionSelect')?.classList.contains('hidden'), canvas: document.querySelector('#game')?.width > 0 })`,
    returnByValue: true,
  });
  const state = JSON.parse(result.result.value);
  const failures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error'),
  );
  const warnings = events.filter((event) =>
    event.method === 'Log.entryAdded' && event.params?.entry?.level === 'warning',
  );
  if (!state.title || !state.hidden || !state.canvas || failures.length) {
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(artifacts, 'browser-startup-failure.png'), Buffer.from(shot.data, 'base64'));
    throw new Error(`Browser smoke failed: ${JSON.stringify({ state, failures, warnings })}`);
  }
  await writeFile(join(artifacts, 'browser-startup-smoke.json'), JSON.stringify({ status: 'passed', state, warnings }, null, 2));
  console.log(`[browser-smoke] mission started: ${state.title}; warnings: ${warnings.length}`);
} catch (error) {
  await writeFile(join(artifacts, 'browser-startup.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  server.close();
}
