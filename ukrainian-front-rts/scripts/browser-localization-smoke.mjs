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
const port = 4175;
const browserPort = 9224;
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The localization smoke requires the Node.js WebSocket global.');

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

const profile = await mkdtemp(join(tmpdir(), 'ufrts-localization-smoke-'));
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
      browserLogs.push(`[connect ${attempt + 1}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not become available.');
}

function call(method, params = {}, timeoutMilliseconds = 5000) {
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

async function evaluate(expression) {
  const evaluation = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (evaluation.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${evaluation.exceptionDetails.text || 'unknown error'}`);
  }
  return evaluation.result?.value;
}

async function waitFor(expression, description) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch (error) {
      browserLogs.push(`[wait ${description}] ${error.message}\n`);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function snapshot() {
  return JSON.parse(await evaluate(`JSON.stringify((() => {
    const localization = window.__fieldsOfResolveLocalization;
    const diagnostics = localization?.diagnostics?.();
    const topbar = document.querySelector('#topbar');
    const topbarRect = topbar?.getBoundingClientRect();
    const directChildBounds = topbar
      ? [...topbar.children].map((child) => {
          const rect = child.getBoundingClientRect();
          return { id: child.id || child.className || child.tagName, left: rect.left, right: rect.right };
        })
      : [];
    const topbarChildOverflow = Boolean(topbarRect && directChildBounds.some((rect) =>
      rect.left < topbarRect.left - 0.5 || rect.right > topbarRect.right + 0.5));
    return {
      locale: localization?.locale,
      htmlLang: document.documentElement.lang,
      dataLocale: document.documentElement.dataset.locale,
      persistedLocale: localStorage.getItem('fields-of-resolve.locale.v1'),
      toggleText: document.querySelector('#localeToggle')?.textContent,
      toggleTarget: document.querySelector('#localeToggle')?.dataset?.localeTarget,
      objectives: document.querySelector('#objectivesBtn')?.textContent,
      objectivesTooltip: document.querySelector('#objectivesBtn')?.getAttribute('data-tooltip'),
      audio: document.querySelector('#audioSettingsToggle')?.textContent,
      fullscreenText: document.querySelector('#viewportFullscreenToggle')?.textContent,
      fullscreenAria: document.querySelector('#viewportFullscreenToggle')?.getAttribute('aria-label'),
      viewportNoticeHeading: document.querySelector('#minimumViewportNotice strong')?.textContent,
      viewportNoticeBody: document.querySelector('#minimumViewportNotice span')?.textContent,
      disclaimer: document.querySelector('#missionSelect .disclaimer')?.textContent,
      minimapAria: document.querySelector('#minimap')?.getAttribute('aria-label'),
      missionButton: document.querySelector('.missionCard button')?.textContent,
      missionPacing: document.querySelector('.missionPacing')?.textContent,
      topbarChildOverflow,
      topbarBounds: topbarRect ? { left: topbarRect.left, right: topbarRect.right, width: topbarRect.width } : null,
      directChildBounds,
      viewportOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      diagnostics,
    };
  })())`));
}

const report = { initial: null, ukrainian: null, persisted: null, restored: null, browserErrors: [] };
try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Page.navigate', { url: pageUrl });
  await waitFor(
    `document.readyState === 'complete' && document.querySelector('#localeToggle') && window.__fieldsOfResolveLocalization && document.querySelector('.missionCard button')`,
    'English localization runtime',
  );

  report.initial = await snapshot();
  assert(report.initial.locale === 'en', `Expected initial en locale, found ${report.initial.locale}.`);
  assert(report.initial.htmlLang === 'en' && report.initial.dataLocale === 'en', 'English locale was not applied to the root element.');
  assert(report.initial.toggleTarget === 'uk', 'English locale control must target Ukrainian.');
  assert(report.initial.persistedLocale === null, 'Initial locale should not persist until the player changes it.');
  assert(report.initial.viewportNoticeHeading === 'Viewport below supported minimum', 'English minimum viewport heading is stale.');
  assert(report.initial.viewportNoticeBody === 'Use at least 960 × 600 CSS pixels or enter fullscreen. Supported compact layouts automatically collapse secondary panels to keep core commands reachable.', 'English minimum viewport guidance is stale.');
  assert(report.initial.diagnostics?.missingSelectors?.length === 0, `Missing English bindings: ${report.initial.diagnostics?.missingSelectors}`);
  assert(report.initial.topbarChildOverflow === false, 'English top-bar controls exceed the top-bar bounds.');
  assert(report.initial.viewportOverflow === false, 'English localization creates horizontal viewport overflow.');

  await evaluate(`document.querySelector('#localeToggle').click()`);
  await waitFor(
    `document.documentElement.lang === 'uk' && localStorage.getItem('fields-of-resolve.locale.v1') === 'uk' && document.querySelector('#objectivesBtn')?.textContent === 'Завдання' && document.querySelector('#viewportFullscreenToggle')?.textContent === 'На весь екран'`,
    'Ukrainian locale switch',
  );
  report.ukrainian = await snapshot();
  assert(report.ukrainian.locale === 'uk' && report.ukrainian.dataLocale === 'uk', 'Ukrainian runtime locale did not activate.');
  assert(report.ukrainian.toggleTarget === 'en', 'Ukrainian locale control must target English.');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.ukrainian.disclaimer || ''), 'Ukrainian disclaimer is not rendered in Cyrillic.');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.ukrainian.objectivesTooltip || ''), 'Ukrainian tooltip was not applied.');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.ukrainian.minimapAria || ''), 'Ukrainian ARIA copy was not applied.');
  assert(report.ukrainian.fullscreenText === 'На весь екран', 'Viewport fullscreen action did not localize.');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.ukrainian.fullscreenAria || ''), 'Viewport fullscreen ARIA copy did not localize.');
  assert(report.ukrainian.viewportNoticeHeading === 'Область перегляду менша за підтримуваний мінімум', 'Minimum viewport notice heading did not localize to the supported-minimum contract.');
  assert(report.ukrainian.viewportNoticeBody === 'Використовуйте щонайменше 960 × 600 CSS-пікселів або повноекранний режим. У підтримуваному компактному режимі другорядні панелі автоматично згортаються, щоб основні команди залишалися доступними.', 'Minimum viewport notice body did not localize to the compact-layout contract.');
  assert(report.ukrainian.missionButton === 'Почати операцію', 'Mission action did not rerender in Ukrainian.');
  assert(report.ukrainian.missionPacing?.includes('Заплановано хвиль'), 'Mission pacing did not rerender in Ukrainian.');
  assert(report.ukrainian.diagnostics?.fontCoverageReady === true, 'Browser font loading API did not confirm the Latin/Cyrillic stack.');
  assert(report.ukrainian.diagnostics?.fontProbeWidth > 0, 'Cyrillic font probe did not render measurable text.');
  assert(report.ukrainian.diagnostics?.styleMounted === true, 'Localization font/style owner is not mounted.');
  assert(report.ukrainian.diagnostics?.missingSelectors?.length === 0, `Missing Ukrainian bindings: ${report.ukrainian.diagnostics?.missingSelectors}`);
  assert(report.ukrainian.topbarChildOverflow === false, 'Ukrainian top-bar controls exceed the top-bar bounds.');
  assert(report.ukrainian.viewportOverflow === false, 'Ukrainian localization creates horizontal viewport overflow.');

  await call('Page.reload', { ignoreCache: true });
  await waitFor(
    `document.readyState === 'complete' && window.__fieldsOfResolveLocalization?.locale === 'uk' && document.querySelector('#localeToggle') && document.querySelector('.missionCard button')?.textContent === 'Почати операцію'`,
    'persisted Ukrainian locale after reload',
  );
  report.persisted = await snapshot();
  assert(report.persisted.persistedLocale === 'uk', 'Ukrainian locale did not persist across reload.');

  await evaluate(`document.querySelector('#localeToggle').click()`);
  await waitFor(
    `document.documentElement.lang === 'en' && localStorage.getItem('fields-of-resolve.locale.v1') === 'en' && document.querySelector('#objectivesBtn')?.textContent === 'Objectives'`,
    'English locale restoration',
  );
  report.restored = await snapshot();
  assert(report.restored.locale === 'en', 'Locale switch did not restore English.');
  assert(report.restored.missionButton === 'Begin Operation', 'Mission action did not restore English.');
  assert(report.restored.fullscreenText === 'Fullscreen', 'Viewport fullscreen action did not restore English.');
  assert(report.restored.viewportNoticeHeading === 'Viewport below supported minimum', 'English minimum viewport heading did not restore.');
  assert(report.restored.viewportNoticeBody === 'Use at least 960 × 600 CSS pixels or enter fullscreen. Supported compact layouts automatically collapse secondary panels to keep core commands reachable.', 'English minimum viewport guidance did not restore.');

  report.browserErrors = events
    .filter((event) => event.method === 'Runtime.exceptionThrown'
      || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error'))
    .map((event) => event.params);
  assert(report.browserErrors.length === 0, `Browser reported ${report.browserErrors.length} localization error(s).`);

  await writeFile(join(artifacts, 'localization-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('[localization-smoke] English/Ukrainian switch, persistence, font, layout, DOM, tooltip, ARIA, and viewport-guidance checks passed.');
} catch (error) {
  report.error = error.stack || error.message;
  report.browserLogs = browserLogs;
  await writeFile(join(artifacts, 'localization-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2000)]);
  if (!chromeExited) {
    chrome.kill('SIGKILL');
    await Promise.race([chromeExit, delay(3000)]);
  }
  if (!chromeExited) throw new Error('Chromium did not exit after forced localization-smoke teardown.');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
}
