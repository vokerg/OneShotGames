import { MISSIONS } from '../config.js';
import { CAMPAIGN_SAVE_STATUSES } from '../core/campaign-save-service.js';
import {
  createCampaignProfile,
  validateCampaignProfile,
} from '../core/campaign-profile.js';
import {
  createMenuModel,
  createMenuState,
  createPauseController,
  MENU_CONFIRMATIONS,
  MENU_VIEWS,
} from './menu-stack-model.js';

const MANUAL_SLOT_ID = 'manual-1';
const MODAL_KEYS = new Set(['Tab', 'Enter', ' ', 'Spacebar', 'Escape']);
const CONTROL_GROUPS = Object.freeze([
  Object.freeze({ title: 'Selection', entries: Object.freeze([
    Object.freeze(['Left click', 'Select unit or structure']),
    Object.freeze(['Shift + click', 'Add or remove from selection']),
    Object.freeze(['Ctrl + click', 'Select matching units on screen']),
    Object.freeze(['1–9', 'Recall control group']),
    Object.freeze(['Ctrl + 1–9', 'Assign control group']),
  ]) }),
  Object.freeze({ title: 'Orders', entries: Object.freeze([
    Object.freeze(['Right click', 'Move, attack, gather, or interact']),
    Object.freeze(['Q', 'Attack-move']),
    Object.freeze(['X', 'Stop']),
    Object.freeze(['T', 'Toggle auto-fire']),
    Object.freeze(['Escape', 'Cancel placement or open pause menu']),
  ]) }),
  Object.freeze({ title: 'Camera', entries: Object.freeze([
    Object.freeze(['WASD / arrows', 'Pan camera']),
    Object.freeze(['Mouse wheel', 'Zoom']),
    Object.freeze(['Space', 'Focus current selection']),
    Object.freeze(['Minimap click', 'Move camera']),
  ]) }),
]);

function element(documentTarget, tagName, className = '', text = '') {
  const node = documentTarget.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(documentTarget, label, action, { disabled = false, className = '' } = {}) {
  const node = element(documentTarget, 'button', className, label);
  node.type = 'button';
  node.dataset.menuAction = action;
  node.disabled = disabled;
  return node;
}

function focusable(panel) {
  return [...(panel.querySelectorAll?.('button, input, select, [href], [tabindex]:not([tabindex="-1"])') ?? [])]
    .filter((item) => !item.disabled && item.getAttribute?.('aria-hidden') !== 'true');
}

function formatTimestamp(value) {
  if (!Number.isInteger(value)) return 'Unknown time';
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function appendStatus(root, model, documentTarget) {
  if (!model.status?.message) return;
  const status = element(documentTarget, 'p', `pauseMenuStatus tone-${model.status.tone}`, model.status.message);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(status);
}

function renderMain(root, model, documentTarget) {
  const intro = element(
    documentTarget,
    'p',
    'pauseMenuIntro',
    model.missionActive ? 'Operation paused. Choose an action.' : 'Campaign menu. No operation is currently running.',
  );
  const actions = element(documentTarget, 'div', 'pauseMenuActions');
  actions.append(
    button(documentTarget, 'Resume Operation', 'resume', { disabled: !model.missionActive, className: 'primary' }),
    button(documentTarget, 'Restart Operation', 'restart', { disabled: !model.missionActive }),
    button(documentTarget, 'Save / Load', 'saves'),
    button(documentTarget, 'Audio Settings', 'settings'),
    button(documentTarget, 'Controls', 'controls'),
    button(documentTarget, 'Accessibility', 'accessibility'),
    button(documentTarget, 'Quit to Operations', 'quit', { disabled: !model.missionActive, className: 'danger' }),
  );
  root.append(intro, actions);
}

function renderSaves(root, model, documentTarget) {
  const header = element(documentTarget, 'div', 'pauseMenuSectionHeader');
  const title = element(documentTarget, 'div');
  title.append(
    element(documentTarget, 'h3', '', 'Campaign Saves'),
    element(documentTarget, 'p', '', 'Manual saves preserve campaign profile state. Active mission snapshots require the checkpoint integration owner.'),
  );
  header.append(title, button(documentTarget, 'Back', 'back'));
  root.append(header);
  const controls = element(documentTarget, 'div', 'pauseMenuSaveControls');
  controls.append(button(documentTarget, 'Save Campaign', 'save', { disabled: !model.storageAvailable }));
  root.append(controls);
  const list = element(documentTarget, 'div', 'pauseMenuSaveList');
  if (!model.storageAvailable) {
    list.append(element(documentTarget, 'p', 'pauseMenuEmpty', 'Local storage is unavailable in this browser session.'));
  } else if (!model.slots.length) {
    list.append(element(documentTarget, 'p', 'pauseMenuEmpty', 'No campaign saves found.'));
  } else {
    for (const slot of model.slots) {
      const card = element(documentTarget, 'article', 'pauseMenuSaveCard');
      const info = element(documentTarget, 'div');
      info.append(
        element(documentTarget, 'strong', '', slot.label),
        element(documentTarget, 'small', '', slot.status === CAMPAIGN_SAVE_STATUSES.OK
          ? `${formatTimestamp(slot.updatedAt)}${slot.hasMissionState ? ' · mission checkpoint' : ' · campaign profile'}`
          : `${slot.status}${slot.error ? ` · ${slot.error}` : ''}`),
      );
      const actions = element(documentTarget, 'div', 'pauseMenuSaveCardActions');
      const load = button(documentTarget, 'Load', 'load-slot', { disabled: slot.status !== CAMPAIGN_SAVE_STATUSES.OK });
      load.dataset.slotId = slot.slotId;
      const remove = button(documentTarget, 'Delete', 'delete-slot', { className: 'danger' });
      remove.dataset.slotId = slot.slotId;
      actions.append(load, remove);
      card.append(info, actions);
      list.append(card);
    }
  }
  root.append(list);
}

function renderControls(root, documentTarget) {
  const header = element(documentTarget, 'div', 'pauseMenuSectionHeader');
  const title = element(documentTarget, 'div');
  title.append(element(documentTarget, 'h3', '', 'Controls'), element(documentTarget, 'p', '', 'Current keyboard and pointer bindings.'));
  header.append(title, button(documentTarget, 'Back', 'back'));
  root.append(header);
  const grid = element(documentTarget, 'div', 'pauseMenuControlGrid');
  for (const group of CONTROL_GROUPS) {
    const section = element(documentTarget, 'section', 'pauseMenuControlGroup');
    section.append(element(documentTarget, 'h4', '', group.title));
    const dl = element(documentTarget, 'dl');
    for (const [key, description] of group.entries) {
      dl.append(element(documentTarget, 'dt', '', key), element(documentTarget, 'dd', '', description));
    }
    section.append(dl);
    grid.append(section);
  }
  root.append(grid);
}

function renderAccessibility(root, documentTarget) {
  const header = element(documentTarget, 'div', 'pauseMenuSectionHeader');
  const title = element(documentTarget, 'div');
  title.append(
    element(documentTarget, 'h3', '', 'Accessibility'),
    element(documentTarget, 'p', '', 'Presentation and interaction support available in the assembled runtime.'),
  );
  header.append(title, button(documentTarget, 'Back', 'back'));
  const list = element(documentTarget, 'ul', 'pauseMenuAccessibilityList');
  [
    'Keyboard-operable menu controls with trapped focus and focus restoration.',
    'Subtitles, speaker labels, visual audio cues, dynamic range, and per-bus volume in Audio Settings.',
    'Shape-reinforced minimap markers and textual tactical alerts.',
    'Reduced-motion-safe menu presentation with no required animation.',
    'Native controls and status regions compatible with assistive technology.',
  ].forEach((item) => list.append(element(documentTarget, 'li', '', item)));
  root.append(header, list, button(documentTarget, 'Open Audio Accessibility', 'settings', { className: 'primary' }));
}

function renderConfirmation(root, model, documentTarget) {
  const confirmation = model.confirmation;
  root.append(
    element(documentTarget, 'h3', '', confirmation?.title || 'Confirm action'),
    element(documentTarget, 'p', 'pauseMenuConfirmText', confirmation?.message || 'Continue?'),
  );
  const actions = element(documentTarget, 'div', 'pauseMenuConfirmActions');
  actions.append(
    button(documentTarget, 'Cancel', 'cancel-confirm'),
    button(documentTarget, 'Confirm', 'confirm', { className: 'danger' }),
  );
  root.append(actions);
}

export function renderMenuStack(root, model, { documentTarget = document } = {}) {
  root.replaceChildren();
  if (model.view === MENU_VIEWS.SAVES) renderSaves(root, model, documentTarget);
  else if (model.view === MENU_VIEWS.CONTROLS) renderControls(root, documentTarget);
  else if (model.view === MENU_VIEWS.ACCESSIBILITY) renderAccessibility(root, documentTarget);
  else if (model.view === MENU_VIEWS.CONFIRM) renderConfirmation(root, model, documentTarget);
  else renderMain(root, model, documentTarget);
  appendStatus(root, model, documentTarget);
  return root;
}

function ensureMenuMarkup(documentTarget) {
  const created = [];
  let stylesheet = documentTarget.querySelector?.('link[data-menu-stack-styles]');
  if (!stylesheet) {
    stylesheet = documentTarget.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'menu-stack.css';
    stylesheet.dataset.menuStackStyles = 'true';
    documentTarget.head?.append?.(stylesheet);
    created.push(stylesheet);
  }

  let toggle = documentTarget.querySelector('#pauseMenuToggle');
  if (!toggle) {
    toggle = button(documentTarget, 'Pause', 'open-menu');
    toggle.id = 'pauseMenuToggle';
    toggle.setAttribute('aria-controls', 'pauseMenu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('data-tooltip', 'Pause the operation and open the game menu.');
    const topbar = documentTarget.querySelector('#topbar');
    const objectives = documentTarget.querySelector('#objectivesBtn');
    if (!topbar) throw new Error('Pause menu requires the existing top bar.');
    if (objectives && typeof topbar.insertBefore === 'function') topbar.insertBefore(toggle, objectives);
    else topbar.append(toggle);
    created.push(toggle);
  }

  let panel = documentTarget.querySelector('#pauseMenu');
  if (!panel) {
    panel = element(documentTarget, 'section', 'hidden');
    panel.id = 'pauseMenu';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'pauseMenuTitle');
    panel.setAttribute('aria-hidden', 'true');
    const card = element(documentTarget, 'div', 'pauseMenuCard');
    const header = element(documentTarget, 'header', 'pauseMenuHeader');
    const heading = element(documentTarget, 'div');
    const eyebrow = element(documentTarget, 'small', '', 'OPERATION MENU');
    const title = element(documentTarget, 'h2', '', 'Fields of Resolve');
    title.id = 'pauseMenuTitle';
    heading.append(eyebrow, title);
    const close = button(documentTarget, 'Resume', 'resume');
    close.id = 'pauseMenuClose';
    close.setAttribute('aria-label', 'Resume operation and close menu');
    const content = element(documentTarget, 'div');
    content.id = 'pauseMenuContent';
    header.append(heading, close);
    card.append(header, content);
    panel.append(card);
    documentTarget.body?.append?.(panel);
    created.push(panel);
  }
  return Object.freeze({
    panel,
    content: documentTarget.querySelector('#pauseMenuContent'),
    toggle,
    close: documentTarget.querySelector('#pauseMenuClose'),
    shell: documentTarget.querySelector('#shell'),
    dispose() {
      created.reverse().forEach((node) => node.remove?.());
    },
  });
}

function safeProfile(game) {
  try {
    if (game?.campaignProfile) return validateCampaignProfile(game.campaignProfile);
  } catch { /* fall through to repository default */ }
  return createCampaignProfile({
    profileId: 'default',
    initialOperationIds: MISSIONS.map((mission) => mission.id),
  });
}

export function installMenuStack({
  game,
  ui,
  runtime,
  storage = null,
  createSaveRuntime = null,
  audioSettings = () => null,
  documentTarget = document,
  windowTarget = window,
} = {}) {
  if (!game || !ui || !runtime || typeof runtime.startMission !== 'function') {
    throw new TypeError('Menu stack requires game, ui, and runtime services.');
  }
  if (storage && typeof createSaveRuntime !== 'function') {
    throw new TypeError('Menu stack requires a save runtime factory when storage is available.');
  }
  const markup = ensureMenuMarkup(documentTarget);
  const { panel, content, toggle, close, shell } = markup;
  if (!panel || !content || !toggle || !close || !shell) {
    markup.dispose();
    throw new Error('Pause menu markup is incomplete.');
  }

  const state = createMenuState();
  const pause = createPauseController(game);
  const previousProfile = game.campaignProfile;
  let profile = safeProfile(game);
  game.campaignProfile = profile;
  let previousFocus = null;
  let suspendedForSettings = false;
  let settingsTimer = null;
  const shellState = {
    inert: Boolean(shell.inert),
    ariaHidden: shell.getAttribute?.('aria-hidden'),
  };
  const panelState = {
    className: panel.className,
    ariaHidden: panel.getAttribute?.('aria-hidden'),
    content: [...(content.childNodes ?? [])],
  };
  const listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  const saveRuntime = storage ? createSaveRuntime({
    storage,
    captureState: () => ({ profile, missionState: null }),
    restoreState: ({ profile: restored }) => {
      profile = validateCampaignProfile(restored);
      game.campaignProfile = profile;
    },
  }) : null;

  const missionActive = () => Boolean(game.mission);
  const slots = () => saveRuntime?.listSlots?.() ?? [];
  const model = () => createMenuModel({
    state: state.snapshot(),
    slots: slots(),
    missionActive: missionActive(),
    storageAvailable: Boolean(saveRuntime),
  });
  const render = () => {
    renderMenuStack(content, model(), { documentTarget });
    const controls = focusable(panel);
    if (state.snapshot().open && !controls.includes(documentTarget.activeElement)) controls[0]?.focus?.();
  };
  const setShellModal = (modal) => {
    shell.inert = modal;
    if (modal) shell.setAttribute?.('aria-hidden', 'true');
    else if (shellState.ariaHidden == null) shell.removeAttribute?.('aria-hidden');
    else shell.setAttribute?.('aria-hidden', shellState.ariaHidden);
  };
  const open = () => {
    if (state.snapshot().open) return false;
    previousFocus = documentTarget.activeElement || toggle;
    state.open();
    pause.pause();
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    documentTarget.body?.classList?.add('pause-menu-open');
    setShellModal(true);
    render();
    close.focus?.();
    return true;
  };
  const closeMenu = ({ restoreFocus = true, resume = true } = {}) => {
    if (!state.snapshot().open && !suspendedForSettings) return false;
    state.close();
    suspendedForSettings = false;
    if (settingsTimer != null) {
      windowTarget.clearInterval?.(settingsTimer);
      settingsTimer = null;
    }
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    documentTarget.body?.classList?.remove('pause-menu-open');
    setShellModal(false);
    if (resume) pause.resume();
    if (restoreFocus) (previousFocus?.isConnected === false ? toggle : previousFocus || toggle)?.focus?.();
    previousFocus = null;
    return true;
  };
  const navigate = (view) => { state.navigate(view); render(); };
  const setStatus = (message, tone = 'info') => { state.setStatus(message, tone); render(); };
  const requestConfirmation = (kind, values = {}) => {
    const copy = {
      [MENU_CONFIRMATIONS.RESTART]: ['Restart operation?', 'Current mission progress will be discarded.'],
      [MENU_CONFIRMATIONS.LOAD]: ['Load campaign save?', 'Current mission progress will be discarded and the campaign profile will be restored.'],
      [MENU_CONFIRMATIONS.DELETE]: ['Delete campaign save?', 'This save slot will be permanently removed.'],
      [MENU_CONFIRMATIONS.QUIT]: ['Quit to operations?', 'Current mission progress since the last supported save will be discarded.'],
    }[kind];
    state.confirm({ kind, title: copy[0], message: copy[1], ...values });
    render();
  };
  const performConfirmation = () => {
    const confirmation = state.snapshot().confirmation;
    if (!confirmation) return;
    if (confirmation.kind === MENU_CONFIRMATIONS.RESTART) {
      runtime.startMission(game.missionIndex);
      closeMenu();
      ui.toast?.('Operation restarted.');
      return;
    }
    if (confirmation.kind === MENU_CONFIRMATIONS.QUIT) {
      game.mission = null;
      ui.showMissionSelect();
      closeMenu();
      return;
    }
    if (confirmation.kind === MENU_CONFIRMATIONS.LOAD) {
      const result = saveRuntime?.loadSlot(confirmation.slotId);
      if (result?.status === CAMPAIGN_SAVE_STATUSES.OK) {
        game.mission = null;
        ui.showMissionSelect();
        closeMenu();
        ui.toast?.('Campaign profile loaded. Select an operation to deploy.');
      } else {
        state.cancelConfirmation();
        setStatus(result?.error || `Save could not be loaded (${result?.status || 'unavailable'}).`, 'error');
      }
      return;
    }
    if (confirmation.kind === MENU_CONFIRMATIONS.DELETE) {
      try {
        saveRuntime?.deleteSlot(confirmation.slotId);
        state.navigate(MENU_VIEWS.SAVES);
        setStatus('Campaign save deleted.', 'success');
      } catch (error) {
        state.cancelConfirmation();
        setStatus(error.message, 'error');
      }
    }
  };
  const openSettings = () => {
    const settings = typeof audioSettings === 'function' ? audioSettings() : audioSettings;
    if (!settings?.open) {
      setStatus('Audio settings are unavailable in this browser session.', 'error');
      return;
    }
    suspendedForSettings = true;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    setShellModal(false);
    settings.open();
    settingsTimer = windowTarget.setInterval?.(() => {
      if (settings.snapshot?.().panelOpen) return;
      if (settingsTimer != null) windowTarget.clearInterval?.(settingsTimer);
      settingsTimer = null;
      if (!suspendedForSettings) return;
      suspendedForSettings = false;
      panel.classList.remove('hidden');
      panel.setAttribute('aria-hidden', 'false');
      setShellModal(true);
      render();
      close.focus?.();
    }, 100) ?? null;
  };

  const onAction = (event) => {
    const target = event.target?.closest?.('[data-menu-action]') || event.target;
    const action = target?.dataset?.menuAction;
    if (!action || target.disabled) return;
    if (action === 'resume') closeMenu();
    else if (action === 'restart') requestConfirmation(MENU_CONFIRMATIONS.RESTART);
    else if (action === 'saves') navigate(MENU_VIEWS.SAVES);
    else if (action === 'controls') navigate(MENU_VIEWS.CONTROLS);
    else if (action === 'accessibility') navigate(MENU_VIEWS.ACCESSIBILITY);
    else if (action === 'back') navigate(MENU_VIEWS.MAIN);
    else if (action === 'settings') openSettings();
    else if (action === 'quit') requestConfirmation(MENU_CONFIRMATIONS.QUIT);
    else if (action === 'cancel-confirm') { state.cancelConfirmation(); render(); }
    else if (action === 'confirm') performConfirmation();
    else if (action === 'save') {
      try {
        const saved = saveRuntime.saveSlot({
          slotId: MANUAL_SLOT_ID,
          label: missionActive() ? `Campaign during ${game.mission.title}` : 'Campaign profile',
        });
        setStatus(`Campaign saved at ${formatTimestamp(saved.updatedAt)}.`, 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      }
    } else if (action === 'load-slot') {
      requestConfirmation(MENU_CONFIRMATIONS.LOAD, { slotId: target.dataset.slotId });
    } else if (action === 'delete-slot') {
      requestConfirmation(MENU_CONFIRMATIONS.DELETE, { slotId: target.dataset.slotId });
    }
  };
  const anotherModalOpen = () => ['#techTree', '#audioSettings', '#endgame']
    .some((selector) => {
      const node = documentTarget.querySelector(selector);
      return node && !node.classList.contains('hidden');
    });
  const onKeyDown = (event) => {
    if (!state.snapshot().open) {
      if (event.key === 'Escape' && missionActive() && !anotherModalOpen()) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        open();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      if (state.snapshot().confirmation) {
        state.cancelConfirmation();
        render();
      } else if (state.snapshot().view !== MENU_VIEWS.MAIN) navigate(MENU_VIEWS.MAIN);
      else closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      const controls = focusable(panel);
      if (controls.length) {
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && documentTarget.activeElement === first) {
          event.preventDefault?.();
          last.focus?.();
        } else if (!event.shiftKey && documentTarget.activeElement === last) {
          event.preventDefault?.();
          first.focus?.();
        }
      }
    } else if (!MODAL_KEYS.has(event.key)) event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  listen(toggle, 'click', open);
  listen(close, 'click', () => closeMenu());
  listen(content, 'click', onAction);
  listen(windowTarget, 'keydown', onKeyDown, true);
  panel.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');

  return () => {
    listeners.splice(0).reverse().forEach((dispose) => dispose());
    closeMenu({ restoreFocus: false });
    pause.dispose();
    if (previousProfile === undefined) delete game.campaignProfile;
    else game.campaignProfile = previousProfile;
    shell.inert = shellState.inert;
    if (shellState.ariaHidden == null) shell.removeAttribute?.('aria-hidden');
    else shell.setAttribute?.('aria-hidden', shellState.ariaHidden);
    panel.className = panelState.className;
    if (panelState.ariaHidden == null) panel.removeAttribute?.('aria-hidden');
    else panel.setAttribute?.('aria-hidden', panelState.ariaHidden);
    content.replaceChildren?.(...panelState.content);
    markup.dispose();
  };
}
