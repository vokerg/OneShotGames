import { AUDIO_BUS_IDS } from './audio-mixer.js';

export const AUDIO_SETTINGS_SCHEMA = 'fields-of-resolve.audio-settings';
export const AUDIO_SETTINGS_VERSION = 1;
export const AUDIO_SETTINGS_STORAGE_KEY = 'fields-of-resolve.audio-settings.v1';
export const AUDIO_DYNAMIC_RANGE_MODES = Object.freeze(['full', 'reduced', 'night']);
export const BACKGROUND_AUDIO_POLICIES = Object.freeze(['pause', 'mute', 'continue']);

const TARGET_IDS = Object.freeze(['master', ...AUDIO_BUS_IDS]);
const TARGET_SET = new Set(TARGET_IDS);
const DYNAMIC_RANGE_SET = new Set(AUDIO_DYNAMIC_RANGE_MODES);
const BACKGROUND_POLICY_SET = new Set(BACKGROUND_AUDIO_POLICIES);

export const AUDIO_DYNAMIC_RANGE_PROFILES = Object.freeze({
  full: Object.freeze({ master: 1, music: 1, sfx: 1, voice: 1, ambience: 1 }),
  reduced: Object.freeze({ master: 0.92, music: 0.82, sfx: 0.78, voice: 1, ambience: 0.86 }),
  night: Object.freeze({ master: 0.72, music: 0.58, sfx: 0.48, voice: 1, ambience: 0.62 }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function clampLevel(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function defaultLevels() {
  return { master: 1, music: 0.8, sfx: 1, voice: 1, ambience: 0.8 };
}

function defaultMuted() {
  return Object.fromEntries(TARGET_IDS.map((target) => [target, false]));
}

export const DEFAULT_AUDIO_SETTINGS = deepFreeze({
  schema: AUDIO_SETTINGS_SCHEMA,
  version: AUDIO_SETTINGS_VERSION,
  levels: defaultLevels(),
  muted: defaultMuted(),
  dynamicRangeMode: 'full',
  backgroundPolicy: 'pause',
  subtitles: true,
  speakerLabels: true,
  visualCues: true,
});

function migrateLegacy(input) {
  if (!plainObject(input)) return {};
  if (input.schema && input.schema !== AUDIO_SETTINGS_SCHEMA) return {};
  if (Number.isInteger(input.version) && input.version > AUDIO_SETTINGS_VERSION) return {};
  const levels = { ...(plainObject(input.levels) ? input.levels : plainObject(input.volumes) ? input.volumes : {}) };
  const muted = { ...(plainObject(input.muted) ? input.muted : {}) };
  if ('masterVolume' in input && !('master' in levels)) levels.master = input.masterVolume;
  if ('masterMuted' in input && !('master' in muted)) muted.master = input.masterMuted;
  if ('mute' in input && !('master' in muted)) muted.master = input.mute;
  return {
    ...input,
    levels,
    muted,
    dynamicRangeMode: input.dynamicRangeMode ?? input.dynamicRange,
    backgroundPolicy: input.backgroundPolicy ?? input.backgroundTabBehavior,
    visualCues: input.visualCues ?? input.visualAlerts,
  };
}

export function normalizeAudioSettings(value = {}) {
  const input = migrateLegacy(value);
  const levels = {};
  const muted = {};
  for (const target of TARGET_IDS) {
    levels[target] = clampLevel(input.levels?.[target], DEFAULT_AUDIO_SETTINGS.levels[target]);
    muted[target] = boolean(input.muted?.[target], DEFAULT_AUDIO_SETTINGS.muted[target]);
  }
  const subtitles = boolean(input.subtitles, DEFAULT_AUDIO_SETTINGS.subtitles);
  return deepFreeze({
    schema: AUDIO_SETTINGS_SCHEMA,
    version: AUDIO_SETTINGS_VERSION,
    levels,
    muted,
    dynamicRangeMode: enumValue(input.dynamicRangeMode, DYNAMIC_RANGE_SET, DEFAULT_AUDIO_SETTINGS.dynamicRangeMode),
    backgroundPolicy: enumValue(input.backgroundPolicy, BACKGROUND_POLICY_SET, DEFAULT_AUDIO_SETTINGS.backgroundPolicy),
    subtitles,
    speakerLabels: boolean(input.speakerLabels, DEFAULT_AUDIO_SETTINGS.speakerLabels),
    visualCues: boolean(input.visualCues, DEFAULT_AUDIO_SETTINGS.visualCues),
  });
}

export function effectiveAudioLevels(value = DEFAULT_AUDIO_SETTINGS) {
  const settings = normalizeAudioSettings(value);
  const profile = AUDIO_DYNAMIC_RANGE_PROFILES[settings.dynamicRangeMode];
  return deepFreeze(Object.fromEntries(TARGET_IDS.map((target) => [
    target,
    Math.round(settings.levels[target] * profile[target] * 10_000) / 10_000,
  ])));
}

export function voiceAccessibilityPreferences(value = DEFAULT_AUDIO_SETTINGS) {
  const settings = normalizeAudioSettings(value);
  return deepFreeze({
    voiceEnabled: !settings.muted.voice && settings.levels.voice > 0,
    subtitles: settings.subtitles,
    speakerLabels: settings.subtitles && settings.speakerLabels,
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

function requireMixer(mixer) {
  const required = ['setMasterVolume', 'setMasterMuted', 'setBusVolume', 'setBusMuted', 'snapshot'];
  if (!mixer || required.some((method) => typeof mixer[method] !== 'function')) {
    throw new TypeError('Audio settings require a compatible audio mixer.');
  }
  return mixer;
}

function mergeSettings(current, patch) {
  if (!plainObject(patch)) throw new TypeError('Audio settings patch must be a plain object.');
  return normalizeAudioSettings({
    ...current,
    ...patch,
    levels: { ...current.levels, ...(plainObject(patch.levels) ? patch.levels : {}) },
    muted: { ...current.muted, ...(plainObject(patch.muted) ? patch.muted : {}) },
  });
}

function applyMixerSettings(mixer, settings) {
  const effective = effectiveAudioLevels(settings);
  mixer.setMasterVolume(effective.master);
  mixer.setMasterMuted(settings.muted.master);
  for (const bus of AUDIO_BUS_IDS) {
    mixer.setBusVolume(bus, effective[bus]);
    mixer.setBusMuted(bus, settings.muted[bus]);
  }
  return effective;
}

export function createAudioSettingsController({
  mixer,
  storage = null,
  storageKey = AUDIO_SETTINGS_STORAGE_KEY,
  initialSettings,
} = {}) {
  const audioMixer = requireMixer(mixer);
  if (typeof storageKey !== 'string' || !storageKey) throw new TypeError('Audio settings storageKey must be non-empty.');
  const loaded = initialSettings === undefined ? safeStorageRead(storage, storageKey) : { value: initialSettings, status: 'injected', error: null };
  let settings = normalizeAudioSettings(loaded.value ?? DEFAULT_AUDIO_SETTINGS);
  let effectiveLevels = applyMixerSettings(audioMixer, settings);
  let persistence = deepFreeze({ status: loaded.status, error: loaded.error });
  let disposed = false;
  const listeners = new Set();

  const snapshot = () => deepFreeze({
    schema: AUDIO_SETTINGS_SCHEMA,
    version: AUDIO_SETTINGS_VERSION,
    settings,
    effectiveLevels,
    voice: voiceAccessibilityPreferences(settings),
    persistence,
    disposed,
  });

  const notify = () => {
    const state = snapshot();
    for (const listener of listeners) {
      try { listener(state); } catch { /* settings observers are presentation-only */ }
    }
    return state;
  };

  const update = (patch, { persist = true } = {}) => {
    if (disposed) throw new Error('Audio settings controller is disposed.');
    const previous = settings;
    const next = mergeSettings(settings, patch);
    let nextEffective;
    try {
      nextEffective = applyMixerSettings(audioMixer, next);
    } catch (error) {
      try {
        applyMixerSettings(audioMixer, previous);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Audio settings update failed and mixer rollback was incomplete.', { cause: error });
      }
      throw error;
    }
    settings = next;
    effectiveLevels = nextEffective;
    if (persist) persistence = deepFreeze(safeStorageWrite(storage, storageKey, settings));
    return notify();
  };

  const reset = () => update(DEFAULT_AUDIO_SETTINGS);
  const subscribe = (listener, { emitCurrent = false } = {}) => {
    if (typeof listener !== 'function') throw new TypeError('Audio settings listener must be a function.');
    if (disposed) throw new Error('Audio settings controller is disposed.');
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

  return Object.freeze({ snapshot, update, reset, subscribe, dispose });
}

export function createBackgroundAudioController({ mixer, visibilityTarget } = {}) {
  const audioMixer = requireMixer(mixer);
  if (!visibilityTarget || typeof visibilityTarget.addEventListener !== 'function' || typeof visibilityTarget.removeEventListener !== 'function') {
    throw new TypeError('Background audio requires a visibility event target.');
  }
  let policy = DEFAULT_AUDIO_SETTINGS.backgroundPolicy;
  let configuredMasterMuted = DEFAULT_AUDIO_SETTINGS.muted.master;
  let action = null;
  let disposed = false;

  const isHidden = () => Boolean(visibilityTarget.hidden);
  const restoreMuted = () => {
    if (action !== 'muted') return;
    action = null;
    audioMixer.setMasterMuted(configuredMasterMuted);
  };
  const restorePaused = () => {
    if (action !== 'paused') return;
    action = null;
    void Promise.resolve(audioMixer.resume()).catch(() => {});
  };
  const restore = () => {
    restoreMuted();
    restorePaused();
  };
  const apply = () => {
    if (disposed) return;
    if (!isHidden() || policy === 'continue') {
      restore();
      return;
    }
    if (policy === 'mute') {
      restorePaused();
      audioMixer.setMasterMuted(true);
      action = 'muted';
      return;
    }
    restoreMuted();
    if (action === 'paused') return;
    const status = audioMixer.snapshot().status;
    if (status === 'running') {
      action = 'paused';
      void Promise.resolve(audioMixer.pause()).catch(() => { action = null; });
    }
  };
  const onVisibilityChange = () => apply();
  visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);

  const configure = ({ backgroundPolicy = policy, masterMuted = configuredMasterMuted } = {}) => {
    if (disposed) throw new Error('Background audio controller is disposed.');
    policy = enumValue(backgroundPolicy, BACKGROUND_POLICY_SET, DEFAULT_AUDIO_SETTINGS.backgroundPolicy);
    configuredMasterMuted = Boolean(masterMuted);
    apply();
    return snapshot();
  };
  const snapshot = () => deepFreeze({ policy, configuredMasterMuted, hidden: isHidden(), action, disposed });
  const dispose = () => {
    if (disposed) return false;
    visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
    restore();
    disposed = true;
    return true;
  };

  return Object.freeze({ configure, snapshot, dispose });
}

export function isAudioSettingTarget(value) {
  return TARGET_SET.has(value);
}
