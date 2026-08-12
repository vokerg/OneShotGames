import { DOMAIN_EVENT_TYPES } from '../core/events.js';
import { createUiSfxRuntime } from './ui-sfx.js';
import { createCombatSfxRuntime } from './combat-sfx-runtime.js';
import { createAdaptiveMusicRuntime } from './adaptive-music.js';
import { ADAPTIVE_MUSIC_STATES } from './adaptive-music-synthesis.js';
import { synthesizeAmbience } from './biome-ambience.js';

const DEFAULT_CATALOGS = Object.freeze({
  ui: 'assets/audio/ui/manifest.json',
  combat: 'assets/audio/combat/manifest.json',
  music: 'assets/audio/music/manifest.json',
});
const REQUIRED_FAMILIES = Object.freeze(['ui', 'combat', 'ambience', 'music']);
const AMBIENCE_SAMPLE_RATE = 12_000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function pcm16Wav(samples, sampleRate = AMBIENCE_SAMPLE_RATE) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  }
  return bytes.buffer;
}

function defaultFactories() {
  return Object.freeze({
    ui: createUiSfxRuntime,
    combat: createCombatSfxRuntime,
    music: createAdaptiveMusicRuntime,
    ambience: synthesizeAmbience,
  });
}

export function installActiveAudioOutput({
  mixer,
  events = null,
  game = null,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  catalogs = DEFAULT_CATALOGS,
  factories = defaultFactories(),
} = {}) {
  const requiredMixerMethods = ['unlock', 'decodeAudioData', 'playBuffer', 'snapshot', 'stopAll', 'pause', 'resume'];
  if (!mixer || requiredMixerMethods.some((method) => typeof mixer[method] !== 'function')) {
    throw new TypeError('Active audio output requires the shared mixer.');
  }
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener) {
    throw new TypeError('Active audio output requires a browser event target.');
  }

  let disposed = false;
  let missionActive = Boolean(game?.mission);
  let activated = mixer.snapshot().status === 'running';
  let activationPromise = null;
  let preloadPromise = null;
  let lastError = null;
  let ambienceBuffer = null;
  let ambienceVoice = null;
  let runtimes = null;
  const failures = [];
  const starts = Object.fromEntries(REQUIRED_FAMILIES.map((family) => [family, 0]));

  function mixerRunning() {
    const state = mixer.snapshot();
    return state.status === 'running' || state.contextState === 'running';
  }

  function updatePanelStatus() {
    const element = documentTarget?.querySelector?.('#audioSettingsStatus');
    if (!element) return;
    if (lastError) {
      element.textContent = `Audio output error: ${lastError}`;
      return;
    }
    if (!mixerRunning()) {
      element.textContent = 'Audio output is locked. Click or press a key in the game to enable sound.';
      return;
    }
    if (Object.values(starts).every((count) => count === 0)) {
      element.textContent = 'Audio is unlocked, but no output source has started yet.';
      return;
    }
    const missing = REQUIRED_FAMILIES.filter((family) => starts[family] === 0);
    element.textContent = missing.length
      ? `Audio active. Awaiting output from: ${missing.join(', ')}.`
      : 'Audio active. UI, combat, ambience, and music sources have started.';
  }

  function recordFailure(scope, error) {
    const message = `${scope}: ${errorMessage(error)}`;
    failures.push(message);
    lastError = message;
    updatePanelStatus();
  }

  async function createRuntimes() {
    const [ui, combat, music] = await Promise.all([
      factories.ui({ mixer, catalogSource: catalogs.ui, fetchImpl }),
      factories.combat({ mixer, catalogSource: catalogs.combat, fetchImpl }),
      factories.music({ mixer, catalogSource: catalogs.music, fetchImpl }),
    ]);
    return { ui, combat, music };
  }

  async function preload() {
    if (disposed) return false;
    if (preloadPromise) return preloadPromise;
    preloadPromise = (async () => {
      try {
        runtimes = await createRuntimes();
        await Promise.all([runtimes.ui.preload(), runtimes.combat.preload(), runtimes.music.preload()]);
        const ambience = factories.ambience({ biome: 'donbas', period: 'day', weather: 'clear', intensity: 'calm' });
        const decoded = await mixer.decodeAudioData(pcm16Wav(ambience.samples));
        if (!decoded?.ok || !decoded.buffer) throw new Error(`ambience decode failed: ${decoded?.reason ?? 'unknown'}`);
        ambienceBuffer = decoded.buffer;
        lastError = null;
        updatePanelStatus();
        return true;
      } catch (error) {
        recordFailure('preload', error);
        return false;
      }
    })();
    return preloadPromise;
  }

  function recordPlayback(family, result) {
    if (result?.ok) {
      starts[family] += 1;
      lastError = null;
    } else if (result && !['unknown-cue', 'cooldown', 'concurrency-limit', 'already-playing'].includes(result.reason)) {
      recordFailure(family, result.reason ?? 'playback-failed');
    }
    updatePanelStatus();
    return result;
  }

  function playUi(cue = 'menu.confirm', request = {}) {
    if (!runtimes?.ui) return { ok: false, reason: 'not-loaded' };
    return recordPlayback('ui', runtimes.ui.play(cue, request));
  }

  function playCombat(cue, request = {}) {
    if (!runtimes?.combat) return { ok: false, reason: 'not-loaded' };
    return recordPlayback('combat', runtimes.combat.play(cue, request));
  }

  function playMusic(state = ADAPTIVE_MUSIC_STATES.CALM, request = {}) {
    if (!runtimes?.music) return { ok: false, reason: 'not-loaded' };
    const result = runtimes.music.playState(state, request);
    if (result?.ok && result.reason === 'already-playing') return result;
    return recordPlayback('music', result);
  }

  function playAmbience() {
    if (!ambienceBuffer) return { ok: false, reason: 'not-loaded' };
    if (ambienceVoice) return { ok: true, id: ambienceVoice.id, reason: 'already-playing' };
    const result = mixer.playBuffer({
      buffer: ambienceBuffer,
      bus: 'ambience',
      volume: 0.72,
      loop: true,
      tag: 'biome-ambience',
    });
    if (result?.ok) ambienceVoice = result;
    return recordPlayback('ambience', result);
  }

  async function ensureMissionBed() {
    if (!missionActive || disposed) return false;
    if (!await preload() || !mixerRunning()) {
      updatePanelStatus();
      return false;
    }
    playAmbience();
    playMusic(ADAPTIVE_MUSIC_STATES.CALM, { tick: 0 });
    return true;
  }

  async function activate() {
    if (disposed) return false;
    if (activated && mixerRunning()) return true;
    if (activationPromise) return activationPromise;
    activationPromise = (async () => {
      try {
        const unlocked = await mixer.unlock();
        if (!unlocked || !mixerRunning()) throw new Error(`mixer-${mixer.snapshot().status ?? mixer.snapshot().contextState ?? 'locked'}`);
        activated = true;
        if (!await preload()) return false;
        playUi('menu.confirm', { tick: 0, sequence: 0 });
        await ensureMissionBed();
        return true;
      } catch (error) {
        activated = false;
        recordFailure('unlock', error);
        return false;
      } finally {
        activationPromise = null;
      }
    })();
    return activationPromise;
  }

  const onTrustedInteraction = () => { void activate(); };
  windowTarget.addEventListener('pointerdown', onTrustedInteraction, { passive: true });
  windowTarget.addEventListener('keydown', onTrustedInteraction);

  const unsubscribeAudio = events?.subscribe?.(DOMAIN_EVENT_TYPES.AUDIO, (event) => {
    const payload = event?.payload ?? {};
    const cue = payload.cue;
    if (typeof cue !== 'string' || !cue) return;
    void preload().then((ready) => {
      if (!ready || disposed || !mixerRunning()) return;
      const request = {
        tick: event.tick ?? 0,
        sequence: event.sequence ?? 0,
        gain: payload.gain ?? 1,
        variantKey: payload.variantKey ?? null,
        faction: payload.faction ?? null,
        distance: payload.distance ?? 0,
      };
      if (runtimes.ui.catalog?.byCue?.[cue]) playUi(cue, request);
      else if (runtimes.combat.catalog?.byCue?.[cue]) playCombat(cue, request);
    });
  }) ?? (() => {});

  let restoreStart = null;
  if (game && typeof game.start === 'function') {
    const originalStart = game.start;
    game.start = (...args) => {
      const result = originalStart.apply(game, args);
      missionActive = true;
      void ensureMissionBed();
      return result;
    };
    restoreStart = () => { game.start = originalStart; };
  }

  updatePanelStatus();

  function snapshot() {
    const mixerState = mixer.snapshot();
    return deepFreeze({
      status: lastError ? 'error' : mixerRunning() ? 'ready' : 'locked',
      contextState: mixerState.contextState,
      missionActive,
      activated,
      requiredFamilies: [...REQUIRED_FAMILIES],
      sourcesStarted: { ...starts },
      voiceMode: 'hook-only',
      failures: [...failures],
      lastError,
      runtimes: runtimes ? {
        ui: runtimes.ui.snapshot?.() ?? null,
        combat: runtimes.combat.snapshot?.() ?? null,
        music: runtimes.music.snapshot?.() ?? null,
      } : null,
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    windowTarget.removeEventListener('pointerdown', onTrustedInteraction);
    windowTarget.removeEventListener('keydown', onTrustedInteraction);
    unsubscribeAudio();
    restoreStart?.();
    ambienceVoice?.stop?.();
    ambienceVoice = null;
    try { runtimes?.music?.dispose?.(); } catch { /* presentation teardown is fail-closed */ }
    return true;
  }

  return Object.freeze({ preload, activate, snapshot, dispose });
}
