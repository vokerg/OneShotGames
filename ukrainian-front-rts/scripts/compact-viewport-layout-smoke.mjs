#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/compact-viewport-layout');
const host = '127.0.0.1';
const serverPort = 4184;
const browserPort = 9234;
const pageUrl = `http://${host}:${serverPort}/`;
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

await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The compact viewport smoke requires the Node.js WebSocket global.');

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
  server.listen(serverPort, host, resolveReady);
});

const profile = await mkdtemp(join(tmpdir(), 'ufrts-compact-viewport-'));
const browserLogs = [];
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
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
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (chromeExited) throw new Error('Chrome exited before the DevTools endpoint became available.');
    try {
      const response = await fetch(`http://${host}:${browserPort}/json`);
      if (!response.ok) throw new Error(`DevTools target listing returned ${response.status}.`);
      const target = (await response.json()).find((entry) => entry.type === 'page');
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

function call(method, params = {}, timeoutMilliseconds = 8_000) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`Cannot call ${method}: DevTools socket is not open.`));
  }
  const id = nextId++;
  return new Promise((resolveCall, rejectCall) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectCall(new Error(`Chrome DevTools call timed out: ${method}`));
    }, timeoutMilliseconds);
    pending.set(id, { resolve: resolveCall, reject: rejectCall, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'unknown error'}`);
  }
  return result.result?.value;
}

async function waitFor(expression, description) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch (error) {
      browserLogs.push(`[wait ${description}] ${error.message}\n`);
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function capture(file) {
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(shot.data, 'base64');
  if (bytes.length < 10_000) throw new Error(`${file} screenshot is unexpectedly small (${bytes.length} bytes).`);
  await writeFile(resolve(artifacts, file), bytes);
  return bytes.length;
}

const targets = [
  { width: 960, height: 600, expectedMode: 'compact', noticeVisible: false, minimapVisible: false },
  { width: 1017, height: 838, expectedMode: 'compact', noticeVisible: false, minimapVisible: false },
  { width: 1280, height: 720, expectedMode: 'standard', noticeVisible: false, minimapVisible: true },
  { width: 650, height: 838, expectedMode: 'minimum', noticeVisible: true, minimapVisible: false },
];

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
    `document.readyState==='complete' && document.querySelector('.missionCard button') && window.__fieldsOfResolveViewport?.snapshot`,
    'mission selection and viewport runtime',
  );
  await evaluate(`document.querySelector('.missionCard button').click()`);
  await waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && document.querySelector('#missionTitle')?.textContent && document.querySelector('#commandPanel')`,
    'active mission command interface',
  );

  const reviews = [];
  for (const target of targets) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: target.width,
      height: target.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await waitFor(
      `innerWidth===${target.width} && innerHeight===${target.height} && document.documentElement.dataset.viewportMode==='${target.expectedMode}'`,
      `${target.width}x${target.height} ${target.expectedMode} viewport mode`,
    );
    await delay(100);

    const state = JSON.parse(await evaluate(`JSON.stringify((()=>{
      const viewportHeight=innerHeight,viewportWidth=innerWidth;
      const command=document.querySelector('#commandPanel');
      const minimap=document.querySelector('.minimapFrame');
      const notice=document.querySelector('#minimumViewportNotice');
      const commandRect=command.getBoundingClientRect();
      const directChildren=[...command.children].map((element)=>{
        const style=getComputedStyle(element),rect=element.getBoundingClientRect();
        return{
          id:element.id||null,
          className:element.className||null,
          display:style.display,
          visible:style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0,
          rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height}
        };
      });
      const visibleChildren=directChildren.filter((entry)=>entry.visible);
      return{
        width:viewportWidth,
        height:viewportHeight,
        mode:document.documentElement.dataset.viewportMode,
        noticeVisible:!notice.classList.contains('hidden'),
        noticeHeading:notice.querySelector('strong')?.textContent?.trim()||'',
        noticeBody:notice.querySelector('span')?.textContent?.trim()||'',
        command:{
          rect:{left:commandRect.left,top:commandRect.top,right:commandRect.right,bottom:commandRect.bottom,width:commandRect.width,height:commandRect.height},
          overflowY:getComputedStyle(command).overflowY,
          visibleChildren,
          childrenBeyondViewport:visibleChildren.filter((entry)=>entry.rect.bottom>viewportHeight+1||entry.rect.right>viewportWidth+1||entry.rect.left<-1).map((entry)=>entry.id||entry.className)
        },
        minimap:{display:getComputedStyle(minimap).display,visible:getComputedStyle(minimap).display!=='none'},
        topbar:{scrollWidth:document.querySelector('#topbar').scrollWidth,clientWidth:document.querySelector('#topbar').clientWidth}
      };
    })())`));

    const failures = [];
    if (state.mode !== target.expectedMode) failures.push(`expected mode ${target.expectedMode}, found ${state.mode}`);
    if (state.noticeVisible !== target.noticeVisible) failures.push(`notice visibility expected ${target.noticeVisible}, found ${state.noticeVisible}`);
    if (state.minimap.visible !== target.minimapVisible) failures.push(`minimap visibility expected ${target.minimapVisible}, found ${state.minimap.visible}`);
    if (state.command.rect.bottom > target.height + 1) failures.push(`command panel bottom ${state.command.rect.bottom} exceeds ${target.height}`);
    if (state.command.rect.right > target.width + 1 || state.command.rect.left < -1) failures.push('command panel exceeds horizontal viewport bounds');
    if (state.command.childrenBeyondViewport.length) failures.push(`visible command children exceed viewport: ${state.command.childrenBeyondViewport.join(', ')}`);
    if (target.expectedMode === 'minimum') {
      if (!/supported minimum/i.test(state.noticeHeading)) failures.push(`minimum notice heading is ambiguous: ${state.noticeHeading}`);
      if (!/compact layout/i.test(state.noticeBody)) failures.push(`minimum notice body does not distinguish supported compact mode: ${state.noticeBody}`);
    } else if (/complete command interface/i.test(state.noticeBody)) {
      failures.push('viewport copy still promises a complete interface at the compact minimum');
    }
    if (target.expectedMode === 'minimum' && !['auto', 'scroll'].includes(state.command.overflowY)) {
      failures.push(`minimum command panel must remain scrollable; overflowY=${state.command.overflowY}`);
    }

    const file = `viewport-${target.width}x${target.height}-${target.expectedMode}.png`;
    const bytes = await capture(file);
    reviews.push({ ...state, screenshot: file, bytes, failures });
    if (failures.length) throw new Error(`${target.width}x${target.height} compact viewport review failed: ${failures.join('; ')}`);
  }

  const runtimeFailures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || event.method === 'Inspector.targetCrashed'
    || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
    || (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  if (runtimeFailures.length) throw new Error(`Compact viewport review saw ${runtimeFailures.length} runtime/network failure(s).`);

  await writeFile(resolve(artifacts, 'compact-viewport-layout.json'), JSON.stringify({
    status: 'passed',
    reviewSurface: 'active mission command interface',
    viewports: reviews,
    runtimeFailures,
  }, null, 2));
  console.log(`[compact-viewport-layout] verified ${reviews.length} viewport modes with command containment and screenshots`);
} catch (error) {
  await writeFile(resolve(artifacts, 'failure.log'), `${browserLogs.join('')}\n${error.stack}\n`);
  try {
    await capture('failure.png');
  } catch (screenshotError) {
    browserLogs.push(`[screenshot] ${screenshotError.stack || screenshotError.message}\n`);
  }
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2_000)]);
  if (!chromeExited) {
    chrome.kill('SIGKILL');
    await Promise.race([chromeExit, delay(3_000)]);
  }
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!chromeExited) throw new Error('Chromium did not exit after forced compact viewport teardown.');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
