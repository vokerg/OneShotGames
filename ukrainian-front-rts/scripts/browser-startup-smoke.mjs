import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_PROLOGUE_ID, TUTORIAL_STEPS } from '../src/content/campaign/tutorial-prologue.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'artifacts');
const host = '127.0.0.1';
const port = 4173;
const browserPort = 9222;
const pageUrl = `http://${host}:${port}/`;
const mime = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.js': 'text/javascript',
  '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const selectorUtilityControls = Object.freeze([
  Object.freeze({ name: 'language', selector: '#localeToggle' }),
  Object.freeze({ name: 'audio', selector: '#audioSettingsToggle' }),
  Object.freeze({ name: 'help', selector: '[data-onboarding-help-toggle]' }),
  Object.freeze({ name: 'fullscreen', selector: '#viewportFullscreenToggle' }),
]);
const battlefieldOnlyControls = Object.freeze(['#economyHudToggle', '#techTreeToggle', '#objectivesBtn']);


await mkdir(artifacts, { recursive: true });
const pathEntries = (process.env.PATH || '').split(delimiter);
const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser'].find((name) =>
  pathEntries.some((directory) => existsSync(join(directory, name))),
);
if (!browser) throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if (typeof WebSocket !== 'function') throw new Error('The browser smoke requires the Node.js WebSocket global.');

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
  } catch (error) { response.statusCode = 404; response.end(error.message); }
});
await new Promise((resolveReady, rejectReady) => { server.once('error', rejectReady); server.listen(port, host, resolveReady); });

const profile = await mkdtemp(join(tmpdir(), 'ufrts-smoke-'));
const logs = [];
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'about:blank',
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
    } catch (error) { logs.push(`[connect ${attempt + 1}] ${error.message}\n`); }
    await delay(250);
  }
  throw new Error('Chrome DevTools endpoint did not become available.');
}

function call(method, params = {}, timeoutMilliseconds = 5000) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`Cannot call ${method}: DevTools socket is not open.`));
  const id = nextId++;
  return new Promise((resolveCall, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome DevTools call timed out: ${method}`)); }, timeoutMilliseconds);
    pending.set(id, { reject, resolve: resolveCall, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const evaluation = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (evaluation.exceptionDetails) throw new Error(`Browser evaluation failed: ${evaluation.exceptionDetails.text || 'unknown error'}`);
  return evaluation.result?.value;
}

async function waitFor(expression, description) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { logs.push(`[wait ${description}] ${error.message}\n`); }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function selectorControlSnapshot() {
  const controls = JSON.stringify(selectorUtilityControls);
  return JSON.parse(await evaluate(`JSON.stringify((${controls}).map(({ name, selector }) => {
    const element = document.querySelector(selector);
    if (!element) return { name, selector, exists: false };
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    return {
      name,
      selector,
      exists: true,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      enabled: !element.disabled,
      keyboardReachable: element.tabIndex >= 0,
      hit: Boolean(target && (target === element || element.contains(target))),
      hitTarget: target?.id || (target?.hasAttribute?.('data-onboarding-help-toggle') ? 'onboarding-help-toggle' : target?.tagName || null),
      x,
      y,
    };
  }))`));
}

async function assertSelectorUtilityHitTargets(context) {
  const snapshot = await selectorControlSnapshot();
  const failures = snapshot.filter((control) =>
    !control.exists || !control.visible || !control.enabled || !control.keyboardReachable || !control.hit,
  );
  if (failures.length) throw new Error(`${context} utility controls are not reachable: ${JSON.stringify(failures)}`);
  return snapshot;
}

async function selectorBattlefieldControlSnapshot() {
  const selectors = JSON.stringify(battlefieldOnlyControls);
  return JSON.parse(await evaluate(`JSON.stringify((${selectors}).map((selector) => {
    const element = document.querySelector(selector);
    const style = element ? getComputedStyle(element) : null;
    const rect = element?.getBoundingClientRect?.();
    return {
      selector,
      exists: Boolean(element),
      visible: Boolean(element && style?.display !== 'none' && style?.visibility !== 'hidden' && rect?.width > 0 && rect?.height > 0),
    };
  }))`));
}

async function pointerActivate(selector, label) {
  const point = JSON.parse(await evaluate(`JSON.stringify((() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    return { x, y, hit: Boolean(target && (target === element || element.contains(target))) };
  })())`));
  if (!point?.hit) throw new Error(`${label} pointer hit target is intercepted before activation.`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}

async function keyboardActivate(selector, label) {
  const focused = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element?.focus();
    return Boolean(element && document.activeElement === element);
  })()`);
  if (!focused) throw new Error(`${label} could not receive keyboard focus.`);
  const key = {
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  };
  await call('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

async function exerciseSelectorUtilities() {
  const initialLocale = await evaluate('document.documentElement.lang');
  await pointerActivate('#localeToggle', 'Language control');
  await waitFor(`document.documentElement.lang !== ${JSON.stringify(initialLocale)}`, 'pointer locale activation');
  await keyboardActivate('#localeToggle', 'Language control');
  await waitFor(`document.documentElement.lang === ${JSON.stringify(initialLocale)}`, 'keyboard locale activation');

  await pointerActivate('#audioSettingsToggle', 'Audio control');
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'pointer audio activation');
  await evaluate(`document.querySelector('#audioSettingsDone')?.click()`);
  await waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'audio close after pointer activation');
  await keyboardActivate('#audioSettingsToggle', 'Audio control');
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'keyboard audio activation');
  await evaluate(`document.querySelector('#audioSettingsDone')?.click()`);
  await waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden')`, 'audio close after keyboard activation');

  await pointerActivate('[data-onboarding-help-toggle]', 'Help control');
  await waitFor(`document.querySelector('#onboardingHelp')?.hidden === false`, 'pointer help activation');
  await evaluate(`document.querySelector('[data-help-close]')?.click()`);
  await waitFor(`document.querySelector('#onboardingHelp')?.hidden === true`, 'help close after pointer activation');
  await keyboardActivate('[data-onboarding-help-toggle]', 'Help control');
  await waitFor(`document.querySelector('#onboardingHelp')?.hidden === false`, 'keyboard help activation');
  await evaluate(`document.querySelector('[data-help-close]')?.click()`);
  await waitFor(`document.querySelector('#onboardingHelp')?.hidden === true`, 'help close after keyboard activation');

  await evaluate(`(() => {
    window.__bug273FullscreenCalls = 0;
    window.__bug273OriginalRequestFullscreen = document.documentElement.requestFullscreen;
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async () => { window.__bug273FullscreenCalls += 1; },
    });
  })()`);
  try {
    await pointerActivate('#viewportFullscreenToggle', 'Fullscreen control');
    await waitFor('window.__bug273FullscreenCalls === 1', 'pointer fullscreen activation');
    await keyboardActivate('#viewportFullscreenToggle', 'Fullscreen control');
    await waitFor('window.__bug273FullscreenCalls === 2', 'keyboard fullscreen activation');
  } finally {
    await evaluate(`(() => {
      const original = window.__bug273OriginalRequestFullscreen;
      if (original) Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: original });
      else delete document.documentElement.requestFullscreen;
      delete window.__bug273OriginalRequestFullscreen;
      delete window.__bug273FullscreenCalls;
    })()`);
  }
}

async function startFirstAuthoredOperation() {
  await waitFor(
    `document.querySelector('[data-campaign-operation-id] button:not([disabled])') && document.querySelector('[data-campaign-prologue-card] button') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.operationCount === 9 && window.__fieldsOfResolveAuthoredCampaign?.tutorialSnapshot && window.__fieldsOfResolveOnboarding?.snapshot`,
    'authored operation selector and onboarding runtime',
  );
  await delay(850);
  const selectorState = JSON.parse(await evaluate(`JSON.stringify({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    hintVisible: Boolean(document.querySelector('[data-onboarding-hint]') && !document.querySelector('[data-onboarding-hint]').hidden),
    guides: window.__fieldsOfResolveOnboarding.search('', { category: 'guide' }).length,
    glossary: window.__fieldsOfResolveOnboarding.search('', { category: 'glossary' }).length
  })`));
  if (selectorState.tutorial.status !== 'inactive' || selectorState.hintVisible || selectorState.guides !== 0 || selectorState.glossary < 1) {
    throw new Error(`Fresh selector leaked tutorial onboarding: ${JSON.stringify(selectorState)}`);
  }

  await evaluate(`document.querySelector('[data-campaign-prologue-card] button').click()`);
  await waitFor(
    `window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().activeStepId === ${JSON.stringify(TUTORIAL_STEPS[0].id)} && !document.querySelector('[data-onboarding-hint]')?.hidden`,
    'first authored tutorial marker',
  );
  const firstHint = JSON.parse(await evaluate(`JSON.stringify({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    title: document.querySelector('[data-onboarding-hint] [data-hint-title]')?.textContent,
    prompt: document.querySelector('[data-onboarding-hint] [data-hint-prompt]')?.textContent
  })`));
  if (firstHint.tutorial.runtimeId !== TUTORIAL_PROLOGUE_ID || firstHint.tutorial.marker?.id !== TUTORIAL_STEPS[0].id || !firstHint.title || !firstHint.prompt) {
    throw new Error(`First authored tutorial marker did not render: ${JSON.stringify(firstHint)}`);
  }

  const rejectedForeign = await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.click', 'foreign-runtime') === false`);
  if (!rejectedForeign) throw new Error('Foreign tutorial runtime event was accepted.');
  await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.click', ${JSON.stringify(TUTORIAL_PROLOGUE_ID)})`);
  await evaluate(`window.__fieldsOfResolveAuthoredCampaign.tutorialEvent('selection.box', ${JSON.stringify(TUTORIAL_PROLOGUE_ID)})`);
  await waitFor(
    `window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().activeStepId === ${JSON.stringify(TUTORIAL_STEPS[1].id)}`,
    'next authored tutorial marker',
  );
  const nextHint = JSON.parse(await evaluate(`JSON.stringify({
    tutorial: window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot(),
    title: document.querySelector('[data-onboarding-hint] [data-hint-title]')?.textContent
  })`));
  if (nextHint.tutorial.marker?.id !== TUTORIAL_STEPS[1].id || !nextHint.title || nextHint.title === firstHint.title) {
    throw new Error(`Authored tutorial runtime did not advance onboarding: ${JSON.stringify({ firstHint, nextHint })}`);
  }

  await evaluate(`[...document.querySelectorAll('[data-campaign-prologue] button')].find((button) => button.textContent.includes('Continue to First Operation'))?.click()`);
  await waitFor(
    `document.querySelector('[data-campaign-briefing] button.primary') && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.stage === 'briefing' && window.__fieldsOfResolveAuthoredCampaign.tutorialSnapshot().status === 'inactive'`,
    'authored operation briefing after tutorial',
  );
  const operationHelp = JSON.parse(await evaluate(`JSON.stringify({
    hintVisible: Boolean(document.querySelector('[data-onboarding-hint]') && !document.querySelector('[data-onboarding-hint]').hidden),
    guides: window.__fieldsOfResolveOnboarding.search('', { category: 'guide' }).length,
    glossary: window.__fieldsOfResolveOnboarding.search('', { category: 'glossary' }).length
  })`));
  if (operationHelp.hintVisible || operationHelp.guides !== 0 || operationHelp.glossary < 1) {
    throw new Error(`Non-tutorial operation leaked tutorial onboarding: ${JSON.stringify(operationHelp)}`);
  }

  await evaluate(`document.querySelector('[data-campaign-briefing] button.primary').click()`);
  await waitFor(
    `document.querySelector('#missionSelect')?.classList.contains('hidden') && document.querySelector('#missionTitle')?.textContent && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.stage === 'battlefield' && window.__fieldsOfResolveAuthoredCampaign?.snapshot()?.authoredMission === true`,
    'authored operation battlefield',
  );
}

try {
  await connect();
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Page.navigate', { url: pageUrl });
  await waitFor(`document.readyState === 'complete' && document.querySelector('.missionCard button')`, 'mission selection to become interactive');
  await waitFor(
    `document.querySelector('#audioSettingsToggle') && window.__fieldsOfResolveComposition?.audio()?.settings?.settings?.settings`,
    'audio settings composition to mount',
  );

  const selectorUtilities = await assertSelectorUtilityHitTargets('Operation selector');
  const selectorBattlefieldControls = await selectorBattlefieldControlSnapshot();
  if (selectorBattlefieldControls.some((control) => !control.exists || control.visible)) {
    throw new Error(`Battlefield-only controls remain exposed on the operation selector: ${JSON.stringify(selectorBattlefieldControls)}`);
  }
  const selectorLayering = JSON.parse(await evaluate(`JSON.stringify({
    topbar: getComputedStyle(document.querySelector('#topbar')).zIndex,
    selector: getComputedStyle(document.querySelector('#missionSelect')).zIndex,
  })`));
  if (!(Number(selectorLayering.topbar) > Number(selectorLayering.selector))) {
    throw new Error(`Selector utility tray is not above the selector: ${JSON.stringify(selectorLayering)}`);
  }
  await exerciseSelectorUtilities();

  await evaluate(`(() => { const toggle = document.querySelector('#audioSettingsToggle'); toggle.focus(); toggle.click(); })()`);
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden') && document.querySelector('#shell')?.inert === true`, 'audio settings modal isolation');
  await evaluate(`(() => { const slider = document.querySelector('[data-audio-level="music"]'); slider.value = '37'; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(
    `window.__fieldsOfResolveComposition?.audio()?.settings?.settings?.settings?.levels?.music === 0.37 && JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1'))?.levels?.music === 0.37`,
    'audio level persistence and diagnostics',
  );
  await evaluate(`document.querySelector('#audioVisualCueTest').click()`);
  await waitFor(`!document.querySelector('#audioVisualCue')?.classList.contains('hidden') && document.querySelector('#audioVisualCue')?.textContent.includes('Incoming attack')`, 'hearing-accessible visual cue');

  const audioState = JSON.parse(await evaluate(`JSON.stringify({
    mounted: Boolean(window.__fieldsOfResolveComposition?.audio()?.settings),
    panelOpen: !document.querySelector('#audioSettings')?.classList.contains('hidden'),
    shellIsolated: document.querySelector('#shell')?.inert === true && document.querySelector('#shell')?.getAttribute('aria-hidden') === 'true',
    requestedMusic: window.__fieldsOfResolveComposition?.audio()?.settings?.settings?.settings?.levels?.music,
    effectiveMusic: window.__fieldsOfResolveComposition?.audio()?.settings?.settings?.effectiveLevels?.music,
    persistedMusic: JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1'))?.levels?.music,
    visualCue: document.querySelector('#audioVisualCue')?.textContent,
    visualCueUrgency: document.querySelector('#audioVisualCue')?.dataset?.urgency
  })`));

  await evaluate(`document.querySelector('#audioSettingsDone').click()`);
  await waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden') && document.querySelector('#shell')?.inert === false && document.activeElement === document.querySelector('#audioSettingsToggle')`, 'audio settings close and focus restoration');
  audioState.panelClosed = true;
  audioState.focusRestored = true;

  await startFirstAuthoredOperation();
  const battlefieldUtilities = await assertSelectorUtilityHitTargets('Battlefield');
  const battlefieldControls = await selectorBattlefieldControlSnapshot();
  if (battlefieldControls.some((control) => !control.exists || !control.visible)) {
    throw new Error(`Battlefield controls did not return after operation start: ${JSON.stringify(battlefieldControls)}`);
  }
  await waitFor(`document.querySelector('#pauseMenuToggle') && document.querySelector('#pauseMenu')?.getAttribute('aria-hidden') === 'true'`, 'pause menu composition to mount');

  await evaluate(`(() => { const toggle = document.querySelector('#pauseMenuToggle'); toggle.focus(); toggle.click(); })()`);
  await waitFor(
    `!document.querySelector('#pauseMenu')?.classList.contains('hidden') && document.querySelector('#pauseMenu')?.getAttribute('aria-hidden') === 'false' && document.querySelector('#shell')?.inert === true && document.querySelector('#pauseMenuToggle')?.getAttribute('aria-expanded') === 'true'`,
    'pause menu modal isolation',
  );
  const menuState = { mounted: true, panelOpen: true, shellIsolated: true };

  await evaluate(`document.querySelector('[data-menu-action="controls"]').click()`);
  await waitFor(`document.querySelector('#pauseMenuContent h3')?.textContent === 'Controls'`, 'pause menu controls view');
  menuState.controlsView = true;
  await evaluate(`document.querySelector('[data-menu-action="back"]').click()`);
  await waitFor(`document.querySelector('[data-menu-action="restart"]')`, 'pause menu main view restoration');

  await evaluate(`document.querySelector('[data-menu-action="restart"]').click()`);
  await waitFor(`document.querySelector('#pauseMenuContent h3')?.textContent === 'Restart operation?' && document.querySelector('[data-menu-action="confirm"]')`, 'restart destructive confirmation');
  menuState.destructiveConfirmation = true;
  await evaluate(`document.querySelector('[data-menu-action="cancel-confirm"]').click()`);
  await waitFor(`document.querySelector('[data-menu-action="settings"]')`, 'pause menu after confirmation cancellation');

  await evaluate(`document.querySelector('[data-menu-action="settings"]').click()`);
  await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden') && document.querySelector('#pauseMenu')?.classList.contains('hidden') && document.querySelector('#shell')?.inert === true`, 'audio settings handoff from pause menu');
  menuState.audioSettingsHandoff = true;
  await evaluate(`document.querySelector('#audioSettingsDone').click()`);
  await waitFor(`document.querySelector('#audioSettings')?.classList.contains('hidden') && !document.querySelector('#pauseMenu')?.classList.contains('hidden') && document.querySelector('#pauseMenu')?.getAttribute('aria-hidden') === 'false' && document.querySelector('#shell')?.inert === true`, 'pause menu restoration after audio settings');
  menuState.restoredAfterSettings = true;

  await evaluate(`document.querySelector('#pauseMenuClose').click()`);
  await waitFor(`document.querySelector('#pauseMenu')?.classList.contains('hidden') && document.querySelector('#pauseMenu')?.getAttribute('aria-hidden') === 'true' && document.querySelector('#shell')?.inert === false && document.querySelector('#pauseMenuToggle')?.getAttribute('aria-expanded') === 'false' && document.activeElement === document.querySelector('#pauseMenuToggle')`, 'pause menu resume and focus restoration');
  menuState.panelClosed = true;
  menuState.focusRestored = true;

  const state = JSON.parse(await evaluate(`JSON.stringify({
    title: document.querySelector('#missionTitle')?.textContent,
    hidden: document.querySelector('#missionSelect')?.classList.contains('hidden'),
    canvas: document.querySelector('#game')?.width > 0 && document.querySelector('#game')?.height > 0,
    missionCards: document.querySelectorAll('.missionCard').length,
    campaign: window.__fieldsOfResolveAuthoredCampaign?.snapshot?.()
  })`));
  state.audio = audioState;
  state.menu = menuState;
  state.selectorUtilities = selectorUtilities;
  state.selectorBattlefieldControls = selectorBattlefieldControls;
  state.selectorLayering = selectorLayering;
  state.battlefieldUtilities = battlefieldUtilities;
  state.battlefieldControls = battlefieldControls;
  const failures = events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' || event.method === 'Inspector.targetCrashed' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') ||
    (event.method === 'Network.loadingFailed' && !event.params?.canceled),
  );
  const warnings = events.filter((event) => event.method === 'Log.entryAdded' && event.params?.entry?.level === 'warning');
  const audioPassed = state.audio.mounted && state.audio.panelOpen && state.audio.panelClosed && state.audio.shellIsolated && state.audio.focusRestored && state.audio.requestedMusic === 0.37 && state.audio.persistedMusic === 0.37 && state.audio.effectiveMusic === 0.37 && state.audio.visualCue?.includes('Incoming attack') && state.audio.visualCueUrgency === 'critical';
  const menuPassed = state.menu.mounted && state.menu.panelOpen && state.menu.panelClosed && state.menu.shellIsolated && state.menu.controlsView && state.menu.destructiveConfirmation && state.menu.audioSettingsHandoff && state.menu.restoredAfterSettings && state.menu.focusRestored;
  const campaignPassed = state.campaign?.operationCount === 9 && state.campaign?.authoredMission === true && state.campaign?.mapId;
  if (!state.title || !state.hidden || !state.canvas || !audioPassed || !menuPassed || !campaignPassed || failures.length) {
    try {
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(artifacts, 'browser-startup-failure.png'), Buffer.from(shot.data, 'base64'));
    } catch (screenshotError) { logs.push(`[screenshot] ${screenshotError.stack || screenshotError.message}\n`); }
    throw new Error(`Browser smoke failed: ${JSON.stringify({ state, failures, warnings })}`);
  }

  await writeFile(join(artifacts, 'browser-startup-smoke.json'), JSON.stringify({ status: 'passed', state, warnings }, null, 2));
  console.log(`[browser-smoke] authored mission started after runtime-aware tutorial onboarding: ${state.title}; audio settings and pause menu exercised; warnings: ${warnings.length}`);
} catch (error) {
  await writeFile(join(artifacts, 'browser-startup.log'), `${logs.join('')}\n${error.stack}\n`);
  throw error;
} finally {
  socket?.close();
  if (!chromeExited) chrome.kill('SIGTERM');
  await Promise.race([chromeExit, delay(2000)]);
  if (!chromeExited) chrome.kill('SIGKILL');
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
}
