import {
  ACCESSIBILITY_PAUSE_EVENT,
  ACCESSIBILITY_RESUME_EVENT,
} from '../core/accessibility-events.js';
import {
  DEFAULT_KEY_BINDINGS,
  setRuntimeActionBindings,
  setRuntimeKeyBindings,
} from '../core/input-action-map.js';
import { normalizeAccessibilitySettings } from './accessibility-settings.js';

export { ACCESSIBILITY_PAUSE_EVENT, ACCESSIBILITY_RESUME_EVENT } from '../core/accessibility-events.js';
export const ACCESSIBILITY_STYLE_ID = 'fields-of-resolve-accessibility-runtime';

const ATTRIBUTE_NAMES = Object.freeze([
  'data-accessibility-color-vision',
  'data-accessibility-contrast',
  'data-accessibility-reduced-motion',
  'data-accessibility-reduce-flashes',
  'data-accessibility-cursor-size',
  'data-accessibility-focus-paused',
  'data-accessibility-ui-scale',
]);

const STYLE_PROPERTIES = Object.freeze([
  '--accessibility-ui-scale',
  '--accessibility-text-scale',
  '--accessibility-color-filter',
]);

const RUNTIME_CSS = `
:root {
  --accessibility-ui-scale: 1;
  --accessibility-text-scale: 1;
  --accessibility-color-filter: none;
}
:root[data-accessibility-color-vision="deuteranopia"] { --accessibility-color-filter: saturate(1.18) hue-rotate(-12deg); }
:root[data-accessibility-color-vision="protanopia"] { --accessibility-color-filter: saturate(1.22) hue-rotate(12deg); }
:root[data-accessibility-color-vision="tritanopia"] { --accessibility-color-filter: saturate(1.2) hue-rotate(28deg); }
:root[data-accessibility-color-vision] #game,
:root[data-accessibility-color-vision] #minimap,
:root[data-accessibility-color-vision] #portrait { filter: var(--accessibility-color-filter); }
:root[data-accessibility-contrast="high"] #shell,
:root[data-accessibility-contrast="high"] #audioSettings { filter: contrast(1.22) saturate(1.08); }
:root[data-accessibility-contrast="high"] button:focus-visible,
:root[data-accessibility-contrast="high"] input:focus-visible,
:root[data-accessibility-contrast="high"] select:focus-visible,
:root[data-accessibility-contrast="high"] [tabindex]:focus-visible { outline: 3px solid currentColor !important; outline-offset: 3px !important; }
:root[data-accessibility-reduced-motion="true"] *,
:root[data-accessibility-reduced-motion="true"] *::before,
:root[data-accessibility-reduced-motion="true"] *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
:root[data-accessibility-reduce-flashes="true"] #message,
:root[data-accessibility-reduce-flashes="true"] #audioVisualCue,
:root[data-accessibility-reduce-flashes="true"] .minimapAlert,
:root[data-accessibility-reduce-flashes="true"] [data-urgency="critical"] { animation: none !important; transition: none !important; }
:root[data-accessibility-focus-paused="true"] #game { opacity: 0.72; }
:root[data-accessibility-cursor-size="large"],
:root[data-accessibility-cursor-size="large"] * { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 2v24l6-6 4 9 5-2-4-9h9z' fill='white' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 3 2, auto !important; }
:root[data-accessibility-cursor-size="extra-large"],
:root[data-accessibility-cursor-size="extra-large"] * { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cpath d='M4 3v36l9-9 6 14 8-3-7-14h15z' fill='white' stroke='black' stroke-width='3'/%3E%3C/svg%3E") 4 3, auto !important; }
:root[data-accessibility-focus-paused="true"]::after { content: "Paused after focus loss"; position: fixed; z-index: 2147483647; inset: 1rem auto auto 50%; transform: translateX(-50%); padding: .55rem .85rem; background: Canvas; color: CanvasText; border: 2px solid currentColor; font: 700 1rem/1.2 system-ui, sans-serif; }
#topbar, #commandPanel, #objectives, #economyHud, #techTree, #missionSelect, #endgame, #audioSettings, #message, #audioVisualCue { font-size: calc(1em * var(--accessibility-text-scale)); }
:root:not([data-accessibility-ui-scale="1"]) #topbar,
:root:not([data-accessibility-ui-scale="1"]) #commandPanel,
:root:not([data-accessibility-ui-scale="1"]) #objectives,
:root:not([data-accessibility-ui-scale="1"]) #economyHud,
:root:not([data-accessibility-ui-scale="1"]) #techTree,
:root:not([data-accessibility-ui-scale="1"]) #missionSelect,
:root:not([data-accessibility-ui-scale="1"]) #endgame,
:root:not([data-accessibility-ui-scale="1"]) #audioSettings { zoom: var(--accessibility-ui-scale); }
.accessibilitySettingsGrid { display: grid; gap: .45rem; }
.accessibilityBindingsHeader { margin-top: .8rem; display: grid; gap: .2rem; }
.accessibilityBindings { display: grid; gap: .35rem; max-height: 18rem; overflow: auto; padding-right: .25rem; }
.accessibilityBindingRow { display: grid; grid-template-columns: minmax(12rem, 1fr) auto; gap: .45rem; align-items: end; }
.accessibilityBindingRow label { display: grid; grid-template-columns: minmax(9rem, 1fr) minmax(8rem, .7fr); gap: .45rem; align-items: center; }
.accessibilitySettingsStatus { min-height: 2.4em; }
`;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireEventTarget(value, label) {
  if (!value || typeof value.addEventListener !== 'function' || typeof value.removeEventListener !== 'function') {
    throw new TypeError(`${label} must be an event target.`);
  }
  return value;
}

function dispatch(target, type, detail) {
  if (typeof target?.dispatchEvent !== 'function') return false;
  const EventConstructor = target?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  if (typeof EventConstructor === 'function') return target.dispatchEvent(new EventConstructor(type, { detail }));
  return target.dispatchEvent({ type, detail });
}

function filterFor(preset) {
  if (preset === 'deuteranopia') return 'saturate(1.18) hue-rotate(-12deg)';
  if (preset === 'protanopia') return 'saturate(1.22) hue-rotate(12deg)';
  if (preset === 'tritanopia') return 'saturate(1.2) hue-rotate(28deg)';
  return 'none';
}

export function createAccessibilityRuntime({
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
  pause = null,
  resume = null,
} = {}) {
  const doc = requireEventTarget(documentTarget, 'Accessibility document');
  const win = requireEventTarget(windowTarget, 'Accessibility window');
  const root = doc.documentElement;
  if (!root || !root.style || typeof root.setAttribute !== 'function') {
    throw new TypeError('Accessibility runtime requires a documentElement with style and attributes.');
  }
  if (pause !== null && typeof pause !== 'function') throw new TypeError('Accessibility pause callback must be a function.');
  if (resume !== null && typeof resume !== 'function') throw new TypeError('Accessibility resume callback must be a function.');

  const previousAttributes = Object.fromEntries(ATTRIBUTE_NAMES.map((name) => [name, root.getAttribute(name)]));
  const previousStyles = Object.fromEntries(STYLE_PROPERTIES.map((name) => [name, root.style.getPropertyValue(name)]));
  const previousRuntimeBindings = setRuntimeKeyBindings(DEFAULT_KEY_BINDINGS);
  let styleElement = doc.getElementById?.(ACCESSIBILITY_STYLE_ID) ?? null;
  const ownsStyle = !styleElement;
  if (!styleElement) {
    styleElement = doc.createElement?.('style');
    if (!styleElement) throw new Error('Accessibility runtime could not create its stylesheet.');
    styleElement.id = ACCESSIBILITY_STYLE_ID;
    styleElement.textContent = RUNTIME_CSS;
    (doc.head ?? root).appendChild(styleElement);
  }

  let settings = normalizeAccessibilitySettings();
  let disposed = false;
  let focusPaused = false;
  const pauseSupported = Boolean(pause && resume) || typeof doc.dispatchEvent === 'function';

  const snapshot = () => deepFreeze({ settings, focusPaused, pauseSupported, disposed });
  const requestResume = (reason) => {
    resume?.(reason);
    dispatch(doc, ACCESSIBILITY_RESUME_EVENT, { reason, supported: pauseSupported });
  };
  const apply = (value) => {
    if (disposed) throw new Error('Accessibility runtime is disposed.');
    settings = normalizeAccessibilitySettings(value);
    root.setAttribute('data-accessibility-ui-scale', String(settings.uiScale));
    root.setAttribute('data-accessibility-color-vision', settings.colorVisionPreset);
    root.setAttribute('data-accessibility-contrast', settings.contrastMode);
    root.setAttribute('data-accessibility-reduced-motion', String(settings.reducedMotion));
    root.setAttribute('data-accessibility-reduce-flashes', String(settings.reduceFlashes));
    root.setAttribute('data-accessibility-cursor-size', settings.cursorSize);
    root.style.setProperty('--accessibility-ui-scale', String(settings.uiScale));
    root.style.setProperty('--accessibility-text-scale', String(settings.textScale));
    root.style.setProperty('--accessibility-color-filter', filterFor(settings.colorVisionPreset));
    setRuntimeActionBindings(settings.actionBindings);
    if (!settings.pauseOnFocusLoss && focusPaused) {
      focusPaused = false;
      root.removeAttribute('data-accessibility-focus-paused');
      requestResume('preference-disabled');
    }
    return snapshot();
  };

  const onBlur = () => {
    if (disposed || !settings.pauseOnFocusLoss || focusPaused) return;
    focusPaused = true;
    root.setAttribute('data-accessibility-focus-paused', 'true');
    pause?.('focus-loss');
    dispatch(doc, ACCESSIBILITY_PAUSE_EVENT, { reason: 'focus-loss', supported: pauseSupported });
  };
  const onFocus = () => {
    if (disposed || !focusPaused) return;
    focusPaused = false;
    root.removeAttribute('data-accessibility-focus-paused');
    requestResume('focus-return');
  };
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);

  const dispose = () => {
    if (disposed) return false;
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
    if (focusPaused) {
      focusPaused = false;
      requestResume('dispose');
    }
    for (const [name, value] of Object.entries(previousAttributes)) {
      if (value === null || value === undefined) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(previousStyles)) {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
    setRuntimeKeyBindings(previousRuntimeBindings);
    if (ownsStyle) styleElement.remove?.();
    disposed = true;
    return true;
  };

  return Object.freeze({ apply, snapshot, dispose });
}
