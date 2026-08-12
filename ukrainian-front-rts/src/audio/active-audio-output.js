import { DOMAIN_EVENT_TYPES } from '../core/events.js';

const FAMILY_CONFIG = Object.freeze({
  ui: Object.freeze({ bus: 'sfx', frequency: 660, seconds: 0.09, volume: 0.2, loop: false }),
  combat: Object.freeze({ bus: 'sfx', frequency: 110, seconds: 0.18, volume: 0.28, loop: false }),
  ambience: Object.freeze({ bus: 'ambience', frequency: 82, seconds: 2.4, volume: 0.08, loop: true }),
  music: Object.freeze({ bus: 'music', frequency: 196, seconds: 1.6, volume: 0.07, loop: true }),
  voice: Object.freeze({ bus: 'voice', frequency: 440, seconds: 0.14, volume: 0.16, loop: false }),
});
const FAMILY_IDS = Object.freeze(Object.keys(FAMILY_CONFIG));
const SAMPLE_RATE = 12_000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pcm16Wav({ frequency, seconds }) {
  const frameCount = Math.max(1, Math.round(SAMPLE_RATE * seconds));
  const bytes = new Uint8Array(44 + frameCount * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frameCount * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frameCount * 2, true);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const attack = Math.min(1, frame / Math.max(1, SAMPLE_RATE * 0.012));
    const release = Math.min(1, (frameCount - frame - 1) / Math.max(1, SAMPLE_RATE * 0.025));
    const envelope = Math.max(0, Math.min(attack, release));
    const fundamental = Math.sin(time * Math.PI * 2 * frequency);
    const overtone = Math.sin(time * Math.PI * 2 * frequency * 1.5) * 0.22;
    const sample = Math.max(-1, Math.min(1, (fundamental + overtone) * envelope * 0.5));
    view.setInt16(44 + frame * 2, Math.round(sample * 32767), true);
  }
  return bytes.buffer;
}

function familyForCue(cue = '') {
  const value = String(cue).toLowerCase();
  if (/voice|radio|speech|acknowledg/.test(value)) return 'voice';
  if (/shot|fire|impact|explosion|combat|weapon|hit|destroy/.test(value)) return 'combat';
  if (/music|victory|defeat/.test(value)) return 'music';
  if (/ambience|weather|wind|rain/.test(value)) return 'ambience';
  return 'ui';
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function installActiveAudioOutput({
  mixer,
  events = null,
  game = null,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
} = {}) {
  if (!mixer || ['unlock', 'decodeAudioData', 'playBuffer', 'snapshot'].some((method) => typeof mixer[method] !== 'function')) {
    throw new TypeError('Active audio output requires the shared mixer.');
  }
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener) {
    throw new TypeError('Active audio output requires a browser event target.');
  }

  let disposed = false;
  let preloadPromise = null;
  let lastError = null;
  let missionActive = Boolean(game?.mission);
  const buffers = new Map();
  const persistent = new Map();
  const starts = Object.fromEntries(FAMILY_IDS.map((family) => [family, 0]));
  const failures = [];

  function updatePanelStatus() {
    const element = documentTarget?.querySelector?.('#audioSettingsStatus');
    if (!element) return;
    const mixerState = mixer.snapshot();
    if (lastError) element.textContent = `Audio output error: ${lastError}`;
    else if (mixerState.status !== 'running') element.textContent = 'Audio output is locked. Click or press a key in the game to enable sound.';
    else if (Object.values(starts).every((count) => count === 0)) element.textContent = 'Audio is unlocked, but no output source has started yet.';
  }

  async function preload() {
    if (preloadPromise) return preloadPromise;
    preloadPromise = (async () => {
      if (!await mixer.unlock()) {
        lastError = `mixer-${mixer.snapshot().status}`;
        updatePanelStatus();
        return false;
      }
      for (const family of FAMILY_IDS) {
        try {
          const decoded = await mixer.decodeAudioData(pcm16Wav(FAMILY_CONFIG[family]));
          if (!decoded?.ok || !decoded.buffer) throw new Error(decoded?.reason ?? 'decode-failed');
          buffers.set(family, decoded.buffer);
        } catch (error) {
          const message = `${family}: ${errorMessage(error)}`;
          failures.push(message);
          lastError = message;
        }
      }
      updatePanelStatus();
      return buffers.size > 0;
    })();
    return preloadPromise;
  }

  function play(family, { restartLoop = false } = {}) {
    if (disposed || !buffers.has(family)) return Object.freeze({ ok: false, family, reason: disposed ? 'disposed' : 'not-loaded' });
    const config = FAMILY_CONFIG[family];
    if (config.loop && persistent.has(family) && !restartLoop) return Object.freeze({ ok: true, family, id: persistent.get(family).id, reused: true });
    if (config.loop && restartLoop) persistent.get(family)?.stop?.();
    const result = mixer.playBuffer({
      buffer: buffers.get(family),
      bus: config.bus,
      volume: config.volume,
      loop: config.loop,
      tag: `active-output-${family}`,
    });
    if (result.ok) {
      starts[family] += 1;
      if (config.loop) persistent.set(family, result);
      lastError = null;
    } else {
      lastError = `${family}: ${result.reason}`;
      failures.push(lastError);
    }
    updatePanelStatus();
    return Object.freeze({ ...result, family });
  }

  async function ensureMissionBed() {
    if (!missionActive || !await preload()) return;
    play('ambience');
    play('music');
  }

  const onTrustedInteraction = () => {
    void preload().then((ready) => {
      if (!ready || disposed) return;
      play('ui');
      void ensureMissionBed();
    });
  };
  windowTarget.addEventListener('pointerdown', onTrustedInteraction, { passive: true });
  windowTarget.addEventListener('keydown', onTrustedInteraction);

  const unsubscribeAudio = events?.subscribe?.(DOMAIN_EVENT_TYPES.AUDIO, (event) => {
    const family = familyForCue(event?.payload?.cue ?? event?.payload?.eventId ?? '');
    void preload().then((ready) => { if (ready && !disposed) play(family); });
  }) ?? (() => {});

  let restoreStart = null;
  if (game && typeof game.start === 'function') {
    const originalStart = game.start;
    game.start = (...args) => {
      const result = originalStart.apply(game, args);
      missionActive = true;
      void preload().then((ready) => {
        if (!ready || disposed) return;
        play('voice');
        void ensureMissionBed();
      });
      return result;
    };
    restoreStart = () => { game.start = originalStart; };
  }

  updatePanelStatus();

  function snapshot() {
    const mixerState = mixer.snapshot();
    return deepFreeze({
      status: lastError ? 'error' : mixerState.status === 'running' ? 'ready' : 'locked',
      contextState: mixerState.contextState,
      missionActive,
      loadedFamilies: [...buffers.keys()].sort(),
      sourcesStarted: { ...starts },
      failures: [...failures],
      lastError,
    });
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    windowTarget.removeEventListener('pointerdown', onTrustedInteraction);
    windowTarget.removeEventListener('keydown', onTrustedInteraction);
    unsubscribeAudio();
    restoreStart?.();
    for (const voice of persistent.values()) voice.stop?.();
    persistent.clear();
    return true;
  }

  return Object.freeze({ preload, play, snapshot, dispose });
}
