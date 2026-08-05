import { createMenuController } from '../ui/menu-controller.js';
import { createBattlefieldCheckpointStore } from './battlefield-checkpoint.js';

const SETTINGS_KEY = 'fields-of-resolve.menu-settings.v1';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STYLE_TEXT = `
#gameMenuToggle{min-width:72px}
#gameMenuOverlay{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;background:rgba(3,9,13,.78);backdrop-filter:blur(3px)}
#gameMenuOverlay.hidden{display:none}
.gameMenuCard{width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:2px solid #a8b8a4;background:#101a1b;color:#edf2e8;box-shadow:0 18px 64px #000;padding:22px;font-family:system-ui,sans-serif}
.gameMenuHeader{display:flex;justify-content:space-between;gap:16px;align-items:start;border-bottom:1px solid #51605a;margin-bottom:18px;padding-bottom:12px}
.gameMenuHeader h1{margin:0;font-size:1.55rem}.gameMenuHeader small{letter-spacing:.15em;color:#b6c5b7}.gameMenuClose{font-size:1.4rem}
.gameMenuGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gameMenuGrid button,.gameMenuActions button,.gameMenuSlot button{min-height:44px}
.gameMenuGrid button{display:flex;justify-content:space-between;align-items:center;padding:10px 14px}.gameMenuGrid button span{opacity:.68;font-size:.82rem}
.gameMenuActions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.gameMenuActions .danger{border-color:#c66;color:#ffd8d8}
.gameMenuSlots{display:grid;gap:10px}.gameMenuSlot{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #51605a;padding:12px}.gameMenuSlot strong,.gameMenuSlot small{display:block}.gameMenuSlot small{opacity:.72;margin-top:3px}
.gameMenuField{display:grid;grid-template-columns:minmax(180px,1fr) minmax(160px,.7fr);gap:14px;align-items:center;margin:12px 0}.gameMenuField input[type=checkbox]{justify-self:start}.gameMenuField select{min-height:38px}
.gameMenuHelp{display:grid;grid-template-columns:minmax(130px,.4fr) 1fr;gap:8px 18px}.gameMenuHelp dt{font-weight:700}.gameMenuHelp dd{margin:0;opacity:.84}
.gameMenuStatus{min-height:1.4em;color:#c7d8c5}.gameMenuConfirm{border:1px solid #8f6d5b;background:#251d1a;padding:16px}.gameMenuConfirm h2{margin-top:0}
html.menuHighContrast #gameMenuOverlay{background:#000}html.menuHighContrast .gameMenuCard{background:#000;color:#fff;border-color:#fff}
html.menuReducedMotion *,html.menuReducedMotion *::before,html.menuReducedMotion *::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
@media(max-width:600px){.gameMenuGrid{grid-template-columns:1fr}.gameMenuField{grid-template-columns:1fr}.gameMenuHelp{grid-template-columns:1fr}.gameMenuSlot{grid-template-columns:1fr}}
`;

function loadPreferences(storage) {
  try {
    return { reducedMotion: false, highContrast: false, uiScale: '100', ...JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { reducedMotion: false, highContrast: false, uiScale: '100' };
  }
}

function formatSlot(slot) {
  if (slot.corrupt) return 'Unreadable checkpoint';
  if (!slot.savedAt) return 'Empty';
  const date = new Date(slot.savedAt);
  return `${Number.isNaN(date.getTime()) ? slot.savedAt : date.toLocaleString()} · Operation ${(slot.missionIndex ?? 0) + 1}`;
}

export function installGameMenu({
  game,
  ui,
  runtime,
  storage = null,
  documentTarget = document,
  windowTarget = window,
}) {
  const topbar = documentTarget.querySelector('#topbar');
  if (!topbar) throw new Error('Game menu requires #topbar.');

  const checkpointStore = createBattlefieldCheckpointStore({ storage });
  const preferences = loadPreferences(storage);
  let externalDialog = false;
  let returnFocus = null;
  let status = '';

  const style = documentTarget.createElement('style');
  style.dataset.gameMenuStyle = 'true';
  style.textContent = STYLE_TEXT;
  documentTarget.head.append(style);

  const toggle = documentTarget.createElement('button');
  toggle.id = 'gameMenuToggle';
  toggle.type = 'button';
  toggle.textContent = 'Menu';
  toggle.setAttribute('aria-controls', 'gameMenuOverlay');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.dataset.tooltip = 'Pause and open mission options.';
  topbar.append(toggle);

  const overlay = documentTarget.createElement('section');
  overlay.id = 'gameMenuOverlay';
  overlay.className = 'hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'gameMenuTitle');
  overlay.innerHTML = '<div class="gameMenuCard" data-menu-card></div>';
  documentTarget.body.append(overlay);
  const card = overlay.querySelector('[data-menu-card]');

  const applyPreferences = () => {
    documentTarget.documentElement.classList.toggle('menuReducedMotion', preferences.reducedMotion);
    documentTarget.documentElement.classList.toggle('menuHighContrast', preferences.highContrast);
    documentTarget.documentElement.style.fontSize = `${preferences.uiScale}%`;
    try { storage?.setItem(SETTINGS_KEY, JSON.stringify(preferences)); } catch { /* optional storage */ }
  };
  applyPreferences();

  const controller = createMenuController({
    onPause: () => runtime.pause('menu'),
    onResume: () => runtime.resume('menu'),
  });

  const actionButton = (label, action, hint = '') => `<button type="button" data-menu-action="${action}">${label}${hint ? `<span>${hint}</span>` : ''}</button>`;

  const renderHeader = (title, eyebrow = 'MISSION CONTROL') => `
    <header class="gameMenuHeader"><div><small>${eyebrow}</small><h1 id="gameMenuTitle">${title}</h1></div><button type="button" class="gameMenuClose" data-menu-action="back" aria-label="Back">×</button></header>`;

  const renderPause = () => `${renderHeader('Paused')}
    <div class="gameMenuGrid">
      ${actionButton('Resume', 'resume', 'Esc')}
      ${actionButton('Save Checkpoint', 'screen-save', '3 slots')}
      ${actionButton('Load Checkpoint', 'screen-load', 'confirmation required')}
      ${actionButton('Settings', 'screen-settings', 'display & audio')}
      ${actionButton('Controls', 'screen-controls', 'keyboard & pointer')}
      ${actionButton('Accessibility', 'screen-accessibility', 'visual & hearing')}
    </div>
    <div class="gameMenuActions">
      <button type="button" data-menu-action="restart" class="danger">Restart Operation</button>
      <button type="button" data-menu-action="operations">Quit to Operations</button>
    </div>`;

  const renderSlots = (mode) => `${renderHeader(mode === 'save' ? 'Save Checkpoint' : 'Load Checkpoint', 'FIELD ARCHIVE')}
    <div class="gameMenuSlots">${checkpointStore.list().map((slot) => `
      <div class="gameMenuSlot"><div><strong>Slot ${slot.slot}</strong><small>${formatSlot(slot)}</small></div>
      <button type="button" data-menu-action="${mode}-slot" data-slot="${slot.slot}" ${mode === 'load' && !slot.savedAt ? 'disabled' : ''}>${mode === 'save' ? (slot.savedAt ? 'Overwrite' : 'Save') : 'Load'}</button></div>`).join('')}</div>
    <p class="gameMenuStatus" role="status" aria-live="polite">${status}</p>`;

  const renderSettings = () => `${renderHeader('Settings', 'FIELD CONFIGURATION')}
    <label class="gameMenuField"><span>Interface scale</span><select data-menu-preference="uiScale"><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option></select></label>
    <label class="gameMenuField"><span>High-contrast interface</span><input type="checkbox" data-menu-preference="highContrast" /></label>
    <label class="gameMenuField"><span>Reduce interface motion</span><input type="checkbox" data-menu-preference="reducedMotion" /></label>
    <div class="gameMenuActions"><button type="button" data-menu-action="audio">Audio & Hearing Accessibility</button></div>`;

  const renderControls = () => `${renderHeader('Controls', 'FIELD MANUAL')}
    <dl class="gameMenuHelp"><dt>Left click</dt><dd>Select units and activate commands</dd><dt>Shift + click</dt><dd>Add to selection or queue orders</dd><dt>Right click</dt><dd>Move, gather, enter transport, or attack</dd><dt>A</dt><dd>Attack-move mode</dd><dt>Escape</dt><dd>Cancel an active command, go back, or pause</dd><dt>Menu button</dt><dd>Pause and open mission options</dd></dl>`;

  const renderAccessibility = () => `${renderHeader('Accessibility', 'ACCESS SUPPORT')}
    <p>Visual preferences are available here and in Settings. Audio, subtitles, speaker labels, and visual sound cues use the dedicated audio-accessibility panel.</p>
    <label class="gameMenuField"><span>High-contrast interface</span><input type="checkbox" data-menu-preference="highContrast" /></label>
    <label class="gameMenuField"><span>Reduce interface motion</span><input type="checkbox" data-menu-preference="reducedMotion" /></label>
    <div class="gameMenuActions"><button type="button" data-menu-action="audio">Audio, Subtitles & Visual Cues</button></div>`;

  const renderConfirmation = (confirmation) => `${renderHeader(confirmation.title, 'CONFIRM ORDER')}
    <div class="gameMenuConfirm"><h2>${confirmation.title}</h2><p>${confirmation.message}</p><div class="gameMenuActions"><button type="button" data-menu-action="confirm" class="danger">${confirmation.confirmLabel}</button><button type="button" data-menu-action="cancel-confirm">Cancel</button></div></div>`;

  const render = (state) => {
    overlay.classList.toggle('hidden', !state.open || externalDialog);
    toggle.setAttribute('aria-expanded', String(state.open));
    if (!state.open) {
      queueMicrotask(() => returnFocus?.focus?.());
      return;
    }
    if (externalDialog) return;
    if (state.confirmation) card.innerHTML = renderConfirmation(state.confirmation);
    else if (state.screen === 'save' || state.screen === 'load') card.innerHTML = renderSlots(state.screen);
    else if (state.screen === 'settings') card.innerHTML = renderSettings();
    else if (state.screen === 'controls') card.innerHTML = renderControls();
    else if (state.screen === 'accessibility') card.innerHTML = renderAccessibility();
    else card.innerHTML = renderPause();

    card.querySelectorAll('[data-menu-preference]').forEach((element) => {
      const key = element.dataset.menuPreference;
      if (element.type === 'checkbox') element.checked = Boolean(preferences[key]);
      else element.value = String(preferences[key]);
    });
    queueMicrotask(() => card.querySelector(FOCUSABLE)?.focus());
  };

  const unsubscribe = controller.subscribe(render);

  const saveSlot = (slot) => {
    try {
      checkpointStore.save(slot, game);
      status = `Checkpoint saved in slot ${slot}.`;
      ui.toast(status);
    } catch (error) {
      status = error.message;
      ui.toast(status);
    }
    render(controller.snapshot());
  };

  const loadSlot = (slot) => controller.requestConfirmation({
    title: `Load slot ${slot}?`,
    message: 'Current unsaved battlefield progress will be replaced.',
    confirmLabel: 'Load Checkpoint',
    action: () => {
      try {
        checkpointStore.load(slot, game);
        runtime.resetClock();
        ui.setMission();
        ui.refresh();
        status = `Checkpoint ${slot} loaded.`;
        ui.toast(status);
        controller.close();
      } catch (error) {
        status = error.message;
        ui.toast(status);
        controller.show('load');
      }
    },
  });

  const openAudioDialog = () => {
    const audioToggle = documentTarget.querySelector('#audioSettingsToggle');
    const audioDialog = documentTarget.querySelector('#audioSettings');
    if (!audioToggle || !audioDialog) {
      status = 'Audio settings are unavailable.';
      render(controller.snapshot());
      return;
    }
    externalDialog = true;
    render(controller.snapshot());
    audioToggle.click();
    queueMicrotask(() => audioDialog.querySelector(FOCUSABLE)?.focus());
  };

  const onClick = (event) => {
    const actionTarget = event.target.closest?.('[data-menu-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.menuAction;
    if (action === 'resume') controller.close();
    else if (action === 'back') controller.back();
    else if (action === 'screen-save') controller.show('save');
    else if (action === 'screen-load') controller.show('load');
    else if (action === 'screen-settings') controller.show('settings');
    else if (action === 'screen-controls') controller.show('controls');
    else if (action === 'screen-accessibility') controller.show('accessibility');
    else if (action === 'save-slot') saveSlot(Number(actionTarget.dataset.slot));
    else if (action === 'load-slot') loadSlot(Number(actionTarget.dataset.slot));
    else if (action === 'restart') controller.requestConfirmation({ title: 'Restart operation?', message: 'Unsaved battlefield progress will be lost.', confirmLabel: 'Restart', action: () => { runtime.startMission(game.missionIndex); controller.close(); } });
    else if (action === 'operations') controller.requestConfirmation({ title: 'Quit to operations?', message: 'Unsaved battlefield progress will be lost.', confirmLabel: 'Quit to Operations', action: () => { game.mission = null; ui.showMissionSelect(); controller.close(); } });
    else if (action === 'confirm') controller.confirm();
    else if (action === 'cancel-confirm') controller.cancelConfirmation();
    else if (action === 'audio') openAudioDialog();
  };

  const onChange = (event) => {
    const preference = event.target.dataset?.menuPreference;
    if (!preference) return;
    preferences[preference] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    applyPreferences();
  };

  const isAllowedTarget = (target) => overlay.contains(target) || toggle.contains(target) || (externalDialog && (documentTarget.querySelector('#audioSettings')?.contains(target) || documentTarget.querySelector('#audioSettingsToggle')?.contains(target)));
  const capture = (event) => {
    if (!controller.capturesGameplayInput()) {
      if (event.type === 'keydown' && event.key === 'Escape' && game.mission) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onToggle();
      }
      return;
    }
    if (event.type === 'keydown') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (externalDialog) return;
        controller.back();
        return;
      }
      if (event.key === 'Tab' && !externalDialog) {
        const focusable = [...card.querySelectorAll(FOCUSABLE)];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && documentTarget.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && documentTarget.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    if (!isAllowedTarget(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onToggle = () => {
    if (!game.mission) return;
    returnFocus = documentTarget.activeElement;
    controller.toggle();
    if (!controller.snapshot().open) returnFocus?.focus?.();
  };

  const restoreAfterAudio = (event) => {
    if (!externalDialog) return;
    if (!event.target.closest?.('#audioSettingsClose, #audioSettingsDone')) return;
    queueMicrotask(() => {
      externalDialog = false;
      render(controller.snapshot());
    });
  };

  toggle.addEventListener('click', onToggle);
  overlay.addEventListener('click', onClick);
  overlay.addEventListener('change', onChange);
  documentTarget.addEventListener('click', restoreAfterAudio, true);
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel']) {
    windowTarget.addEventListener(type, capture, { capture: true, passive: false });
  }

  return Object.freeze({
    controller,
    checkpointStore,
    capturesGameplayInput: controller.capturesGameplayInput,
    dispose() {
      unsubscribe();
      toggle.removeEventListener('click', onToggle);
      overlay.removeEventListener('click', onClick);
      overlay.removeEventListener('change', onChange);
      documentTarget.removeEventListener('click', restoreAfterAudio, true);
      for (const type of ['keydown', 'pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel']) {
        windowTarget.removeEventListener(type, capture, { capture: true });
      }
      if (controller.snapshot().open) controller.close();
      toggle.remove();
      overlay.remove();
      style.remove();
      documentTarget.documentElement.classList.remove('menuReducedMotion', 'menuHighContrast');
      documentTarget.documentElement.style.fontSize = '';
    },
  });
}
