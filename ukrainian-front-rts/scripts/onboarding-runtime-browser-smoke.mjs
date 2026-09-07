import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_PROLOGUE_ID, TUTORIAL_STEPS } from '../src/content/campaign/tutorial-prologue.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4178;
const browserPort = 9228;
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
if (typeof WebSocket !== 'function') throw new Error('The onboarding runtime browser smoke requires the Node.js WebSocket global.');

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

const profile = await mkdtemp(join(tmpdir(), 'ufrts-onboarding-runtime-smoke-'));
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
      const target = (await response.json()).find((item) => item.type === 'page');
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
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
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
  await waitFor(
    `document.readyState === 'complete' && document.querySelector('[data-campaign-prologue-card]') && window.__fieldsOfResolveAuthoredCampaign?.tutorialSnapshot && window.__fieldsOfResolveOnboarding?.snapshot`,
    'campaign and onboarding runtimes',
  );

  await delay(850);
  const selector = await json(`({
    campaign: window.__fieldsOfResolveAuthoredCampaign.snapshot(),
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    hintVisible: Boolean(document.querySelector('[data-onboarding-hint]') && !document.querySelector('[data-onboarding-hint]').hidden),
    guides: window.__fieldsOfResolveOnboarding.search('', { category: 'guide' }).length,
    glossary: window.__fieldsOfResolveOnboarding.search('', { category: 'glossary' }).length
  })`);
  if (selector.tutorial.status !== 'inactive' || selector.hintVisible || selector.guides !== 0 || selector.glossary < 1) {
    throw new Error(`Selector leaked tutorial onboarding: ${JSON.stringify(selector)}`);
  }

  await evaluate(`document.querySelector('[data-campaign-prologue-card] button')?.click()`);
  await waitFor(
    `window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().activeStepId === ${JSON.stringify(TUTORIAL_STEPS[0].id)} && !document.querySelector('[data-onboarding-hint]')?.hidden`,
    'first authored tutorial hint',
  );
  const first = await json(`({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    title: document.querySelector('[data-onboarding-hint] [data-hint-title]')?.textContent,
    prompt: document.querySelector('[data-onboarding-hint] [data-hint-prompt]')?.textContent
  })`);
  if (first.tutorial.runtimeId !== TUTORIAL_PROLOGUE_ID || first.tutorial.marker?.id !== TUTORIAL_STEPS[0].id || !first.title || !first.prompt) {
    throw new Error(`First authored marker did not render: ${JSON.stringify(first)}`);
  }

  const rejectedForeign = await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.click', 'foreign-runtime') === false`);
  if (!rejectedForeign) throw new Error('Foreign runtime tutorial event was accepted.');
  await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.click', ${JSON.stringify(TUTORIAL_PROLOGUE_ID)})`);
  await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.box', ${JSON.stringify(TUTORIAL_PROLOGUE_ID)})`);
  await waitFor(
    `window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().activeStepId === ${JSON.stringify(TUTORIAL_STEPS[1].id)}`,
    'next authored tutorial step',
  );
  const next = await json(`({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    title: document.querySelector('[data-onboarding-hint] [data-hint-title]')?.textContent,
    prompt: document.querySelector('[data-onboarding-hint] [data-hint-prompt]')?.textContent
  })`);
  if (next.tutorial.marker?.id !== TUTORIAL_STEPS[1].id || !next.title || !next.prompt || next.title === first.title) {
    throw new Error(`Active runtime did not advance onboarding: ${JSON.stringify({ first, next })}`);
  }

  await evaluate(`[...document.querySelectorAll('[data-campaign-prologue] button')].find((button) => button.textContent.includes('Continue to First Operation'))?.click()`);
  await waitFor(
    `document.querySelector('#missionSelect')?.dataset?.campaignStage === 'briefing' && window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().status === 'inactive'`,
    'non-tutorial operation briefing',
  );
  const operation = await json(`({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    hintVisible: Boolean(document.querySelector('[data-onboarding-hint]') && !document.querySelector('[data-onboarding-hint]').hidden),
    guides: window.__fieldsOfResolveOnboarding.search('', { category: 'guide' }).length,
    glossary: window.__fieldsOfResolveOnboarding.search('', { category: 'glossary' }).length
  })`);
  if (operation.hintVisible || operation.guides !== 0 || operation.glossary < 1) {
    throw new Error(`Non-tutorial operation leaked authored guidance: ${JSON.stringify(operation)}`);
  }

  const failures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' ||
    event.method === 'Inspector.targetCrashed' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  if (failures.length) throw new Error(`Browser runtime failures: ${JSON.stringify(failures)}`);

  const state = { selector, first, next, operation };
  await writeFile(join(artifacts, 'onboarding-runtime-browser-smoke.json'), JSON.stringify({ status: 'passed', state }, null, 2));
  console.log(`[onboarding-runtime-smoke] selector clean -> ${first.tutorial.activeStepId} -> ${next.tutorial.activeStepId} -> operation clean`);
} catch (error) {
  try {
    if (socket?.readyState === WebSocket.OPEN) {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(artifacts, 'onboarding-runtime-browser-smoke-failure.png'), Buffer.from(shot.data, 'base64'));
    }
  } catch (screenshotError) {
    logs.push(`[screenshot] ${screenshotError.stack || screenshotError.message}\n`);
  }
  await writeFile(join(artifacts, 'onboarding-runtime-browser-smoke.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(3000)]);
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
