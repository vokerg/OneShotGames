#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts/tactical-alert-browser-smoke');
const host = '127.0.0.1';
const serverPort = 4185;
const browserPort = 9235;
const pageUrl = `http://${host}:${serverPort}/tactical-alert-smoke.html`;
const mime = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const harnessHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Tactical alert browser smoke</title></head>
<body>
  <ul id="minimapAlertQueue" class="minimapAlertQueue"></ul>
  <form id="minimapFilters"></form>
  <canvas id="minimap" width="220" height="138"></canvas>
  <script type="module">
    import { TEAM, WORLD } from './src/config.js';
    import { installMinimapAlerts } from './src/ui/minimap-alerts.js';
    import { installNotificationCenter, NOTIFICATION_KINDS } from './src/ui/notification-center.js';

    const failures = [];
    const check = (condition, message) => { if (!condition) failures.push(message); };
    let now = 0;
    const unit = { id: 1, type: 'uaInfantry', team: TEAM.UA, x: 320, y: 420, hp: 100, maxHp: 100 };
    const game = {
      mission: { id: 'alert-smoke', objectives: ['Secure the bridge.'] },
      missionIndex: 0,
      time: 0,
      tick: 0,
      camera: { x: 0, y: 0, z: 1 },
      terrain: Array.from({ length: (WORLD.w / 32) * (WORLD.h / 32) }, () => 0),
      road: [],
      units: [unit],
      buildings: [],
      nodes: [],
      selected: new Set(),
      player: { objectives: [false] },
      productionAcknowledgements: [],
      researchQueueEvents: [],
      unitStats() { return { sight: 240 }; },
      canPlayerSee() { return true; },
      select() {},
    };
    const ui = {
      refresh() {},
      toast(message) { return message; },
      setMission() {},
      showMissionSelect() {},
    };
    const canvas = document.querySelector('#minimap');
    const renderer = { mx: canvas.getContext('2d'), mini() {} };

    const disposeNotifications = installNotificationCenter({
      game,
      ui,
      documentTarget: document,
      windowTarget: window,
    });
    const disposeMinimap = installMinimapAlerts({
      game,
      ui,
      renderer,
      minimap: canvas,
      documentTarget: document,
      windowTarget: window,
      clock: () => now,
      refreshIntervalMs: 0,
    });

    ui.setMission();

    const damage = (hp, milliseconds) => {
      unit.hp = hp;
      now = milliseconds;
      game.time = milliseconds / 1000;
      game.tick = Math.round(game.time * 30);
      ui.refresh();
      renderer.mini();
    };

    damage(90, 1000);
    damage(80, 3000);
    damage(70, 6000);
    damage(60, 9000);
    damage(50, 12000);

    game.minimapAlerts.push({
      kind: 'production',
      message: 'Tank deployed.',
      source: 'smoke:production',
      worldPosition: { x: 500, y: 500 },
    });
    game.minimapAlerts.push({
      kind: 'objective',
      message: 'Objective complete.',
      source: 'smoke:objective',
      worldPosition: { x: 600, y: 600 },
    });
    ui.notify({
      kind: NOTIFICATION_KINDS.PRODUCTION,
      key: 'smoke:production',
      title: 'Production complete',
      message: 'Tank deployed.',
    });
    ui.notify({
      kind: NOTIFICATION_KINDS.OBJECTIVE,
      key: 'smoke:objective',
      title: 'Objective complete',
      message: 'Secure the bridge.',
    });

    const minimapBeforeReset = game.minimapAlerts.snapshot();
    const noticesBeforeReset = ui.notificationCenter.snapshot();
    const minimapAttack = minimapBeforeReset.find((alert) => alert.kind === 'attack');
    const noticeAttack = noticesBeforeReset.history.find((notice) => notice.kind === 'attack');

    check(minimapBeforeReset.filter((alert) => alert.kind === 'attack').length === 1, 'minimap must keep one attack row per target/run');
    check(minimapAttack?.count === 5, `minimap attack count expected 5, got ${minimapAttack?.count}`);
    check(document.querySelector('#minimapAlertQueue').textContent.includes('×5'), 'minimap DOM must render the aggregate count');
    check(noticesBeforeReset.history.filter((notice) => notice.kind === 'attack').length === 1, 'notification history must keep one attack row per target/run');
    check(noticeAttack?.count === 5, `notification attack count expected 5, got ${noticeAttack?.count}`);
    check(noticesBeforeReset.unread === 3, `unread count should track three alert records, got ${noticesBeforeReset.unread}`);
    check(
      noticesBeforeReset.feed.slice(0, 3).map((notice) => notice.kind).join(',') === 'objective,production,attack',
      `notification feed priority mismatch: ${noticesBeforeReset.feed.map((notice) => notice.kind).join(',')}`,
    );
    check(
      minimapBeforeReset.slice(0, 3).map((alert) => alert.kind).join(',') === 'objective,production,attack',
      `minimap priority mismatch: ${minimapBeforeReset.map((alert) => alert.kind).join(',')}`,
    );

    unit.hp = 100;
    game.time = 0;
    game.tick = 0;
    now = 0;
    ui.setMission();
    const restartMinimap = game.minimapAlerts.snapshot();
    const restartNotices = ui.notificationCenter.snapshot();
    check(restartMinimap.length === 0, 'mission restart must clear minimap alerts immediately');
    check(restartNotices.history.length === 0 && restartNotices.unread === 0, 'mission restart must clear notification history and unread state');
    check(document.querySelector('#minimapAlertQueue').children.length === 0, 'mission restart must clear minimap queue DOM');

    damage(90, 2000);
    const nextRunMinimap = game.minimapAlerts.snapshot().find((alert) => alert.kind === 'attack');
    const nextRunNotice = ui.notificationCenter.snapshot().history.find((notice) => notice.kind === 'attack');
    check(nextRunMinimap?.count === 1, 'new mission run must start minimap aggregate count at one');
    check(nextRunNotice?.count === 1, 'new mission run must start notification aggregate count at one');

    game.mission = null;
    ui.showMissionSelect();
    const quitMinimap = game.minimapAlerts.snapshot();
    const quitNotices = ui.notificationCenter.snapshot();
    check(quitMinimap.length === 0, 'returning to operations must clear minimap alerts');
    check(quitNotices.history.length === 0 && quitNotices.unread === 0, 'returning to operations must clear notification state');

    disposeMinimap();
    disposeNotifications();

    window.__tacticalAlertSmoke = {
      done: true,
      passed: failures.length === 0,
      failures,
      minimapBeforeReset: minimapBeforeReset.map(({ kind, count, source }) => ({ kind, count, source })),
      noticesBeforeReset: {
        unread: noticesBeforeReset.unread,
        feed: noticesBeforeReset.feed.map(({ kind, count, key }) => ({ kind, count, key })),
        history: noticesBeforeReset.history.map(({ kind, count, key }) => ({ kind, count, key })),
      },
      restart: { minimap: restartMinimap.length, notifications: restartNotices.history.length },
      nextRun: { minimapCount: nextRunMinimap?.count ?? null, notificationCount: nextRunNotice?.count ?? null },
      quit: { minimap: quitMinimap.length, notifications: quitNotices.history.length },
    };
  </script>
</body>
</html>`;

await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The tactical alert smoke requires the Node.js WebSocket global.');

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (pathname === '/tactical-alert-smoke.html') {
      response.setHeader('content-type', 'text/html');
      response.end(harnessHtml);
      return;
    }
    const requested = pathname.replace(/^\/+/, '');
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

const profile = await mkdtemp(join(tmpdir(), 'ufrts-tactical-alerts-'));
const browserLogs = [];
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
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

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor('window.__tacticalAlertSmoke?.done', 'tactical alert smoke result');

  const result = JSON.parse(await evaluate('JSON.stringify(window.__tacticalAlertSmoke)'));
  const runtimeFailures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || event.method === 'Inspector.targetCrashed'
    || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error')
    || (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  if (runtimeFailures.length) result.failures.push(`browser emitted ${runtimeFailures.length} runtime/network failure(s)`);
  result.passed = result.failures.length === 0;
  await writeFile(resolve(artifacts, 'tactical-alert-browser-smoke.json'), JSON.stringify({
    ...result,
    runtimeFailures,
  }, null, 2));
  if (!result.passed) throw new Error(`Tactical alert browser smoke failed: ${result.failures.join('; ')}`);
  console.log('[tactical-alert-browser-smoke] sustained damage aggregation and lifecycle resets passed');
} catch (error) {
  await writeFile(resolve(artifacts, 'failure.log'), `${browserLogs.join('')}\n${error.stack}\n`);
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
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
