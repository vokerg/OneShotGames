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

function infantryObservationExpression(faction) {
  const type = faction === 'ua' ? 'uaInfantry' : 'ruInfantry';
  return `(() => {
    const game = window.__infantryReview?.game;
    const renderer = window.__infantryReview?.renderer;
    const entity = game?.units?.find((candidate) => candidate?.type === '${type}');
    if (!game || !renderer || !entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return false;
    const screen = renderer.sp(entity.x, entity.y);
    return {
      id: entity.id,
      type: entity.type,
      worldX: entity.x,
      worldY: entity.y,
      screenX: screen.x,
      screenY: screen.y,
      zoom: game.camera?.z,
      cameraX: game.camera?.x,
      cameraY: game.camera?.y,
    };
  })()`;
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
    if (requested === 'src/main.js') {
      const source = await readFile(file, 'utf8');
      response.end(`${source}\nwindow.__infantryReview = Object.freeze({ game, renderer });\n`);
      return;
    }
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

async function wheel(deltaY, count, anchor) {
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
  await delay(120);
}

async function setZoom(target, anchor, label) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const zoom = await evaluate(`window.__infantryReview?.game?.camera?.z`);
    if (Number.isFinite(zoom) && Math.abs(zoom - target) <= 0.03) return zoom;
    if (!Number.isFinite(zoom)) {
      await delay(100);
      continue;
    }
    await wheel(zoom < target ? -120 : 120, 1, anchor);
  }
  const zoom = await evaluate(`window.__infantryReview?.game?.camera?.z`);
  throw new Error(`Could not reach ${label} zoom ${target}; current zoom is ${zoom}.`);
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
  const expression = infantryObservationExpression(faction);
  const observed = await waitFor(expression, `${label} live runtime observation`);
  await focusMinimap(observed.worldX, observed.worldY);
  return waitFor(
    `(() => {
      const point = ${expression};
      return point
        && point.screenX >= 160 && point.screenX <= 1440
        && point.screenY >= 130 && point.screenY <= 640
        ? point
        : false;
    })()`,
    `${label} visible inside battlefield review viewport`,
  );
}

async function captureReview({ faction, label, zoom, file, grayscale = false, anchor }) {
  const actualZoom = await setZoom(zoom, anchor, label);
  const observed = await focusObservedInfantry(faction, label);
  if (grayscale) {
    await evaluate(`document.documentElement.style.filter = 'grayscale(1)'`);
    await delay(150);
  }
  try {
    return {
      faction,
      file,
      expectedZoom: zoom,
      actualZoom,
      observed,
      grayscale,
      bytes: await capture(file),
    };
  } finally {
    if (grayscale) await evaluate(`document.documentElement.style.filter = ''`);
  }
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(
    `document.readyState === 'complete' && window.__infantryReview?.game && window.__infantryReview?.renderer && document.querySelector('.missionCard button')`,
    'mission selection and runtime review bridge',
  );
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
  await waitFor(infantryObservationExpression('ua'), 'live Ukrainian infantry runtime entity');
  await waitFor(infantryObservationExpression('ru'), 'live Russian infantry runtime entity');
  await delay(300);

  const captures = [];
  captures.push(await captureReview({ faction: 'ua', label: 'Ukrainian infantry at command zoom', zoom: 1, file: 'command-color.png', anchor: uaReviewAnchor }));
  captures.push(await captureReview({ faction: 'ua', label: 'Ukrainian infantry at strategic zoom', zoom: 0.55, file: 'strategic-color.png', anchor: uaReviewAnchor }));
  captures.push(await captureReview({ faction: 'ua', label: 'Ukrainian infantry at inspection zoom', zoom: 1.45, file: 'inspection-color.png', anchor: uaReviewAnchor }));
  captures.push(await captureReview({ faction: 'ua', label: 'Ukrainian infantry at strategic value zoom', zoom: 0.55, file: 'strategic-value.png', grayscale: true, anchor: uaReviewAnchor }));

  captures.push(await captureReview({ faction: 'ru', label: 'Russian infantry at inspection zoom', zoom: 1.45, file: 'ru-inspection-color.png', anchor: ruReviewAnchor }));
  captures.push(await captureReview({ faction: 'ru', label: 'Russian infantry at command zoom', zoom: 1, file: 'ru-command-color.png', anchor: ruReviewAnchor }));
  captures.push(await captureReview({ faction: 'ru', label: 'Russian infantry at strategic zoom', zoom: 0.55, file: 'ru-strategic-color.png', anchor: ruReviewAnchor }));
  captures.push(await captureReview({ faction: 'ru', label: 'Russian infantry at strategic value zoom', zoom: 0.55, file: 'ru-strategic-value.png', grayscale: true, anchor: ruReviewAnchor }));

  const observedInfantry = {
    ua: await evaluate(infantryObservationExpression('ua')),
    ru: await evaluate(infantryObservationExpression('ru')),
  };
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
      commandZoom: 1,
      inspectionZoom: 1.45,
      grayscale: true,
      uaZoomAnchor: uaReviewAnchor,
      ruZoomAnchor: ruReviewAnchor,
      observer: 'test-server bridge to live Game and Renderer instances',
      visibilityContract: 'live infantry entity must remain inside the battlefield review viewport before every capture',
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
