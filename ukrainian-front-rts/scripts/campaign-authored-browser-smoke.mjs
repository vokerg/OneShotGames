import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4177;
const browserPort = 9227;
const pageUrl = `http://${host}:${port}/`;
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
if (typeof WebSocket !== 'function') throw new Error('The authored campaign browser smoke requires the Node.js WebSocket global.');

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
  server.listen(port, host, resolveReady);
});

const profile = await mkdtemp(join(tmpdir(), 'ufrts-campaign-smoke-'));
const logs = [];
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${browserPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (chunk) => logs.push(chunk.toString()));
chrome.on('error', (error) => logs.push(`[spawn] ${error.stack || error.message}\n`));
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
          } else if (message.method) events.push(message);
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

function call(method, params = {}, timeoutMilliseconds = 5000) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`Cannot call ${method}: DevTools socket is not open.`));
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

async function evaluate(expression) {
  const evaluation = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (evaluation.exceptionDetails) throw new Error(`Browser evaluation failed: ${evaluation.exceptionDetails.text || 'unknown error'}`);
  return evaluation.result?.value;
}

async function json(expression) {
  return JSON.parse(await evaluate(`JSON.stringify(${expression})`));
}

async function waitFor(expression, description, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch (error) {
      logs.push(`[wait ${description}] ${error.message}\n`);
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function deployCard(cardSelector) {
  await evaluate(`document.querySelector(${JSON.stringify(cardSelector)})?.querySelector('button')?.click()`);
  await waitFor(`document.querySelector('#missionSelect')?.dataset?.campaignStage === 'briefing' && document.querySelector('[data-campaign-briefing]')`, 'authored briefing');
  const briefing = await json(`({
    stage: document.querySelector('#missionSelect')?.dataset?.campaignStage,
    operationId: document.querySelector('[data-campaign-briefing]')?.dataset?.campaignBriefing,
    beginLabel: [...document.querySelectorAll('[data-campaign-briefing] button')].find((button) => button.textContent.includes('Begin'))?.textContent
  })`);
  await evaluate(`[...document.querySelectorAll('[data-campaign-briefing] button')].find((button) => button.textContent.includes('Begin'))?.click()`);
  const loading = await json(`({
    stage: document.querySelector('#missionSelect')?.dataset?.campaignStage,
    loading: Boolean(document.querySelector('[data-campaign-loading]'))
  })`);
  await waitFor(`window.__fieldsOfResolveAuthoredCampaign?.snapshot?.().stage === 'battlefield' && window.__fieldsOfResolveAuthoredCampaign?.snapshot?.().authoredMission === true && document.querySelector('#missionSelect')?.classList.contains('hidden')`, 'authored battlefield');
  const battlefield = await json(`window.__fieldsOfResolveAuthoredCampaign.snapshot()`);
  return { briefing, loading, battlefield };
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(
    `document.readyState === 'complete' && document.querySelectorAll('[data-campaign-operation-id]').length === 9 && document.querySelector('[data-campaign-prologue-card]') && window.__fieldsOfResolveAuthoredCampaign?.snapshot`,
    'nine authored operations and prologue',
  );

  const initial = await json(`({
    diagnostic: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    cardIds: [...document.querySelectorAll('[data-campaign-operation-id]')].map((card) => card.dataset.campaignOperationId),
    availableIds: [...document.querySelectorAll('[data-campaign-operation-id]')].filter((card) => !card.querySelector('button')?.disabled).map((card) => card.dataset.campaignOperationId),
    prologue: document.querySelector('[data-campaign-prologue-card]')?.textContent
  })`);
  const firstId = initial.availableIds[0];
  if (!firstId) throw new Error('Campaign has no initially unlocked operation.');

  const first = await deployCard(`[data-campaign-operation-id="${firstId}"]`);
  if (first.loading.stage !== 'loading' || !first.loading.loading) throw new Error(`Loading transition was not observable: ${JSON.stringify(first.loading)}`);
  if (first.battlefield.activeOperationId !== firstId || !first.battlefield.mapId) throw new Error(`First authored battlefield was not mounted: ${JSON.stringify(first.battlefield)}`);

  if (!await evaluate(`window.__fieldsOfResolveAuthoredCampaign.finish('victory')`)) throw new Error('Could not finish first authored operation through diagnostic boundary.');
  await waitFor(`window.__fieldsOfResolveAuthoredCampaign.snapshot().stage === 'debrief' && !document.querySelector('#endgame')?.classList.contains('hidden')`, 'victory debrief');
  const firstDebrief = await json(`({
    diagnostic: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    title: document.querySelector('#endgameTitle')?.textContent,
    reason: document.querySelector('#endgameReason')?.textContent
  })`);
  await evaluate(`document.querySelector('#returnOperations')?.click()`);
  await waitFor(`window.__fieldsOfResolveAuthoredCampaign.snapshot().stage === 'operations' && document.querySelectorAll('[data-campaign-operation-id]').length === 9`, 'operations after victory');
  const afterVictory = await json(`({
    diagnostic: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    availableIds: [...document.querySelectorAll('[data-campaign-operation-id]')].filter((card) => !card.querySelector('button')?.disabled).map((card) => card.dataset.campaignOperationId)
  })`);
  const secondId = afterVictory.availableIds.find((id) => id !== firstId);
  if (!secondId) throw new Error(`Victory did not unlock the next operation: ${JSON.stringify(afterVictory)}`);

  const second = await deployCard(`[data-campaign-operation-id="${secondId}"]`);
  if (second.battlefield.mapId === first.battlefield.mapId) throw new Error('Consecutive authored operations mounted the same map id.');
  if (!await evaluate(`window.__fieldsOfResolveAuthoredCampaign.finish('defeat')`)) throw new Error('Could not finish second authored operation with defeat.');
  await waitFor(`window.__fieldsOfResolveAuthoredCampaign.snapshot().stage === 'debrief' && !document.querySelector('#endgame')?.classList.contains('hidden')`, 'defeat debrief');
  const secondDebrief = await json(`({
    diagnostic: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    title: document.querySelector('#endgameTitle')?.textContent,
    reason: document.querySelector('#endgameReason')?.textContent
  })`);
  await evaluate(`document.querySelector('#returnOperations')?.click()`);
  await waitFor(`window.__fieldsOfResolveAuthoredCampaign.snapshot().stage === 'operations'`, 'operations after defeat');
  const afterDefeat = await json(`({
    diagnostic: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    availableIds: [...document.querySelectorAll('[data-campaign-operation-id]')].filter((card) => !card.querySelector('button')?.disabled).map((card) => card.dataset.campaignOperationId)
  })`);

  const failures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Inspector.targetCrashed' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  const warnings = events.filter((event) => event.method === 'Log.entryAdded' && event.params?.entry?.level === 'warning');
  const passed =
    initial.cardIds.length === 9 &&
    initial.diagnostic.operationCount === 9 &&
    initial.prologue?.includes('Prologue') &&
    first.briefing.stage === 'briefing' &&
    first.loading.stage === 'loading' &&
    first.battlefield.stage === 'battlefield' &&
    firstDebrief.diagnostic.stage === 'debrief' &&
    afterVictory.diagnostic.unlockedOperationIds.includes(secondId) &&
    afterVictory.diagnostic.completedOperationIds.includes(firstId) &&
    second.battlefield.stage === 'battlefield' &&
    secondDebrief.diagnostic.stage === 'debrief' &&
    afterDefeat.diagnostic.unlockedOperationIds.length === afterVictory.diagnostic.unlockedOperationIds.length &&
    failures.length === 0;

  const state = { initial, first, firstDebrief, afterVictory, secondId, second, secondDebrief, afterDefeat, warnings };
  if (!passed) throw new Error(`Authored campaign browser smoke failed: ${JSON.stringify({ state, failures })}`);
  await writeFile(join(artifacts, 'campaign-authored-browser-smoke.json'), JSON.stringify({ status: 'passed', state }, null, 2));
  console.log(`[campaign-browser-smoke] ${firstId} victory unlocked ${secondId}; ${secondId} defeat preserved progression; maps ${first.battlefield.mapId} -> ${second.battlefield.mapId}`);
} catch (error) {
  try {
    if (socket?.readyState === WebSocket.OPEN) {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(artifacts, 'campaign-authored-browser-smoke-failure.png'), Buffer.from(shot.data, 'base64'));
    }
  } catch (screenshotError) {
    logs.push(`[screenshot] ${screenshotError.stack || screenshotError.message}\n`);
  }
  await writeFile(join(artifacts, 'campaign-authored-browser-smoke.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(3000)]);
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
