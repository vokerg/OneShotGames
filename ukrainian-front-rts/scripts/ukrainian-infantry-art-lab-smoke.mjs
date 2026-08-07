import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedArtifactDir = process.argv.find((argument) => argument.startsWith('--artifact-dir='))?.split('=')[1];
const artifacts = requestedArtifactDir
  ? resolve(root, requestedArtifactDir)
  : join(root, 'artifacts', 'ukrainian-infantry-art-lab');
const host = '127.0.0.1';
const serverPort = 4178;
const browserPort = 9228;
const pageUrl = `http://${host}:${serverPort}/art-lab.html`;
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
};
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The Art Lab smoke requires the Node.js WebSocket global.');

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }
    const requested = pathname === '/' ? 'art-lab.html' : pathname.replace(/^\/+/, '');
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
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(serverPort, host, resolveReady);
});

const profile = await mkdtemp(join(tmpdir(), 'ufrts-ua-infantry-art-lab-'));
const browserLogs = [];
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--window-size=1280,720',
  `--remote-debugging-port=${browserPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (chunk) => browserLogs.push(chunk.toString()));
chrome.on('error', (error) => browserLogs.push(`[spawn] ${error.stack || error.message}\n`));
let chromeExited = false;
const chromeExit = new Promise((resolveExit) => {
  chrome.once('exit', (code, signal) => {
    chromeExited = true;
    browserLogs.push(`[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    resolveExit();
  });
});

let socket;
let nextId = 1;
const pending = new Map();
const events = [];

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (chromeExited) throw new Error('Chrome exited before the DevTools endpoint became available.');
    try {
      const response = await fetch(`http://${host}:${browserPort}/json`);
      if (!response.ok) throw new Error(`DevTools target listing returned ${response.status}.`);
      const targets = await response.json();
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
            const entry = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(entry.timeout);
            message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
          } else if (message.method) {
            events.push(message);
          }
        });
        socket.addEventListener('close', () => {
          for (const entry of pending.values()) {
            clearTimeout(entry.timeout);
            entry.reject(new Error('Chrome DevTools socket closed.'));
          }
          pending.clear();
        }, { once: true });
        return;
      }
    } catch (error) {
      browserLogs.push(`[connect ${attempt + 1}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not become available.');
}

function call(method, params = {}, timeoutMilliseconds = 8000) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`Cannot call ${method}: DevTools socket is not open.`));
  }
  const id = nextId++;
  return new Promise((resolveCall, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome DevTools call timed out: ${method}`));
    }, timeoutMilliseconds);
    pending.set(id, { reject, resolve: resolveCall, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, { awaitPromise = false } = {}) {
  const evaluation = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  }, awaitPromise ? 30000 : 8000);
  if (evaluation.exceptionDetails) {
    const exception = evaluation.exceptionDetails.exception?.description
      || evaluation.exceptionDetails.text
      || 'unknown error';
    throw new Error(`Browser evaluation failed: ${exception}`);
  }
  return evaluation.result?.value;
}

async function waitFor(expression, description) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch (error) {
      browserLogs.push(`[wait ${description}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function capture(name) {
  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const file = join(artifacts, name);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  return name;
}

async function dispatchKey(key, code) {
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, bubbles: true }))`);
  await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, { awaitPromise: true });
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url: pageUrl });
  await waitFor(
    `document.readyState === 'complete' && document.querySelector('#game')?.width > 0 && document.querySelector('.panel')?.textContent.includes('UFR-110')`,
    'the Art Lab canvas and instructions',
  );

  const review = JSON.parse(await evaluate(`(async () => {
    const module = await import('/src/render/ukrainian-infantry-atlas.js');
    const runtime = await module.loadUkrainianInfantryAtlas();
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const combinations = [];
    for (const unitId of module.UKRAINIAN_INFANTRY_UNIT_IDS) {
      for (const state of module.UKRAINIAN_INFANTRY_STATES) {
        for (const direction of module.UKRAINIAN_INFANTRY_DIRECTIONS) {
          const animationId = module.ukrainianInfantryAnimationId(unitId, state);
          const resolved = runtime.drawAnimation(context, animationId, {
            x: 64,
            y: 84,
            elapsedMs: 173,
            direction,
            scale: 1,
          });
          if (!resolved?.frameId || !runtime.manifest.animations[animationId]) {
            throw new Error('Unresolved browser atlas combination: ' + [unitId, state, direction].join('/'));
          }
          context.clearRect(0, 0, canvas.width, canvas.height);
          combinations.push(unitId + '/' + state + '/' + direction);
        }
      }
    }
    return JSON.stringify({
      units: module.UKRAINIAN_INFANTRY_UNIT_IDS,
      states: module.UKRAINIAN_INFANTRY_STATES,
      directions: module.UKRAINIAN_INFANTRY_DIRECTIONS,
      combinationsReviewed: combinations.length,
      degraded: runtime.degraded,
      loadError: runtime.loadError ? String(runtime.loadError) : null,
      atlasId: runtime.manifest.id,
      frameCount: Object.keys(runtime.manifest.frames).length,
      animationCount: Object.keys(runtime.manifest.animations).length,
      catalogCounts: runtime.catalog.counts,
      generatedSvgBytes: runtime.generatedSvgBytes,
      canvas: {
        width: document.querySelector('#game').width,
        height: document.querySelector('#game').height,
      },
    });
  })()`, { awaitPromise: true }));

  const requiredStates = ['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck'];
  const reviewFailures = [];
  if (review.units.length !== 7) reviewFailures.push(`expected 7 units, found ${review.units.length}`);
  if (review.directions.length !== 8) reviewFailures.push(`expected 8 directions, found ${review.directions.length}`);
  if (requiredStates.some((state) => !review.states.includes(state))) reviewFailures.push('required state coverage is incomplete');
  if (review.combinationsReviewed !== 392) reviewFailures.push(`expected 392 browser draws, found ${review.combinationsReviewed}`);
  if (review.degraded || review.loadError) reviewFailures.push(`atlas loaded in degraded mode: ${review.loadError || 'unknown error'}`);
  if (review.frameCount !== 1191) reviewFailures.push(`expected 1191 frames, found ${review.frameCount}`);
  if (review.animationCount !== 49) reviewFailures.push(`expected 49 animations, found ${review.animationCount}`);
  if (review.canvas.width < 1280 || review.canvas.height < 720) reviewFailures.push(`unexpected canvas ${review.canvas.width}x${review.canvas.height}`);

  await delay(350);
  await evaluate(`document.querySelector('.panel')?.classList.add('hidden')`);
  await waitFor(`document.querySelector('.panel')?.classList.contains('hidden')`, 'the Art Lab instructions to clear the review surface');
  const screenshots = [];

  await dispatchKey('u', 'KeyU');
  screenshots.push(await capture('command-move-east-color.png'));

  await dispatchKey('u', 'KeyU');
  await dispatchKey('r', 'KeyR');
  await dispatchKey('r', 'KeyR');
  await dispatchKey('v', 'KeyV');
  await dispatchKey('1', 'Digit1');
  screenshots.push(await capture('strategic-attack-south-value.png'));

  await dispatchKey('v', 'KeyV');
  await dispatchKey('3', 'Digit3');
  for (let index = 0; index < 3; index += 1) await dispatchKey('u', 'KeyU');
  for (let index = 0; index < 3; index += 1) await dispatchKey('r', 'KeyR');
  await dispatchKey(' ', 'Space');
  screenshots.push(await capture('inspection-death-northwest-still.png'));

  const runtimeFailures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || event.method === 'Inspector.targetCrashed'
    || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
    || (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  const warnings = events.filter((event) =>
    event.method === 'Log.entryAdded' && event.params?.entry?.level === 'warning',
  );
  if (runtimeFailures.length) reviewFailures.push(`${runtimeFailures.length} browser runtime/network error event(s)`);

  const result = {
    status: reviewFailures.length ? 'failed' : 'passed',
    viewport: '1280x720@1x',
    review,
    screenshots,
    warnings,
    failures: reviewFailures,
    runtimeFailures,
  };
  await writeFile(join(artifacts, 'ukrainian-infantry-art-lab-smoke.json'), JSON.stringify(result, null, 2));
  if (reviewFailures.length) throw new Error(`UFR-110 Art Lab browser smoke failed: ${reviewFailures.join('; ')}`);
  console.log(
    `[ufr-110-art-lab] ${review.combinationsReviewed} combinations rendered; `
    + `${review.frameCount} frames; ${review.animationCount} animations; screenshots: ${screenshots.join(', ')}`,
  );
} catch (error) {
  try {
    await capture('failure.png');
  } catch (screenshotError) {
    browserLogs.push(`[screenshot] ${screenshotError.stack || screenshotError.message}\n`);
  }
  await writeFile(join(artifacts, 'ukrainian-infantry-art-lab-smoke.log'), `${browserLogs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(3000)]);
  if (!chromeExited) chrome.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
