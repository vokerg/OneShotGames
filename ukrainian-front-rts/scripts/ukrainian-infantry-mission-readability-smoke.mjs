#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/ukrainian-infantry-mission-readability');
const host = '127.0.0.1';
const port = 4177;
const browserPort = 9227;
const pageUrl = `http://${host}:${port}/`;
const uaReviewAnchor = Object.freeze({ xRatio: 0.27, yRatio: 0.49 });
const ruReviewAnchor = Object.freeze({ xRatio: 0.5, yRatio: 0.5 });
const world = Object.freeze({ width: 2560, height: 1664 });
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

function findBrowser() {
  const entries = (process.env.PATH || '').split(delimiter);
  return process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
    .find((name) => entries.some((directory) => existsSync(join(directory, name))));
}

await mkdir(artifacts, { recursive: true });
const browser = findBrowser();
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The mission readability smoke requires the Node.js WebSocket global.');

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
await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(port, host, resolveReady);
});

const profile = await mkdtemp(join(tmpdir(), 'ufrts-infantry-readability-'));
const logs = [];
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--window-size=1600,1000',
  `--remote-debugging-port=${browserPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (chunk) => logs.push(chunk.toString()));
let chromeExited = false;
const chromeExit = new Promise((resolveExit) => {
  chrome.once('exit', (code, signal) => {
    chromeExited = true;
    logs.push(`[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    resolveExit();
  });
});

let socket;
let nextId = 1;
const pending = new Map();
const events = [];

async function connect() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
      logs.push(`[connect ${attempt + 1}] ${error.message}\n`);
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
  });
  if (evaluation.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${evaluation.exceptionDetails.text || 'unknown error'}`);
  }
  return evaluation.result?.value;
}

async function waitFor(expression, description, { awaitPromise = false } = {}) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const value = await evaluate(expression, { awaitPromise });
      if (value) return value;
    } catch (error) {
      logs.push(`[wait ${description}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function capture(name) {
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(shot.data, 'base64');
  if (bytes.length < 10_000) throw new Error(`${name} screenshot is unexpectedly small (${bytes.length} bytes).`);
  await writeFile(resolve(artifacts, name), bytes);
  return bytes.length;
}

async function wheel(deltaY, count, anchor = uaReviewAnchor) {
  await evaluate(`(() => {
    const canvas = document.querySelector('#game');
    const x = Math.round(innerWidth * ${anchor.xRatio});
    const y = Math.round(innerHeight * ${anchor.yRatio});
    for (let index = 0; index < ${count}; index += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        deltaY: ${deltaY},
      }));
    }
  })()`);
  await delay(350);
}

async function focusMinimap(worldX, worldY) {
  await evaluate(`(() => {
    const minimap = document.querySelector('#minimap');
    const bounds = minimap.getBoundingClientRect();
    minimap.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * ${worldX / world.width},
      clientY: bounds.top + bounds.height * ${worldY / world.height},
      button: 0,
    }));
  })()`);
  await delay(350);
}

async function focusObservedInfantry(faction, label) {
  const observed = await waitFor(
    `window.__infantryReview?.last?.${faction}`,
    `${label} render observation`,
  );
  await focusMinimap(observed.worldX, observed.worldY);
  return waitFor(
    `(() => {
      const point = window.__infantryReview?.last?.${faction};
      return point
        && point.screenX >= 160 && point.screenX <= 1440
        && point.screenY >= 130 && point.screenY <= 640
        ? point
        : false;
    })()`,
    `${label} visible inside battlefield review viewport`,
  );
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.missionCard button')`, 'mission selection');
  await evaluate(`document.querySelector('.missionCard button').click()`);
  const missionTitle = await waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && document.querySelector('#missionTitle')?.textContent`,
    'first mission start',
  );
  await waitFor(
    `(async () => {
      const { Renderer } = await import('./src/render.js');
      const ua = Renderer.prototype.ukrainianInfantryAtlasStatus?.();
      const ru = Renderer.prototype.russianInfantryAtlasStatus?.();
      return ua?.ready === true && ru?.ready === true;
    })()`,
    'both infantry atlases readiness',
    { awaitPromise: true },
  );
  await delay(600);
  await evaluate(`(async () => {
    const { Renderer } = await import('./src/render.js');
    if (!window.__infantryReview?.installed) {
      const originalUnit = Renderer.prototype.unit;
      window.__infantryReview = { installed: true, last: { ua: null, ru: null } };
      Renderer.prototype.unit = function infantryReviewObservedUnit(entity) {
        const result = originalUnit.call(this, entity);
        const faction = entity?.type === 'uaInfantry' ? 'ua' : entity?.type === 'ruInfantry' ? 'ru' : null;
        if (faction && Number.isFinite(entity.x) && Number.isFinite(entity.y)) {
          const screen = this.sp(entity.x, entity.y);
          window.__infantryReview.last[faction] = {
            type: entity.type,
            worldX: entity.x,
            worldY: entity.y,
            screenX: screen.x,
            screenY: screen.y,
            zoom: this.g?.camera?.z,
          };
        }
        return result;
      };
    }
    return true;
  })()`, { awaitPromise: true });
  await waitFor(`window.__infantryReview?.last?.ua && window.__infantryReview?.last?.ru`, 'live UA/RU infantry draw observations');

  const captures = [];
  await focusObservedInfantry('ua', 'Ukrainian infantry at command zoom');
  captures.push({ faction: 'ua', file: 'command-color.png', expectedZoom: 1, bytes: await capture('command-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at strategic zoom');
  captures.push({ faction: 'ua', file: 'strategic-color.png', expectedZoom: 0.55, bytes: await capture('strategic-color.png') });

  await wheel(-120, 20, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at inspection zoom');
  captures.push({ faction: 'ua', file: 'inspection-color.png', expectedZoom: 1.45, bytes: await capture('inspection-color.png') });

  await wheel(120, 10, uaReviewAnchor);
  await focusObservedInfantry('ua', 'Ukrainian infantry at strategic value zoom');
  await evaluate(`document.documentElement.style.filter = 'grayscale(1)'`);
  await delay(150);
  captures.push({ faction: 'ua', file: 'strategic-value.png', expectedZoom: 0.55, bytes: await capture('strategic-value.png') });
  await evaluate(`document.documentElement.style.filter = ''`);

  await wheel(-120, 20, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at inspection zoom');
  captures.push({ faction: 'ru', file: 'ru-inspection-color.png', expectedZoom: 1.45, bytes: await capture('ru-inspection-color.png') });

  await wheel(120, 4, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at command zoom');
  captures.push({ faction: 'ru', file: 'ru-command-color.png', expectedZoom: 0.95, bytes: await capture('ru-command-color.png') });

  await wheel(120, 12, ruReviewAnchor);
  await focusObservedInfantry('ru', 'Russian infantry at strategic zoom');
  captures.push({ faction: 'ru', file: 'ru-strategic-color.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-color.png') });

  await focusObservedInfantry('ru', 'Russian infantry at strategic value zoom');
  await evaluate(`document.documentElement.style.filter = 'grayscale(1)'`);
  await delay(150);
  captures.push({ faction: 'ru', file: 'ru-strategic-value.png', expectedZoom: 0.55, bytes: await capture('ru-strategic-value.png') });
  await evaluate(`document.documentElement.style.filter = ''`);

  const observedInfantry = await evaluate(`window.__infantryReview?.last`);

  const atlasStatus = await evaluate(`(async () => {
    const { Renderer } = await import('./src/render.js');
    return {
      ukrainian: Renderer.prototype.ukrainianInfantryAtlasStatus?.(),
      russian: Renderer.prototype.russianInfantryAtlasStatus?.(),
    };
  })()`, { awaitPromise: true });
  const failures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || event.method === 'Inspector.targetCrashed'
    || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
    || (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  const atlasFailure = Object.values(atlasStatus ?? {}).some((status) => !status?.ready || status.degraded || status.error);
  if (atlasFailure || failures.length) {
    throw new Error(`Mission readability browser review failed: ${JSON.stringify({ atlasStatus, failures })}`);
  }

  const manifest = {
    status: 'passed',
    missionTitle,
    atlasStatus,
    viewport: { width: 1600, height: 1000 },
    captures,
    observedInfantry,
    review: {
      strategicZoom: 0.55,
      commandZoom: '0.95-1.0',
      inspectionZoom: 1.45,
      grayscale: true,
      uaZoomAnchor: uaReviewAnchor,
      ruZoomAnchor: ruReviewAnchor,
      observer: 'live Renderer.prototype.unit draw coordinates',
      surface: 'actual mission runtime',
      factions: ['ua', 'ru'],
    },
  };
  await writeFile(resolve(artifacts, 'mission-readability-smoke.json'), JSON.stringify(manifest, null, 2));
  console.log(`[infantry-mission-readability] captured ${captures.length} actual-mission reviews for ${missionTitle}`);
} catch (error) {
  await writeFile(resolve(artifacts, 'mission-readability-failure.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2000)]);
  if (!chromeExited) chrome.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
