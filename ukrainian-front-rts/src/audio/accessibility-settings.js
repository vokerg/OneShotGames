import {
  DEFAULT_ACTION_BINDINGS,
  INPUT_ACTION_IDS,
  normalizeActionBindings,
  rebindInputAction,
  unbindInputAction,
} from '../core/input-action-map.js';

export const ACCESSIBILITY_SETTINGS_SCHEMA = 'fields-of-resolve.accessibility-settings';
export const ACCESSIBILITY_SETTINGS_VERSION = 1;
export const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'fields-of-resolve.accessibility-settings.v1';
export const UI_SCALE_OPTIONS = Object.freeze([0.8, 1, 1.15, 1.3]);
export const TEXT_SCALE_OPTIONS = Object.freeze([0.9, 1, 1.15, 1.3]);
export const COLOR_VISION_PRESETS = Object.freeze(['standard', 'deuteranopia', 'protanopia', 'tritanopia']);
export const CONTRAST_MODES = Object.freeze(['standard', 'high']);
export const CURSOR_SIZES = Object.freeze(['standard', 'large', 'extra-large']);

const UI_SCALE_SET = new Set(UI_SCALE_OPTIONS);
const TEXT_SCALE_SET = new Set(TEXT_SCALE_OPTIONS);
const COLOR_VISION_SET = new Set(COLOR_VISION_PRESETS);
const CONTRAST_SET = new Set(CONTRAST_MODES);
const CURSOR_SIZE_SET = new Set(CURSOR_SIZES);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS = deepFreeze({
  schema: ACCESSIBILITY_SETTINGS_SCHEMA,
  version: ACCESSIBILITY_SETTINGS_VERSION,
  uiScale: 1,
  textScale: 1,
  colorVisionPreset: 'standard',
  contrastMode: 'standard',
  reducedMotion: false,
  reduceFlashes: false,
  cursorSize: 'standard',
  pauseOnFocusLoss: true,
  actionBindings: DEFAULT_ACTION_BINDINGS,
});

function migrateSettings(value) {
  if (!plainObject(value)) return {};
  if (value.schema && value.schema !== ACCESSIBILITY_SETTINGS_SCHEMA) return {};
  if (Number.isInteger(value.version) && value.version > ACCESSIBILITY_SETTINGS_VERSION) return {};
  return {
    ...value,
    colorVisionPreset: value.colorVisionPreset ?? value.colorVisionMode,
    contrastMode: value.contrastMode ?? (value.highContrast ? 'high' : undefined),
    reducedMotion: value.reducedMotion ?? value.disableMotion,
    reduceFlashes: value.reduceFlashes ?? value.screenFlashReduction,
    actionBindings: value.actionBindings ?? value.bindings,
  };
}

export function normalizeAccessibilitySettings(value = {}) {
  const input = migrateSettings(value);
  return deepFreeze({
    schema: ACCESSIBILITY_SETTINGS_SCHEMA,
    version: ACCESSIBILITY_SETTINGS_VERSION,
    uiScale: enumValue(Number(input.uiScale), UI_SCALE_SET, DEFAULT_ACCESSIBILITY_SETTINGS.uiScale),
    textScale: enumValue(Number(input.textScale), TEXT_SCALE_SET, DEFAULT_ACCESSIBILITY_SETTINGS.textScale),
    colorVisionPreset: enumValue(input.colorVisionPreset, COLOR_VISION_SET, DEFAULT_ACCESSIBILITY_SETTINGS.colorVisionPreset),
    contrastMode: enumValue(input.contrastMode, CONTRAST_SET, DEFAULT_ACCESSIBILITY_SETTINGS.contrastMode),
    reducedMotion: boolean(input.reducedMotion, DEFAULT_ACCESSIBILITY_SETTINGS.reducedMotion),
    reduceFlashes: boolean(input.reduceFlashes, DEFAULT_ACCESSIBILITY_SETTINGS.reduceFlashes),
    cursorSize: enumValue(input.cursorSize, CURSOR_SIZE_SET, DEFAULT_ACCESSIBILITY_SETTINGS.cursorSize),
    pauseOnFocusLoss: boolean(input.pauseOnFocusLoss, DEFAULT_ACCESSIBILITY_SETTINGS.pauseOnFocusLoss),
    actionBindings: normalizeActionBindings(input.actionBindings ?? DEFAULT_ACTION_BINDINGS),
  });
}

function safeStorageRead(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return { value: null, status: 'unavailable', error: null };
  try {
    const serialized = storage.getItem(key);
    if (serialized == null) return { value: null, status: 'empty', error: null };
    return { value: JSON.parse(serialized), status: 'loaded', error: null };
  } catch (error) {
    return { value: null, status: 'read-failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function safeStorageWrite(storage, key, settings) {
  if (!storage || typeof storage.setItem !== 'function') return { status: 'unavailable', error: null };
  try {
    storage.setItem(key, JSON.stringify(settings));
    return { status: 'saved', error: null };
  } catch (error) {
    return { status: 'write-failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function mergeSettings(current, patch) {
  if (!plainObject(patch)) throw new TypeError('Accessibility settings patch must be a plain object.');
  return normalizeAccessibilitySettings({
    ...current,
    ...patch,
    actionBindings: plainObject(patch.actionBindings) ? patch.actionBindings : current.actionBindings,
  });
}

export function createAccessibilitySettingsController({
  storage = null,
  storageKey = ACCESSIBILITY_SETTINGS_STORAGE_KEY,
  initialSettings,
  apply = () => {},
} = {}) {
  if (typeof storageKey !== 'string' || !storageKey) throw new TypeError('Accessibility settings storageKey must be non-empty.');
  if (typeof apply !== 'function') throw new TypeError('Accessibility settings apply callback must be a function.');
  const loaded = initialSettings === undefined
    ? safeStorageRead(storage, storageKey)
    : { value: initialSettings, status: 'injected', error: null };
  let settings = normalizeAccessibilitySettings(loaded.value ?? DEFAULT_ACCESSIBILITY_SETTINGS);
  let persistence = deepFreeze({ status: loaded.status, error: loaded.error });
  let disposed = false;
  const listeners = new Set();
  apply(settings);

  const snapshot = () => deepFreeze({
    schema: ACCESSIBILITY_SETTINGS_SCHEMA,
    version: ACCESSIBILITY_SETTINGS_VERSION,
    settings,
    persistence,
    disposed,
  });

  const notify = () => {
    const state = snapshot();
    for (const listener of listeners) {
      try { listener(state); } catch { /* presentation observers cannot affect settings */ }
    }
    return state;
  };

  const commit = (next, { persist = true } = {}) => {
    if (disposed) throw new Error('Accessibility settings controller is disposed.');
    const previous = settings;
    try {
      apply(next);
    } catch (error) {
      try { apply(previous); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Accessibility settings update failed and rollback was incomplete.', { cause: error });
      }
      throw error;
    }
    settings = next;
    if (persist) persistence = deepFreeze(safeStorageWrite(storage, storageKey, settings));
    return notify();
  };

  const update = (patch, options) => commit(mergeSettings(settings, patch), options);
  const reset = () => commit(DEFAULT_ACCESSIBILITY_SETTINGS);
  const rebind = (action, key, { replace = false, persist = true } = {}) => {
    const result = rebindInputAction(settings.actionBindings, action, key, { replace });
    if (!result.ok) return deepFreeze({ ...result, state: snapshot() });
    const state = commit(normalizeAccessibilitySettings({ ...settings, actionBindings: result.bindings }), { persist });
    return deepFreeze({ ok: true, conflict: result.conflict, bindings: state.settings.actionBindings, state });
  };
  const unbind = (action, { persist = true } = {}) => {
    if (!INPUT_ACTION_IDS.includes(action)) throw new RangeError(`Unknown input action: ${action}`);
    return commit(normalizeAccessibilitySettings({
      ...settings,
      actionBindings: unbindInputAction(settings.actionBindings, action),
    }), { persist });
  };
  const subscribe = (listener, { emitCurrent = false } = {}) => {
    if (typeof listener !== 'function') throw new TypeError('Accessibility settings listener must be a function.');
    if (disposed) throw new Error('Accessibility settings controller is disposed.');
    listeners.add(listener);
    try {
      if (emitCurrent) listener(snapshot());
    } catch (error) {
      listeners.delete(listener);
      throw error;
    }
    return () => listeners.delete(listener);
  };
  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    listeners.clear();
    return true;
  };

  return Object.freeze({ snapshot, update, reset, rebind, unbind, subscribe, dispose });
}
