import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openChromeDevToolsSession } from './lib/chrome-devtools-session.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4186;
const browserPort = 9246;
const pageUrl = `http://${host}:${port}/`;
const mime = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript',
  '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');

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

const session = await openChromeDevToolsSession({
  browser,
  browserPort,
  profilePrefix: 'ufrts-live-locale-',
  windowSize: '1920,1080',
});
const report = { selector: {}, mission: {}, browserErrors: [] };

async function snapshot() {
  return JSON.parse(await session.evaluate(`JSON.stringify((() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const operationCards = [...document.querySelectorAll('[data-campaign-operation-id]')];
    return {
      locale: window.__fieldsOfResolveLocalization?.locale,
      lang: document.documentElement.lang,
      missionTitle: text('#missionTitle'),
      missionStory: text('#missionStory'),
      objectives: text('#objectiveList'),
      toast: text('#message'),
      pauseToggle: text('#pauseMenuToggle'),
      pauseMenu: text('#pauseMenuContent'),
      audioSettings: text('#audioSettings'),
      notifications: text('.notificationCenter'),
      notificationToggle: text('.notificationHistoryToggle'),
      missionCards: text('#missionCards'),
      skirmishCard: text('[data-skirmish-setup]'),
      operationHeadings: operationCards.map((card) => card.querySelector('h3')?.textContent?.trim() || ''),
      operationCards: operationCards.map((card) => card.textContent?.trim() || ''),
      authoredStage: window.__fieldsOfResolveAuthoredCampaign?.snapshot?.()?.stage || null,
      bridgeLocale: window.__fieldsOfResolveLiveRuntimeLocalization?.locale || null,
    };
  })())`));
}

async function switchLocale(locale) {
  await session.evaluate(`document.querySelector('#localeToggle').click()`);
  await session.waitFor(
    `document.documentElement.lang === ${JSON.stringify(locale)} && window.__fieldsOfResolveLocalization?.locale === ${JSON.stringify(locale)}`,
    `${locale} locale`,
  );
  await session.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', { awaitPromise: true });
}

async function startFirstAuthoredOperation() {
  await session.waitFor(
    `document.querySelector('[data-campaign-operation-id] button:not([disabled])') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.operationCount === 9`,
    'authored operation selector',
  );
  await session.evaluate(`document.querySelector('[data-campaign-operation-id] button:not([disabled])').click()`);
  await session.waitFor(
    `document.querySelector('[data-campaign-briefing] button.primary') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.stage === 'briefing'`,
    'authored operation briefing',
  );
  await session.evaluate(`document.querySelector('[data-campaign-briefing] button.primary').click()`);
  await session.waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.stage === 'battlefield'`,
    'authored operation battlefield',
  );
}

function assertUkrainianSurface(state, label) {
  const combined = [
    state.missionTitle, state.missionStory, state.objectives, state.toast, state.pauseToggle,
    state.pauseMenu, state.audioSettings, state.notifications, state.missionCards, state.skirmishCard,
  ].join('\n');
  const forbidden = [
    'Pause', 'Begin Operation', 'Begin Skirmish', 'Mission deployed.', 'First enemy assault in',
    'Operation paused. Choose an action.', 'Resume Operation', 'Restart Operation', 'Save / Load',
    'Audio Settings', 'Controls', 'Accessibility', 'Quit to Operations', 'Messages', 'Message history',
    'Clear history', 'Skirmish — Custom Match', 'Battlefield', 'Your faction', 'Opponent', 'AI difficulty',
    'scripted pressure', ' objectives', 'Visual, motion & controls', 'UI scale', 'Text scale',
    'Color-vision preset', 'Cursor size', 'Key bindings', 'Audio preferences', 'Accessibility preferences',
  ];
  for (const token of forbidden) assert(!combined.includes(token), `${label} still exposes English runtime copy: ${token}`);
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(combined), `${label} did not render Ukrainian copy.`);
}

try {
  await session.call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await session.call('Page.navigate', { url: pageUrl });
  await session.waitFor(
    `document.readyState === 'complete' && document.querySelector('#localeToggle') && window.__fieldsOfResolveLocalization && window.__fieldsOfResolveLiveRuntimeLocalization && document.querySelector('[data-campaign-operation-id]')`,
    'localized operation selector',
  );

  report.selector.english = await snapshot();
  assert(report.selector.english.locale === 'en', 'Selector must begin in English.');
  assert(report.selector.english.pauseToggle === 'Pause', 'Selector English pause action changed unexpectedly.');
  assert(report.selector.english.operationHeadings.length === 9, 'Expected all nine authored operation cards in English.');

  await switchLocale('uk');
  report.selector.ukrainian = await snapshot();
  assertUkrainianSurface(report.selector.ukrainian, 'operation selector');
  assert(report.selector.ukrainian.pauseToggle === 'Пауза', 'Pause action did not localize on selector.');
  assert(report.selector.ukrainian.operationHeadings.length === 9, 'Expected all nine authored operation cards in Ukrainian.');
  assert(report.selector.ukrainian.operationHeadings.every((heading) => /[А-ЯІЇЄҐа-яіїєґ]/u.test(heading)), 'An authored operation title remained non-Ukrainian.');
  assert(report.selector.ukrainian.operationCards.every((card) => card.includes('Авторська операція кампанії')), 'An authored operation summary did not localize.');

  await switchLocale('en');
  report.selector.restored = await snapshot();
  assert(report.selector.restored.pauseToggle === 'Pause', 'Selector did not restore English pause action.');
  assert(report.selector.restored.operationHeadings.length === 9, 'Selector lost authored operation cards after English restoration.');
  assert(report.selector.restored.operationHeadings.every((heading) => !/[А-ЯІЇЄҐа-яіїєґ]/u.test(heading)), 'Selector retained stale Ukrainian operation titles.');

  await startFirstAuthoredOperation();
  report.mission.english = await snapshot();
  assert(report.mission.english.locale === 'en' && report.mission.english.authoredStage === 'battlefield', 'Mission did not start in English.');
  assert(/Mission deployed|First enemy assault/.test(report.mission.english.toast), 'Expected English mission deployment toast before locale switch.');

  await switchLocale('uk');
  await session.waitFor(`document.querySelector('#missionTitle')?.textContent && document.querySelector('#pauseMenuToggle')?.textContent === 'Пауза'`, 'Ukrainian active mission presentation');
  report.mission.ukrainian = await snapshot();
  assertUkrainianSurface(report.mission.ukrainian, 'active mission');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.mission.ukrainian.missionTitle), 'Mission title did not localize.');
  assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.mission.ukrainian.objectives), 'Mission objectives did not localize.');
  if (report.mission.ukrainian.toast) assert(/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.mission.ukrainian.toast), 'Mission toast did not localize.');

  await session.evaluate(`document.querySelector('#pauseMenuToggle').click()`);
  await session.waitFor(`!document.querySelector('#pauseMenu')?.classList.contains('hidden')`, 'Ukrainian pause menu');
  report.mission.pause = await snapshot();
  assertUkrainianSurface(report.mission.pause, 'pause menu');
  assert(report.mission.pause.pauseMenu.includes('Продовжити'), 'Pause menu actions are not Ukrainian.');

  await session.evaluate(`document.querySelector('[data-menu-action="settings"]').click()`);
  await session.waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'Ukrainian audio settings');
  report.mission.settings = await snapshot();
  assertUkrainianSurface(report.mission.settings, 'audio/accessibility settings');
  assert(report.mission.settings.audioSettings.includes('Налаштування'), 'Settings heading is not Ukrainian.');
  await session.evaluate(`document.querySelector('#audioSettingsDone').click()`);
  await session.waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden') && !document.querySelector('#pauseMenu')?.classList.contains('hidden')`, 'pause menu return from settings');
  await session.evaluate(`document.querySelector('#pauseMenuClose').click()`);
  await session.waitFor(`document.querySelector('#pauseMenu')?.classList.contains('hidden')`, 'pause menu close');

  await session.evaluate(`document.querySelector('.notificationHistoryToggle')?.click()`);
  await session.waitFor(`!document.querySelector('.notificationHistory')?.classList.contains('hidden')`, 'Ukrainian notification history');
  report.mission.notifications = await snapshot();
  assertUkrainianSurface(report.mission.notifications, 'notification center');
  assert(report.mission.notifications.notifications.includes('Історія повідомлень'), 'Notification history did not localize.');
  await session.evaluate(`document.querySelector('.notificationHistory button')?.click()`);

  await switchLocale('en');
  report.mission.restored = await snapshot();
  assert(report.mission.restored.pauseToggle === 'Pause', 'Active mission did not restore English pause action.');
  assert(!/[А-ЯІЇЄҐа-яіїєґ]/u.test(report.mission.restored.pauseToggle), 'Active mission retained stale Ukrainian pause copy.');
  assert(report.mission.restored.missionTitle && !report.mission.restored.missionTitle.includes('Сівер'), 'Mission title did not restore English.');

  report.browserErrors = session.events
    .filter((event) => event.method === 'Runtime.exceptionThrown'
      || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error'))
    .map((event) => event.params);
  assert(report.browserErrors.length === 0, `Browser reported ${report.browserErrors.length} live-locale error(s).`);

  await writeFile(join(artifacts, 'live-locale-browser-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('[live-locale-smoke] selector and active mission en → uk → en localization passed.');
} catch (error) {
  report.error = error.stack || error.message;
  report.diagnostics = session.diagnostics();
  await writeFile(join(artifacts, 'live-locale-browser-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  try { await session.captureScreenshot(join(artifacts, 'live-locale-browser-failure.png')); } catch {}
  throw error;
} finally {
  await session.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
