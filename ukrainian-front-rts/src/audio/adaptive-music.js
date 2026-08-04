import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_PRIORITIES,
  createAudioEventMap,
  resolveAudioEvent,
} from './audio-event-map.js';
import {
  ADAPTIVE_MUSIC_STATES,
  buildAdaptiveMusicBanks,
} from './adaptive-music-synthesis.js';

export const ADAPTIVE_MUSIC_CATALOG_SCHEMA = 'fields-of-resolve.adaptive-music';
export const ADAPTIVE_MUSIC_CATALOG_VERSION = 1;
export const ADAPTIVE_MUSIC_TAG = 'adaptive-music';
export const DEFAULT_MUSIC_DWELL_TICKS = 120;

const STATE_SET = new Set(Object.values(ADAPTIVE_MUSIC_STATES));
const STAGE_SET = new Set(['operations', 'menu', 'briefing', 'loading', 'battlefield', 'debrief']);
const OUTCOME_SET = new Set(['victory', 'defeat', 'withdrawal']);
const BATTLEFIELD_STATE_SET = new Set([ADAPTIVE_MUSIC_STATES.CALM, ADAPTIVE_MUSIC_STATES.TENSION, ADAPTIVE_MUSIC_STATES.BATTLE, ADAPTIVE_MUSIC_STATES.CRISIS]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const SHA_PATTERN = /^[0-9a-f]{64}$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object.`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}
function id(value, label) {
  const result = text(value, label);
  if (!ID_PATTERN.test(result)) throw new TypeError(`${label} must be a stable identifier.`);
  return result;
}
function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  return value;
}
function number(value, label, minimum = 0, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function normalizeProvenance(value, label) {
  const source = object(value, label);
  if (!Array.isArray(source.externalInputs)) throw new TypeError(`${label}.externalInputs must be an array.`);
  return deepFreeze({
    creator: text(source.creator, `${label}.creator`),
    source: text(source.source, `${label}.source`),
    license: text(source.license, `${label}.license`),
    redistribution: text(source.redistribution, `${label}.redistribution`),
    generatedTool: text(source.generatedTool, `${label}.generatedTool`),
    externalInputs: source.externalInputs.map((entry, index) => text(entry, `${label}.externalInputs[${index}]`)),
    synthesis: text(source.synthesis, `${label}.synthesis`),
    seed: integer(source.seed, `${label}.seed`),
    humanCorrections: text(source.humanCorrections, `${label}.humanCorrections`),
  });
}

export function validateAdaptiveMusicCatalog(value, { source = 'adaptive music catalog' } = {}) {
  const input = object(value, source);
  if (input.schema !== ADAPTIVE_MUSIC_CATALOG_SCHEMA || input.version !== ADAPTIVE_MUSIC_CATALOG_VERSION) throw new TypeError(`${source} has an unsupported schema/version.`);
  const format = {
    sampleRate: integer(input.sampleRate, `${source}.sampleRate`, 1),
    channels: integer(input.channels, `${source}.channels`, 1),
    bitsPerSample: integer(input.bitsPerSample, `${source}.bitsPerSample`, 1),
  };
  const peakCeiling = number(input.peakCeiling, `${source}.peakCeiling`, 0, 1);
  const tracks = (input.tracks ?? []).map((value, index) => {
    const track = object(value, `${source}.tracks[${index}]`);
    const trackId = id(track.id, `${source}.tracks[${index}].id`);
    const state = id(track.state, `${trackId}.state`);
    if (!STATE_SET.has(state)) throw new RangeError(`${trackId} uses unknown music state ${state}.`);
    const path = text(track.path, `${trackId}.path`);
    if (path.startsWith('/') || path.includes('..') || !path.endsWith('.wav')) throw new TypeError(`${trackId}.path must be a relative WAV path.`);
    if (!SHA_PATTERN.test(track.sha256)) throw new TypeError(`${trackId}.sha256 must be lowercase SHA-256.`);
    if (track.eventId !== AUDIO_EVENT_IDS.MUSIC_STATE) throw new RangeError(`${trackId}.eventId must be ${AUDIO_EVENT_IDS.MUSIC_STATE}.`);
    if (track.loop !== true) throw new Error(`${trackId} must be loop-enabled.`);
    const durationMs = integer(track.durationMs, `${trackId}.durationMs`, 1);
    const sampleCount = integer(track.sampleCount, `${trackId}.sampleCount`, 1);
    const byteLength = integer(track.byteLength, `${trackId}.byteLength`, 45);
    const peak = number(track.peak, `${trackId}.peak`, 0, peakCeiling);
    const expectedSamples = Math.round(durationMs / 1000 * format.sampleRate);
    const expectedBytes = 44 + sampleCount * format.channels * format.bitsPerSample / 8;
    if (sampleCount !== expectedSamples) throw new Error(`${trackId}.sampleCount does not match duration and sample rate.`);
    if (!Number.isInteger(expectedBytes) || byteLength !== expectedBytes) throw new Error(`${trackId}.byteLength does not match PCM format.`);
    return deepFreeze({
      id: trackId,
      state,
      eventId: track.eventId,
      path,
      durationMs,
      sampleCount,
      byteLength,
      sha256: track.sha256,
      peak,
      gain: number(track.gain ?? 1, `${trackId}.gain`, 0, 1),
      loop: true,
      ...format,
      provenance: normalizeProvenance(track.provenance, `${trackId}.provenance`),
    });
  }).sort((left, right) => compare(left.state, right.state));
  if (tracks.length !== STATE_SET.size) throw new Error('Adaptive music catalog must cover every state exactly once.');
  if (new Set(tracks.map((track) => track.id)).size !== tracks.length || new Set(tracks.map((track) => track.state)).size !== tracks.length || new Set(tracks.map((track) => track.path)).size !== tracks.length) throw new Error('Adaptive music track IDs, states, and paths must be unique.');
  for (const state of STATE_SET) if (!tracks.some((track) => track.state === state)) throw new Error(`Adaptive music catalog is missing state ${state}.`);
  return deepFreeze({
    schema: ADAPTIVE_MUSIC_CATALOG_SCHEMA,
    version: ADAPTIVE_MUSIC_CATALOG_VERSION,
    id: id(input.id, `${source}.id`),
    generatedAt: text(input.generatedAt, `${source}.generatedAt`),
    ...format,
    peakCeiling,
    tracks,
    byState: Object.fromEntries(tracks.map((track) => [track.state, track])),
    byId: Object.fromEntries(tracks.map((track) => [track.id, track])),
  });
}

export async function loadAdaptiveMusicCatalog(source, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof source !== 'string' && !(source instanceof URL)) return validateAdaptiveMusicCatalog(source);
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for adaptive music.');
  const sourceUrl = String(source);
  const response = await fetchImpl(sourceUrl);
  if (!response?.ok) throw new Error(`Unable to load adaptive music catalog (${response?.status ?? 'unknown'}).`);
  return validateAdaptiveMusicCatalog(await response.json(), { source: sourceUrl });
}

function normalizeContext(value) {
  const source = object(value, 'Adaptive music context');
  const stage = source.stage ?? 'battlefield';
  if (!STAGE_SET.has(stage)) throw new RangeError(`Unknown adaptive music stage: ${stage}`);
  const outcome = source.outcome ?? null;
  if (outcome !== null && !OUTCOME_SET.has(outcome)) throw new RangeError(`Unknown adaptive music outcome: ${outcome}`);
  return Object.freeze({
    tick: integer(source.tick ?? 0, 'Adaptive music context.tick'),
    stage,
    outcome,
    intensity: number(source.intensity ?? 0, 'Adaptive music context.intensity', 0, 1),
  });
}

export function chooseAdaptiveMusicState(context, currentState = ADAPTIVE_MUSIC_STATES.MENU) {
  const input = normalizeContext(context);
  if (!STATE_SET.has(currentState)) throw new RangeError(`Unknown current adaptive music state: ${currentState}`);
  if (input.outcome === 'victory') return ADAPTIVE_MUSIC_STATES.VICTORY;
  if (input.outcome === 'defeat' || input.outcome === 'withdrawal') return ADAPTIVE_MUSIC_STATES.DEFEAT;
  if (input.stage === 'operations' || input.stage === 'menu') return ADAPTIVE_MUSIC_STATES.MENU;
  if (input.stage === 'briefing' || input.stage === 'loading') return ADAPTIVE_MUSIC_STATES.BRIEFING;
  if (input.stage === 'debrief') return ADAPTIVE_MUSIC_STATES.MENU;
  const value = input.intensity;
  if (currentState === ADAPTIVE_MUSIC_STATES.CRISIS && value >= 0.72) return ADAPTIVE_MUSIC_STATES.CRISIS;
  if (currentState === ADAPTIVE_MUSIC_STATES.BATTLE && value >= 0.45 && value < 0.82) return ADAPTIVE_MUSIC_STATES.BATTLE;
  if (currentState === ADAPTIVE_MUSIC_STATES.TENSION && value >= 0.18 && value < 0.55) return ADAPTIVE_MUSIC_STATES.TENSION;
  if (value >= 0.82) return ADAPTIVE_MUSIC_STATES.CRISIS;
  if (value >= 0.55) return ADAPTIVE_MUSIC_STATES.BATTLE;
  if (value >= 0.25) return ADAPTIVE_MUSIC_STATES.TENSION;
  return ADAPTIVE_MUSIC_STATES.CALM;
}

function policyFor(track) {
  return createAudioEventMap([{
    id: AUDIO_EVENT_IDS.MUSIC_STATE,
    bus: 'music',
    priority: AUDIO_EVENT_PRIORITIES.BACKGROUND,
    cooldownTicks: 0,
    concurrency: { key: ADAPTIVE_MUSIC_TAG, limit: 1 },
    factionMode: 'shared',
    assets: { shared: [track.id] },
    missingAsset: { policy: 'reject' },
    tag: ADAPTIVE_MUSIC_TAG,
  }]);
}

function requireMixer(mixer) {
  const required = ['decodeAudioData', 'playBuffer', 'stopAll', 'pause', 'resume', 'snapshot'];
  if (!mixer || required.some((method) => typeof mixer[method] !== 'function')) throw new TypeError('Adaptive music runtime requires a compatible audio mixer.');
  return mixer;
}

export async function createAdaptiveMusicRuntime({ mixer, catalogSource, fetchImpl, digestImpl = null, bankFactory = buildAdaptiveMusicBanks } = {}) {
  const audioMixer = requireMixer(mixer);
  if (catalogSource === undefined) throw new TypeError('Adaptive music runtime requires catalogSource.');
  if (digestImpl !== null && typeof digestImpl !== 'function') throw new TypeError('digestImpl must be null or a function.');
  if (typeof bankFactory !== 'function') throw new TypeError('bankFactory must be a function.');
  const catalog = await loadAdaptiveMusicCatalog(catalogSource, { fetchImpl });
  const maps = new Map(catalog.tracks.map((track) => [track.state, policyFor(track)]));
  const buffers = new Map();
  const failures = new Map();
  let activeState = null;
  let activeVoiceId = null;
  let disposed = false;

  function snapshot() {
    return deepFreeze({
      catalogId: catalog.id,
      activeState,
      activeVoiceId,
      loadedStates: catalog.tracks.filter((track) => buffers.has(track.state)).map((track) => track.state).sort(),
      failures: Object.fromEntries([...failures.entries()].sort()),
      disposed,
    });
  }

  async function preload() {
    if (disposed) return deepFreeze({ ...snapshot(), reason: 'disposed' });
    let generated;
    try {
      generated = bankFactory();
      if (!generated || !Array.isArray(generated.banks)) throw new TypeError('Adaptive music synthesis must return banks.');
    } catch (error) {
      for (const track of catalog.tracks) failures.set(track.state, error instanceof Error ? error.message : String(error));
      return snapshot();
    }
    const byId = new Map(generated.banks.map((bank) => [bank.id, bank]));
    for (const track of catalog.tracks) {
      if (buffers.has(track.state)) continue;
      failures.delete(track.state);
      try {
        const output = byId.get(track.state);
        if (!output || !(output.bytes instanceof Uint8Array)) throw new Error('synthesis bank missing');
        const data = output.bytes.buffer.slice(output.bytes.byteOffset, output.bytes.byteOffset + output.bytes.byteLength);
        if (data.byteLength !== track.byteLength) throw new Error('byte length mismatch');
        if (digestImpl && await digestImpl(data) !== track.sha256) throw new Error('SHA-256 mismatch');
        const decoded = await audioMixer.decodeAudioData(data);
        if (!decoded?.ok || !decoded.buffer) throw new Error(`decode failed: ${decoded?.reason ?? 'unknown'}`);
        buffers.set(track.state, decoded.buffer);
      } catch (error) {
        failures.set(track.state, error instanceof Error ? error.message : String(error));
      }
    }
    return snapshot();
  }

  function playState(state, { tick = 0, gain = 1, force = false } = {}) {
    if (disposed) return deepFreeze({ ok: false, state, reason: 'disposed' });
    if (!STATE_SET.has(state)) return deepFreeze({ ok: false, state, reason: 'unknown-state' });
    if (!force && state === activeState && activeVoiceId) {
      try {
        const stillActive = (audioMixer.snapshot().voices ?? []).some((voice) => voice.id === activeVoiceId);
        if (stillActive) return deepFreeze({ ok: true, state, voiceId: activeVoiceId, reason: 'already-playing' });
      } catch { /* stale or unavailable mixer inspection falls through to a restart attempt */ }
      activeState = null;
      activeVoiceId = null;
    }
    const track = catalog.byState[state];
    try {
      const resolved = resolveAudioEvent(maps.get(state), { id: AUDIO_EVENT_IDS.MUSIC_STATE, tick, gain }, {
        availableAssetIds: buffers.has(state) ? [track.id] : [],
        activeCounts: {},
        lastPlayedTicks: {},
      });
      if (!resolved.ok) return deepFreeze({ ...resolved, state });
      const buffer = buffers.get(state);
      if (!buffer) return deepFreeze({ ok: false, state, reason: 'missing-buffer' });
      audioMixer.stopAll({ bus: 'music', tag: ADAPTIVE_MUSIC_TAG });
      activeState = null;
      activeVoiceId = null;
      const playback = audioMixer.playBuffer({ buffer, bus: 'music', volume: resolved.gain * track.gain, loop: true, tag: ADAPTIVE_MUSIC_TAG });
      if (!playback?.ok) return deepFreeze({ ...playback, state, assetId: track.id });
      activeState = state;
      activeVoiceId = playback.id;
      return deepFreeze({ ok: true, state, assetId: track.id, voiceId: playback.id, loop: true, bus: 'music' });
    } catch (error) {
      return deepFreeze({ ok: false, state, reason: error instanceof TypeError || error instanceof RangeError ? 'invalid-request' : 'runtime-error' });
    }
  }

  function stop() {
    if (disposed) return 0;
    const count = audioMixer.stopAll({ bus: 'music', tag: ADAPTIVE_MUSIC_TAG });
    activeState = null;
    activeVoiceId = null;
    return count;
  }

  async function pause() {
    if (disposed) return false;
    try { return Boolean(await audioMixer.pause()); } catch { return false; }
  }
  async function resume() {
    if (disposed) return false;
    try { return Boolean(await audioMixer.resume()); } catch { return false; }
  }
  function dispose() {
    if (disposed) return;
    try { stop(); } catch { activeState = null; activeVoiceId = null; }
    disposed = true;
    buffers.clear();
  }

  return Object.freeze({ catalog, preload, playState, stop, pause, resume, snapshot, dispose });
}

export function createAdaptiveMusicDirector({ runtime, initialState = ADAPTIVE_MUSIC_STATES.MENU, minDwellTicks = DEFAULT_MUSIC_DWELL_TICKS } = {}) {
  if (!runtime || typeof runtime.playState !== 'function') throw new TypeError('Adaptive music director requires a runtime.');
  if (!STATE_SET.has(initialState)) throw new RangeError(`Unknown initial adaptive music state: ${initialState}`);
  const dwell = integer(minDwellTicks, 'Adaptive music minDwellTicks');
  let currentState = initialState;
  let changedAtTick = 0;
  let lastTick = 0;

  function snapshot() { return deepFreeze({ currentState, changedAtTick, lastTick, minDwellTicks: dwell }); }
  function requestPlayback(state, tick) {
    try { return runtime.playState(state, { tick }); }
    catch { return { ok: false, reason: 'runtime-error' }; }
  }

  function update(context) {
    let input;
    try { input = normalizeContext(context); } catch { return deepFreeze({ ok: false, reason: 'invalid-context', ...snapshot() }); }
    if (input.tick < lastTick) return deepFreeze({ ok: false, reason: 'tick-regression', ...snapshot() });
    lastTick = input.tick;
    const nextState = chooseAdaptiveMusicState(input, currentState);
    if (nextState === currentState) {
      const playback = requestPlayback(currentState, input.tick);
      if (!playback?.ok) return deepFreeze({ ok: false, changed: false, reason: playback?.reason ?? 'runtime-error', nextState, ...snapshot() });
      return deepFreeze({ ok: true, changed: false, reason: playback.reason === 'already-playing' ? 'stable' : 'reconciled', playback, ...snapshot() });
    }
    const immediate = input.outcome !== null || input.stage !== 'battlefield' || !BATTLEFIELD_STATE_SET.has(currentState);
    const eligibleAtTick = changedAtTick + dwell;
    if (!immediate && input.tick < eligibleAtTick) return deepFreeze({ ok: true, changed: false, reason: 'dwell', nextState, eligibleAtTick, ...snapshot() });
    const playback = requestPlayback(nextState, input.tick);
    if (!playback?.ok) return deepFreeze({ ok: false, changed: false, reason: playback?.reason ?? 'runtime-error', nextState, ...snapshot() });
    const previousState = currentState;
    currentState = nextState;
    changedAtTick = input.tick;
    return deepFreeze({ ok: true, changed: true, previousState, nextState, playback, ...snapshot() });
  }

  return Object.freeze({ update, snapshot });
}
