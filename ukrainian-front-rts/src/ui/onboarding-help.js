import { TUTORIAL_STEPS } from '../content/campaign/tutorial-prologue.js';
import {
  INPUT_ACTION_IDS,
  INPUT_ACTION_LABELS,
  getRuntimeKeyBindings,
} from '../core/input-action-map.js';
import { createLocalizer } from '../localization/localization.js';
import { ONBOARDING_HELP_CATALOGS } from '../localization/onboarding-help-catalogs.js';

export const ONBOARDING_HELP_VERSION = 1;
export const ONBOARDING_STORAGE_KEY = 'fields-of-resolve:onboarding-help:v1';
export const ONBOARDING_GLOBAL = '__fieldsOfResolveOnboarding';
export const ONBOARDING_CONTEXT_EVENT = 'fields-of-resolve:onboarding-context';
export const ONBOARDING_LOCALE_EVENT = 'fields-of-resolve:localechange';

const GLOSSARY_IDS = Object.freeze([
  'attackMove',
  'commandCapacity',
  'controlGroup',
  'fogOfWar',
  'garrison',
  'rallyPoint',
  'reconnaissance',
  'stance',
  'suppression',
  'veterancy',
]);

const TOPIC_SELECTORS = Object.freeze([
  ['objectives', '#objectivesBtn, #objectives'],
  ['minimap', '#minimap, #minimapFilters, #minimapAlertQueue'],
  ['production', '#economyHudToggle, #economyHud, #abilities'],
  ['accessibility', '#audioSettingsToggle, #audioSettings'],
  ['selection', '#selectionPanel, #portrait'],
  ['movement', '#game'],
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalText(value) {
  return String(value ?? '').trim();
}

function camelId(value) {
  return canonicalText(value).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function normalizeKeyLabel(key) {
  const value = canonicalText(key).toLowerCase();
  const labels = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    escape: 'Esc',
    space: 'Space',
    tab: 'Tab',
  };
  return labels[value] ?? (value.length === 1 ? value.toUpperCase() : value);
}

function tokens(value) {
  return canonicalText(value)
    .toLocaleLowerCase()
    .normalize('NFKD')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function entrySearchText(entry) {
  return [
    entry.id,
    entry.category,
    entry.title,
    entry.summary,
    ...(entry.details ?? []),
    ...(entry.tags ?? []),
    ...(entry.keys ?? []),
  ].join(' ').toLocaleLowerCase();
}

function readState(storage, storageKey) {
  if (!storage?.getItem) return null;
  try {
    const parsed = JSON.parse(storage.getItem(storageKey));
    return parsed && parsed.version === ONBOARDING_HELP_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(storage, storageKey, state) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function defaultTranslator() {
  return createLocalizer(ONBOARDING_HELP_CATALOGS, { locale: 'en' }).t;
}

export function createControlReference(keyBindings = getRuntimeKeyBindings(), { translate = defaultTranslator() } = {}) {
  const keysByAction = Object.fromEntries(INPUT_ACTION_IDS.map((action) => [action, []]));
  for (const [key, action] of Object.entries(keyBindings ?? {})) {
    if (keysByAction[action] && !keysByAction[action].includes(key)) keysByAction[action].push(key);
  }
  return deepFreeze(INPUT_ACTION_IDS.map((action) => {
    const keys = keysByAction[action].map(normalizeKeyLabel);
    return {
      id: `control-${action}`,
      category: 'controls',
      title: translate(`onboarding.actions.${action}`) || INPUT_ACTION_LABELS[action] || action,
      summary: keys.length
        ? translate('onboarding.ui.currentBinding', { keys: keys.join(' / ') })
        : translate('onboarding.ui.unbound'),
      details: [],
      tags: ['keyboard', 'controls', action, INPUT_ACTION_LABELS[action] ?? action],
      keys,
      action,
    };
  }));
}

export function createOnboardingHelpCatalog({
  keyBindings = getRuntimeKeyBindings(),
  translate = defaultTranslator(),
} = {}) {
  const tutorials = TUTORIAL_STEPS.map((step) => {
    const messageId = camelId(step.id);
    return {
      id: `guide-${step.id}`,
      category: 'guide',
      topic: step.topic,
      title: translate(`onboarding.tutorials.${messageId}.title`),
      summary: translate(`onboarding.tutorials.${messageId}.prompt`),
      details: step.hints.map((_hint, index) => translate(`onboarding.tutorials.${messageId}.hint${index + 1}`)),
      tags: [step.topic, ...step.events, step.title, step.prompt, ...step.hints],
      keys: [],
    };
  });
  const glossary = GLOSSARY_IDS.map((id) => ({
    id: `glossary-${id}`,
    category: 'glossary',
    title: translate(`onboarding.glossary.${id}.term`),
    summary: translate(`onboarding.glossary.${id}.definition`),
    details: [],
    tags: ['glossary', id],
    keys: [],
  }));
  return deepFreeze([...tutorials, ...createControlReference(keyBindings, { translate }), ...glossary]);
}

export function searchOnboardingHelp(catalog, query = '', { category = 'all' } = {}) {
  if (!Array.isArray(catalog)) throw new TypeError('Onboarding help catalog must be an array.');
  const searchTokens = tokens(query);
  return deepFreeze(catalog
    .filter((entry) => category === 'all' || entry.category === category)
    .map((entry) => {
      const haystack = entrySearchText(entry);
      const matched = searchTokens.filter((token) => haystack.includes(token));
      const title = entry.title.toLocaleLowerCase();
      const score = searchTokens.length === 0
        ? 0
        : matched.reduce((total, token) => total + (title.includes(token) ? 4 : 1), 0);
      return { entry, matched: matched.length, score };
    })
    .filter(({ matched }) => searchTokens.length === 0 || matched === searchTokens.length)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
    .map(({ entry }) => entry));
}

export function createOnboardingHelpState({
  storage = null,
  storageKey = ONBOARDING_STORAGE_KEY,
  tutorialSteps = TUTORIAL_STEPS,
} = {}) {
  const stored = readState(storage, storageKey);
  let state = {
    version: ONBOARDING_HELP_VERSION,
    dismissedHintIds: [...new Set(stored?.dismissedHintIds ?? [])].filter(String),
    seenHintIds: [...new Set(stored?.seenHintIds ?? [])].filter(String),
  };

  const persist = () => writeState(storage, storageKey, state);
  const snapshot = () => deepFreeze({
    version: state.version,
    dismissedHintIds: [...state.dismissedHintIds].sort(),
    seenHintIds: [...state.seenHintIds].sort(),
    remainingHintIds: tutorialSteps
      .map((step) => step.id)
      .filter((id) => !state.dismissedHintIds.includes(id)),
  });
  const update = (changes) => {
    state = { ...state, ...changes };
    persist();
    return snapshot();
  };
  return Object.freeze({
    snapshot,
    hintForTopic(topic, { includeSeen = false } = {}) {
      const hint = tutorialSteps.find((step) => step.topic === topic && !state.dismissedHintIds.includes(step.id));
      if (!hint || (!includeSeen && state.seenHintIds.includes(hint.id))) return null;
      return hint;
    },
    nextHint() {
      return tutorialSteps.find((step) => !state.dismissedHintIds.includes(step.id) && !state.seenHintIds.includes(step.id))
        ?? tutorialSteps.find((step) => !state.dismissedHintIds.includes(step.id))
        ?? null;
    },
    markSeen(hintId) {
      const id = canonicalText(hintId);
      if (!id || state.seenHintIds.includes(id)) return snapshot();
      return update({ seenHintIds: [...state.seenHintIds, id] });
    },
    dismiss(hintId) {
      const id = canonicalText(hintId);
      if (!id || state.dismissedHintIds.includes(id)) return snapshot();
      return update({ dismissedHintIds: [...state.dismissedHintIds, id] });
    },
    dismissAll() {
      return update({ dismissedHintIds: tutorialSteps.map((step) => step.id) });
    },
    reset() {
      return update({ dismissedHintIds: [], seenHintIds: [] });
    },
  });
}

function editableTarget(target) {
  const tag = String(target?.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

function createDefaultView({ documentTarget, catalog: initialCatalog, state, translate: initialTranslate }) {
  let catalog = initialCatalog;
  let translate = initialTranslate;
  const topbar = documentTarget.querySelector('#topbar');
  const button = documentTarget.createElement('button');
  button.type = 'button';
  button.dataset.onboardingHelpToggle = '';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'onboardingHelp');
  topbar?.append(button);

  const panel = documentTarget.createElement('section');
  panel.id = 'onboardingHelp';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'onboardingHelpTitle');
  panel.style.cssText = 'position:fixed;inset:4vh 5vw;z-index:5000;overflow:auto;padding:20px;border:2px solid #b89b62;background:#171914;color:#f4f0df;box-shadow:0 18px 60px #000b;font:15px/1.45 system-ui,sans-serif;';
  panel.innerHTML = `
    <header style="display:flex;justify-content:space-between;gap:16px;align-items:start">
      <div><small data-help-eyebrow style="color:#d9b76c;letter-spacing:.08em"></small><h2 id="onboardingHelpTitle" style="margin:.25rem 0"></h2></div>
      <button type="button" data-help-close>×</button>
    </header>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin:14px 0">
      <label style="flex:1;min-width:220px"><span data-help-search-label></span> <input data-help-search type="search" autocomplete="off" style="width:100%" /></label>
      <label><span data-help-section-label></span> <select data-help-category><option value="all"></option><option value="guide"></option><option value="controls"></option><option value="glossary"></option></select></label>
      <button type="button" data-help-reset></button>
    </div>
    <p data-help-status role="status" aria-live="polite"></p>
    <div data-help-results></div>`;
  documentTarget.body.append(panel);

  const hint = documentTarget.createElement('aside');
  hint.hidden = true;
  hint.dataset.onboardingHint = '';
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  hint.style.cssText = 'position:fixed;right:18px;bottom:180px;z-index:4500;width:min(360px,calc(100vw - 36px));padding:14px;border:1px solid #b89b62;background:#171914;color:#f4f0df;box-shadow:0 8px 28px #0009;font:14px/1.4 system-ui,sans-serif;';
  hint.innerHTML = '<strong data-hint-title></strong><p data-hint-prompt></p><div style="display:flex;gap:8px"><button type="button" data-hint-open></button><button type="button" data-hint-dismiss></button><button type="button" data-hint-dismiss-all></button></div>';
  documentTarget.body.append(hint);

  const search = panel.querySelector('[data-help-search]');
  const category = panel.querySelector('[data-help-category]');
  const results = panel.querySelector('[data-help-results]');
  const status = panel.querySelector('[data-help-status]');
  let activeHintId = null;

  function renderResults() {
    const matches = searchOnboardingHelp(catalog, search.value, { category: category.value });
    results.replaceChildren(...matches.map((entry) => {
      const article = documentTarget.createElement('article');
      article.dataset.helpEntry = entry.id;
      article.style.cssText = 'padding:12px 0;border-top:1px solid #5c563f;';
      const title = documentTarget.createElement('h3');
      title.textContent = entry.title;
      title.style.margin = '0 0 4px';
      const summary = documentTarget.createElement('p');
      summary.textContent = entry.summary;
      summary.style.margin = '0';
      article.append(title, summary);
      if (entry.keys?.length) {
        const keys = documentTarget.createElement('p');
        keys.textContent = translate('onboarding.ui.keys', { keys: entry.keys.join(' / ') });
        keys.style.margin = '4px 0 0';
        article.append(keys);
      }
      if (entry.details?.length) {
        const list = documentTarget.createElement('ul');
        for (const detail of entry.details) {
          const item = documentTarget.createElement('li');
          item.textContent = detail;
          list.append(item);
        }
        article.append(list);
      }
      return article;
    }));
    status.textContent = translate('onboarding.ui.entries', { count: matches.length });
  }

  function renderActiveHint() {
    if (!activeHintId) return;
    const entry = catalog.find((candidate) => candidate.id === `guide-${activeHintId}`);
    if (!entry) {
      hideHint();
      return;
    }
    hint.querySelector('[data-hint-title]').textContent = entry.title;
    hint.querySelector('[data-hint-prompt]').textContent = entry.summary;
  }

  function applyLabels() {
    button.textContent = translate('onboarding.ui.help');
    button.setAttribute('data-tooltip', translate('onboarding.ui.helpTooltip'));
    panel.querySelector('[data-help-eyebrow]').textContent = translate('onboarding.ui.eyebrow');
    panel.querySelector('#onboardingHelpTitle').textContent = translate('onboarding.ui.title');
    panel.querySelector('[data-help-close]').setAttribute('aria-label', translate('onboarding.ui.close'));
    panel.querySelector('[data-help-search-label]').textContent = translate('onboarding.ui.search');
    panel.querySelector('[data-help-section-label]').textContent = translate('onboarding.ui.section');
    category.querySelector('option[value="all"]').textContent = translate('onboarding.ui.all');
    category.querySelector('option[value="guide"]').textContent = translate('onboarding.ui.guides');
    category.querySelector('option[value="controls"]').textContent = translate('onboarding.ui.controls');
    category.querySelector('option[value="glossary"]').textContent = translate('onboarding.ui.glossary');
    panel.querySelector('[data-help-reset]').textContent = translate('onboarding.ui.resetHints');
    hint.querySelector('[data-hint-open]').textContent = translate('onboarding.ui.openGuide');
    hint.querySelector('[data-hint-dismiss]').textContent = translate('onboarding.ui.dismiss');
    hint.querySelector('[data-hint-dismiss-all]').textContent = translate('onboarding.ui.dismissAll');
  }

  function open({ query = '', entryId = null } = {}) {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    search.value = query;
    renderResults();
    const target = entryId ? panel.querySelector(`[data-help-entry="${entryId}"]`) : null;
    (target ?? search).focus?.();
    target?.scrollIntoView?.({ block: 'center' });
  }

  function close() {
    if (panel.hidden) return false;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus?.();
    return true;
  }

  function showHint(step) {
    if (!step) return false;
    activeHintId = step.id;
    renderActiveHint();
    hint.hidden = false;
    return true;
  }

  function hideHint() {
    activeHintId = null;
    hint.hidden = true;
  }

  search.addEventListener('input', renderResults);
  category.addEventListener('change', renderResults);
  button.addEventListener('click', () => panel.hidden ? open() : close());
  panel.querySelector('[data-help-close]').addEventListener('click', close);
  panel.querySelector('[data-help-reset]').addEventListener('click', () => {
    state.reset();
    status.textContent = translate('onboarding.ui.hintsReset');
  });
  hint.querySelector('[data-hint-open]').addEventListener('click', () => {
    if (activeHintId) open({ entryId: `guide-${activeHintId}` });
    hideHint();
  });
  hint.querySelector('[data-hint-dismiss]').addEventListener('click', () => {
    if (activeHintId) state.dismiss(activeHintId);
    hideHint();
  });
  hint.querySelector('[data-hint-dismiss-all]').addEventListener('click', () => {
    state.dismissAll();
    hideHint();
  });
  applyLabels();
  renderResults();

  return Object.freeze({
    open,
    close,
    showHint,
    hideHint,
    isOpen: () => !panel.hidden,
    setLocale(next) {
      catalog = next.catalog;
      translate = next.translate;
      applyLabels();
      renderResults();
      renderActiveHint();
    },
    dispose() {
      panel.remove();
      hint.remove();
      button.remove();
    },
  });
}

export function installOnboardingHelp({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  storage = windowTarget?.localStorage ?? null,
  keyBindings = null,
  schedule = (callback) => windowTarget.setTimeout(callback, 600),
  cancelSchedule = (handle) => windowTarget.clearTimeout?.(handle),
  createView = createDefaultView,
} = {}) {
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener) {
    throw new TypeError('Onboarding help requires a window-like event target.');
  }
  if (!documentTarget?.createElement || !documentTarget?.body) {
    throw new TypeError('Onboarding help requires a document with a body.');
  }
  if (typeof createView !== 'function') throw new TypeError('Onboarding help createView must be a function.');
  const bindingProvider = typeof keyBindings === 'function'
    ? keyBindings
    : keyBindings
      ? () => keyBindings
      : getRuntimeKeyBindings;
  const localizer = createLocalizer(ONBOARDING_HELP_CATALOGS, {
    locale: documentTarget.documentElement?.lang ?? 'en',
  });
  const state = createOnboardingHelpState({ storage });
  let catalog = createOnboardingHelpCatalog({ keyBindings: bindingProvider(), translate: localizer.t });
  const view = createView({ documentTarget, catalog, state, translate: localizer.t });
  const previousGlobal = windowTarget[ONBOARDING_GLOBAL];
  let disposed = false;
  let scheduledHintHandle = null;

  function refreshCatalog() {
    catalog = createOnboardingHelpCatalog({ keyBindings: bindingProvider(), translate: localizer.t });
    view.setLocale?.({ catalog, translate: localizer.t });
    return catalog;
  }

  function open(options) {
    refreshCatalog();
    return view.open(options);
  }

  function notify(topic, { includeSeen = false } = {}) {
    refreshCatalog();
    const step = state.hintForTopic(topic, { includeSeen });
    if (!step) return false;
    state.markSeen(step.id);
    return view.showHint(step);
  }

  function inferTopic(target) {
    for (const [topic, selector] of TOPIC_SELECTORS) {
      if (target?.closest?.(selector)) return topic;
    }
    return null;
  }

  const onKeyDown = (event) => {
    if (event.key === 'F1' && !editableTarget(event.target)) {
      event.preventDefault?.();
      view.isOpen() ? view.close() : open();
      return;
    }
    if (event.key === 'Escape' && view.isOpen()) {
      event.preventDefault?.();
      view.close();
    }
  };
  const onClick = (event) => {
    const topic = inferTopic(event.target);
    if (topic) notify(topic);
  };
  const onContext = (event) => notify(event?.detail?.topic);
  const onLocaleChange = (event) => {
    if (localizer.setLocale(event?.detail?.locale)) refreshCatalog();
  };

  windowTarget.addEventListener('keydown', onKeyDown, true);
  documentTarget.addEventListener('click', onClick, true);
  documentTarget.addEventListener(ONBOARDING_LOCALE_EVENT, onLocaleChange);
  windowTarget.addEventListener(ONBOARDING_CONTEXT_EVENT, onContext);
  windowTarget[ONBOARDING_GLOBAL] = Object.freeze({
    open,
    close: view.close,
    notify,
    reset: state.reset,
    snapshot: () => deepFreeze({ state: state.snapshot(), catalogSize: catalog.length, open: view.isOpen(), locale: localizer.locale }),
    search(query, options) {
      refreshCatalog();
      return searchOnboardingHelp(catalog, query, options);
    },
  });
  let scheduleCompleted = false;
  scheduledHintHandle = schedule(() => {
    scheduleCompleted = true;
    scheduledHintHandle = null;
    if (disposed) return;
    refreshCatalog();
    const step = state.nextHint();
    if (step) {
      state.markSeen(step.id);
      view.showHint(step);
    }
  });
  if (scheduleCompleted) scheduledHintHandle = null;

  return () => {
    if (disposed) return false;
    disposed = true;
    if (scheduledHintHandle !== null && scheduledHintHandle !== undefined) cancelSchedule(scheduledHintHandle);
    scheduledHintHandle = null;
    windowTarget.removeEventListener('keydown', onKeyDown, true);
    documentTarget.removeEventListener('click', onClick, true);
    documentTarget.removeEventListener(ONBOARDING_LOCALE_EVENT, onLocaleChange);
    windowTarget.removeEventListener(ONBOARDING_CONTEXT_EVENT, onContext);
    view.dispose();
    if (windowTarget[ONBOARDING_GLOBAL]?.notify === notify) {
      if (previousGlobal === undefined) delete windowTarget[ONBOARDING_GLOBAL];
      else windowTarget[ONBOARDING_GLOBAL] = previousGlobal;
    }
    return true;
  };
}
