import { createLocalizer, normalizeLocale } from './localization.js';
import { RUNTIME_LOCALIZATION_CATALOGS } from './runtime-catalogs.js';

export const LOCALE_STORAGE_KEY = 'fields-of-resolve.locale.v1';
export const LOCALE_CHANGE_EVENT = 'fields-of-resolve:localechange';
export const LOCALIZATION_STYLE_ID = 'fields-of-resolve-localization-style';
export const FONT_COVERAGE_PROBE = 'AaZz Україна ҐЄІЇ 0123456789';
export const LOCALIZED_FONT_STACK = '"Noto Serif", "DejaVu Serif", Georgia, Cambria, serif';

const LOCALIZATION_STYLE = `
:root {
  --ui-font-body: ${LOCALIZED_FONT_STACK};
}
html, body, button, input, output, select, textarea {
  font-family: var(--ui-font-body);
}
#localeToggle {
  min-width: 92px;
  white-space: nowrap;
}
html[lang="uk"] .crest {
  letter-spacing: .08em;
}
`;

const TEXT_BINDINGS = Object.freeze([
  ['.crest', 'runtime.shell.brand'],
  ['#metal + small', 'runtime.shell.metal'],
  ['#fuel + small', 'runtime.shell.fuel'],
  ['#intel + small', 'runtime.shell.intel'],
  ['#pop + small', 'runtime.shell.command'],
  ['#waveStatus + small', 'runtime.shell.enemyAssault'],
  ['#economyHudToggle', 'runtime.shell.economy'],
  ['#techTreeToggle', 'runtime.shell.technology'],
  ['#audioSettingsToggle', 'runtime.shell.audio'],
  ['#objectivesBtn', 'runtime.shell.objectives'],
  ['.economyHudHeader small', 'runtime.shell.operationalLedger'],
  ['.economyHudHeader h2', 'runtime.shell.economyHeading'],
  ['.techTreeHeader small', 'runtime.shell.forceModernization'],
  ['#techTreeTitle', 'runtime.shell.technologyHeading'],
  ['#techTreeClose', 'runtime.shell.backBattlefield'],
  ['#selectionName', 'runtime.shell.noSelection'],
  ['#selectionStats', 'runtime.shell.selectPrompt'],
  ['.minimapLegend .ally', 'runtime.shell.ally'],
  ['.minimapLegend .neutral', 'runtime.shell.neutral'],
  ['.minimapLegend .hostile', 'runtime.shell.hostile'],
  ['#missionSelect .book > h1', 'app.title'],
  ['#missionSelect .book > p:not(.disclaimer)', 'runtime.shell.campaignIntro'],
  ['#missionSelect .disclaimer', 'runtime.shell.disclaimer'],
  ['.endgameEyebrow', 'runtime.shell.afterAction'],
  ['#endgameTitle', 'runtime.shell.operationComplete'],
  ['#retryMission', 'runtime.shell.retryMission'],
  ['#returnOperations', 'runtime.shell.returnOperations'],
  ['.audioSettingsHeader small', 'runtime.audio.eyebrow'],
  ['#audioSettingsTitle', 'runtime.audio.heading'],
  ['#audioSettingsForm fieldset:nth-of-type(1) legend', 'runtime.audio.mixer'],
  ['label[for="audioLevelMaster"]', 'runtime.audio.master'],
  ['label[for="audioLevelMusic"]', 'runtime.audio.music'],
  ['label[for="audioLevelSfx"]', 'runtime.audio.effects'],
  ['label[for="audioLevelVoice"]', 'runtime.audio.voice'],
  ['label[for="audioLevelAmbience"]', 'runtime.audio.ambience'],
  ['#audioSettingsForm fieldset:nth-of-type(2) legend', 'runtime.audio.playback'],
  ['#audioSettingsForm fieldset:nth-of-type(2) .audioSettingChoice:nth-of-type(1) > span', 'runtime.audio.dynamicRange'],
  ['option[value="full"]', 'runtime.audio.rangeFull'],
  ['option[value="reduced"]', 'runtime.audio.rangeReduced'],
  ['option[value="night"]', 'runtime.audio.rangeNight'],
  ['#audioSettingsForm fieldset:nth-of-type(2) .audioSettingChoice:nth-of-type(2) > span', 'runtime.audio.hiddenTab'],
  ['option[value="pause"]', 'runtime.audio.backgroundPause'],
  ['option[value="mute"]', 'runtime.audio.backgroundMute'],
  ['option[value="continue"]', 'runtime.audio.backgroundContinue'],
  ['#audioSettingsForm fieldset:nth-of-type(3) legend', 'runtime.audio.hearing'],
  ['[data-audio-setting="subtitles"] + span', 'runtime.audio.subtitles'],
  ['[data-audio-setting="speakerLabels"] + span', 'runtime.audio.speakerLabels'],
  ['[data-audio-setting="visualCues"] + span', 'runtime.audio.visualCues'],
  ['#audioVisualCueTest', 'runtime.audio.testCue'],
  ['#audioSettingsReset', 'runtime.audio.restoreDefaults'],
  ['#audioSettingsDone', 'runtime.audio.done'],
]);

const ATTRIBUTE_BINDINGS = Object.freeze([
  ['#economyHudToggle', 'data-tooltip', 'runtime.shell.economyTooltip'],
  ['#techTreeToggle', 'data-tooltip', 'runtime.shell.technologyTooltip'],
  ['#audioSettingsToggle', 'data-tooltip', 'runtime.shell.audioTooltip'],
  ['#objectivesBtn', 'data-tooltip', 'runtime.shell.objectivesTooltip'],
  ['#economyHud', 'aria-label', 'runtime.shell.economyAria'],
  ['#economyHudClose', 'aria-label', 'runtime.shell.closeEconomy'],
  ['#economyHudClose', 'data-tooltip', 'runtime.shell.closeEconomyTooltip'],
  ['#techTreeClose', 'data-tooltip', 'runtime.shell.backBattlefieldTooltip'],
  ['#selectionPanel', 'aria-label', 'runtime.shell.currentSelection'],
  ['#selectionSubgroups', 'aria-label', 'runtime.shell.selectionSubgroups'],
  ['#selectionGrid', 'aria-label', 'runtime.shell.selectedEntities'],
  ['#selectionContents', 'aria-label', 'runtime.shell.selectionContents'],
  ['#abilities', 'aria-label', 'runtime.shell.commandCard'],
  ['.minimapFrame', 'aria-label', 'runtime.shell.minimapFrame'],
  ['#minimap', 'aria-label', 'runtime.shell.minimapAria'],
  ['#minimapFilters', 'aria-label', 'runtime.shell.minimapFilters'],
  ['#minimapAlertQueue', 'aria-label', 'runtime.shell.recentAlerts'],
  ['#retryMission', 'data-tooltip', 'runtime.shell.retryTooltip'],
  ['#returnOperations', 'data-tooltip', 'runtime.shell.returnOperationsTooltip'],
  ['#audioSettingsClose', 'aria-label', 'runtime.audio.close'],
]);

const TEXT_NODE_BINDINGS = Object.freeze([
  ['#minimapFilters label:nth-child(1)', 'runtime.shell.units'],
  ['#minimapFilters label:nth-child(2)', 'runtime.shell.buildings'],
  ['#minimapFilters label:nth-child(3)', 'runtime.shell.resources'],
  ['#minimapFilters label:nth-child(4)', 'runtime.shell.allies'],
  ['#minimapFilters label:nth-child(5)', 'runtime.shell.neutrals'],
  ['[data-audio-muted="master"]', 'runtime.audio.mute', true],
  ['[data-audio-muted="music"]', 'runtime.audio.mute', true],
  ['[data-audio-muted="sfx"]', 'runtime.audio.mute', true],
  ['[data-audio-muted="voice"]', 'runtime.audio.mute', true],
  ['[data-audio-muted="ambience"]', 'runtime.audio.mute', true],
]);

function storageFor(documentTarget, explicitStorage) {
  if (explicitStorage) return explicitStorage;
  try {
    return documentTarget.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

function initialLocale(documentTarget, storage, requestedLocale) {
  const candidates = [];
  if (requestedLocale) candidates.push(requestedLocale);
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY);
    if (stored) candidates.push(stored);
  } catch {
    // Storage is optional; locale remains session-scoped.
  }
  candidates.push(documentTarget.documentElement?.lang);
  candidates.push(documentTarget.defaultView?.navigator?.language);
  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }
  return 'en';
}

function trailingTextNode(element, anchorIsInput = false) {
  const owner = anchorIsInput ? element.parentElement : element;
  if (!owner) return null;
  const nodes = [...owner.childNodes].filter((node) => node.nodeType === 3);
  return nodes.at(-1) ?? null;
}

function customEvent(documentTarget, detail) {
  const EventConstructor = documentTarget.defaultView?.CustomEvent;
  if (typeof EventConstructor === 'function') return new EventConstructor(LOCALE_CHANGE_EVENT, { detail });
  return { type: LOCALE_CHANGE_EVENT, detail };
}

export function installRuntimeLocalization({
  documentTarget = globalThis.document,
  storage = null,
  locale = null,
} = {}) {
  if (!documentTarget?.querySelector || !documentTarget.documentElement) {
    throw new TypeError('Runtime localization requires a document-like target.');
  }

  const persistentStorage = storageFor(documentTarget, storage);
  const localizer = createLocalizer(RUNTIME_LOCALIZATION_CATALOGS, {
    locale: initialLocale(documentTarget, persistentStorage, locale),
  });
  const originals = [];
  const missingSelectors = new Set();
  const listeners = new Set();
  const originalLanguage = documentTarget.documentElement.lang;
  const originalLocaleAttribute = documentTarget.documentElement.getAttribute('data-locale');
  const originalTitle = documentTarget.title;
  const view = documentTarget.defaultView;
  const previousDiagnostic = view?.__fieldsOfResolveLocalization;
  let disposed = false;

  const rememberText = (element) => originals.push(() => { element.textContent = element.__l10nOriginalText; });
  const rememberAttribute = (element, attribute) => originals.push(() => {
    const value = element.__l10nOriginalAttributes?.[attribute];
    if (value == null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, value);
  });
  const rememberTextNode = (node) => originals.push(() => { node.nodeValue = node.__l10nOriginalValue; });

  for (const [selector] of TEXT_BINDINGS) {
    const element = documentTarget.querySelector(selector);
    if (!element) continue;
    element.__l10nOriginalText = element.textContent;
    rememberText(element);
  }
  for (const [selector, attribute] of ATTRIBUTE_BINDINGS) {
    const element = documentTarget.querySelector(selector);
    if (!element) continue;
    element.__l10nOriginalAttributes ??= Object.create(null);
    element.__l10nOriginalAttributes[attribute] = element.getAttribute(attribute);
    rememberAttribute(element, attribute);
  }
  for (const [selector, , anchorIsInput = false] of TEXT_NODE_BINDINGS) {
    const element = documentTarget.querySelector(selector);
    const node = element ? trailingTextNode(element, anchorIsInput) : null;
    if (!node) continue;
    node.__l10nOriginalValue = node.nodeValue;
    rememberTextNode(node);
  }

  const style = documentTarget.createElement('style');
  style.id = LOCALIZATION_STYLE_ID;
  style.textContent = LOCALIZATION_STYLE;
  documentTarget.head?.appendChild(style);

  const control = documentTarget.createElement('button');
  control.id = 'localeToggle';
  control.type = 'button';
  control.className = 'localeToggle';
  control.setAttribute('aria-live', 'polite');
  const insertionPoint = documentTarget.querySelector('#objectivesBtn');
  const topbar = documentTarget.querySelector('#topbar');
  if (insertionPoint?.parentElement) insertionPoint.parentElement.insertBefore(control, insertionPoint);
  else topbar?.appendChild(control);

  const translate = (key, variables) => localizer.t(key, variables);

  const apply = ({ announce = false } = {}) => {
    if (disposed) return false;
    missingSelectors.clear();
    documentTarget.documentElement.lang = localizer.locale;
    documentTarget.documentElement.dataset.locale = localizer.locale;
    documentTarget.title = translate('app.title');

    for (const [selector, key] of TEXT_BINDINGS) {
      const element = documentTarget.querySelector(selector);
      if (!element) {
        missingSelectors.add(selector);
        continue;
      }
      element.textContent = translate(key);
    }
    for (const [selector, attribute, key] of ATTRIBUTE_BINDINGS) {
      const element = documentTarget.querySelector(selector);
      if (!element) {
        missingSelectors.add(selector);
        continue;
      }
      element.setAttribute(attribute, translate(key));
    }
    for (const [selector, key, anchorIsInput = false] of TEXT_NODE_BINDINGS) {
      const element = documentTarget.querySelector(selector);
      const node = element ? trailingTextNode(element, anchorIsInput) : null;
      if (!node) {
        missingSelectors.add(selector);
        continue;
      }
      node.nodeValue = ` ${translate(key)}`;
    }

    const nextLocale = localizer.locale === 'en' ? 'uk' : 'en';
    control.textContent = translate(nextLocale === 'uk' ? 'runtime.locale.targetUkrainian' : 'runtime.locale.targetEnglish');
    control.setAttribute('aria-label', translate(nextLocale === 'uk'
      ? 'runtime.locale.switchToUkrainian'
      : 'runtime.locale.switchToEnglish'));
    control.setAttribute('data-tooltip', control.getAttribute('aria-label'));
    control.dataset.localeTarget = nextLocale;

    const detail = Object.freeze({ locale: localizer.locale, source: announce ? 'control' : 'runtime' });
    for (const listener of listeners) listener(detail);
    if (typeof documentTarget.dispatchEvent === 'function') documentTarget.dispatchEvent(customEvent(documentTarget, detail));
    return true;
  };

  const setLocale = (nextLocale, { persist = true, announce = false } = {}) => {
    if (!localizer.setLocale(nextLocale)) return false;
    if (persist) {
      try {
        persistentStorage?.setItem(LOCALE_STORAGE_KEY, localizer.locale);
      } catch {
        // Storage is optional; the active session still changes locale.
      }
    }
    return apply({ announce });
  };

  const onToggle = () => setLocale(localizer.locale === 'en' ? 'uk' : 'en', { announce: true });
  control.addEventListener('click', onToggle);

  const api = Object.freeze({
    get locale() { return localizer.locale; },
    get supportedLocales() { return localizer.supportedLocales; },
    t: translate,
    setLocale,
    apply,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Localization subscriber must be a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    diagnostics() {
      const probe = documentTarget.createElement('span');
      probe.textContent = FONT_COVERAGE_PROBE;
      probe.lang = 'uk';
      probe.style.cssText = `position:fixed;left:-10000px;top:-10000px;font:16px ${LOCALIZED_FONT_STACK};white-space:nowrap`;
      documentTarget.body?.appendChild(probe);
      const width = Number(probe.getBoundingClientRect?.().width ?? 0);
      const fontCoverageReady = documentTarget.fonts?.check?.(`16px ${LOCALIZED_FONT_STACK}`, FONT_COVERAGE_PROBE) ?? width > 0;
      const computedFontFamily = view?.getComputedStyle?.(probe)?.fontFamily ?? '';
      probe.remove();
      return Object.freeze({
        ...localizer.diagnostics(),
        storageKey: LOCALE_STORAGE_KEY,
        controlMounted: control.isConnected,
        styleMounted: style.isConnected,
        fontProbe: FONT_COVERAGE_PROBE,
        fontProbeWidth: width,
        fontCoverageReady: Boolean(fontCoverageReady),
        computedFontFamily,
        missingSelectors: Object.freeze([...missingSelectors]),
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      control.removeEventListener('click', onToggle);
      control.remove();
      style.remove();
      for (const restore of originals.reverse()) restore();
      documentTarget.documentElement.lang = originalLanguage;
      if (originalLocaleAttribute == null) documentTarget.documentElement.removeAttribute('data-locale');
      else documentTarget.documentElement.setAttribute('data-locale', originalLocaleAttribute);
      documentTarget.title = originalTitle;
      listeners.clear();
      if (view) {
        if (previousDiagnostic === undefined) delete view.__fieldsOfResolveLocalization;
        else view.__fieldsOfResolveLocalization = previousDiagnostic;
      }
    },
  });

  if (view) view.__fieldsOfResolveLocalization = api;
  apply();
  return api;
}
