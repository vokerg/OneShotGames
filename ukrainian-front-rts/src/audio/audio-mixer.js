export const AUDIO_BUS_IDS = Object.freeze(['music', 'sfx', 'voice', 'ambience']);
export const AUDIO_MIXER_VERSION = 1;

const BUS_SET = new Set(AUDIO_BUS_IDS);
const DEFAULT_VOLUMES = Object.freeze({ master: 1, music: 0.8, sfx: 1, voice: 1, ambience: 0.8 });
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function defaultContextFactory() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function setGain(node, value, time = 0) {
  if (!node?.gain) return;
  if (typeof node.gain.setValueAtTime === 'function') node.gain.setValueAtTime(value, time);
  else node.gain.value = value;
}

function safeDisconnect(node) {
  try { node?.disconnect?.(); } catch { /* already disconnected */ }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createAudioMixer({
  contextFactory = defaultContextFactory,
  maxVoices = 32,
  diagnosticLimit = 32,
  initialVolumes = DEFAULT_VOLUMES,
} = {}) {
  if (typeof contextFactory !== 'function') throw new TypeError('Audio contextFactory must be a function.');
  const voiceLimit = positiveInteger(maxVoices, 'Audio maxVoices');
  const historyLimit = positiveInteger(diagnosticLimit, 'Audio diagnosticLimit');
  plainObject(initialVolumes, 'Audio initialVolumes');

  let context = null;
  let masterGain = null;
  let status = 'locked';
  let paused = false;
  let disposed = false;
  let nextVoiceId = 1;
  let nextDiagnosticId = 1;
  const busGains = new Map();
  const slots = [];
  const active = new Map();
  const diagnostics = [];
  const volumes = { master: clamp(finite(initialVolumes.master ?? 1, 'Master volume')) };
  const muted = { master: false };
  for (const bus of AUDIO_BUS_IDS) {
    volumes[bus] = clamp(finite(initialVolumes[bus] ?? DEFAULT_VOLUMES[bus], `${bus} volume`));
    muted[bus] = false;
  }

  function record(kind, message, details = {}) {
    plainObject(details, 'Audio diagnostic details');
    diagnostics.push(Object.freeze({ id: nextDiagnosticId++, kind, message: String(message), details: Object.freeze({ ...details }) }));
    if (diagnostics.length > historyLimit) diagnostics.splice(0, diagnostics.length - historyLimit);
  }

  function assertUsable() {
    if (disposed) throw new Error('Audio mixer is disposed.');
  }

  function busId(value) {
    const id = stableId(value, 'Audio bus ID');
    if (!BUS_SET.has(id)) throw new RangeError(`Unknown audio bus: ${id}`);
    return id;
  }

  function applyGains() {
    if (!context || !masterGain) return;
    setGain(masterGain, muted.master ? 0 : volumes.master, context.currentTime ?? 0);
    for (const bus of AUDIO_BUS_IDS) {
      setGain(busGains.get(bus), muted[bus] ? 0 : volumes[bus], context.currentTime ?? 0);
    }
  }

  function createGraph() {
    masterGain = context.createGain();
    masterGain.connect(context.destination);
    for (const bus of AUDIO_BUS_IDS) {
      const gain = context.createGain();
      gain.connect(masterGain);
      busGains.set(bus, gain);
    }
    for (let index = 0; index < voiceLimit; index += 1) {
      slots.push({ index, gain: context.createGain(), bus: null, voiceId: null });
      setGain(slots[index].gain, 1, context.currentTime ?? 0);
    }
    applyGains();
  }

  async function unlock() {
    assertUsable();
    if (status === 'running') return true;
    try {
      if (!context) {
        context = contextFactory();
        if (!context) {
          status = 'unavailable';
          record('unavailable', 'Web Audio is not available.');
          return false;
        }
        createGraph();
      }
      if (typeof context.resume === 'function' && context.state !== 'running') await context.resume();
      status = context.state === 'closed' ? 'closed' : 'running';
      paused = false;
      record('unlock', 'Audio context unlocked.', { state: context.state ?? 'unknown' });
      return status === 'running';
    } catch (error) {
      status = 'failed';
      record('error', 'Audio unlock failed.', { error: errorMessage(error) });
      return false;
    }
  }

  function bindUnlock(target, { events = ['pointerdown', 'keydown', 'touchstart'] } = {}) {
    assertUsable();
    if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') {
      throw new TypeError('Audio unlock target must implement addEventListener/removeEventListener.');
    }
    const eventNames = [...new Set(events.map((event) => stableId(event, 'Audio unlock event')))];
    let bound = true;
    const dispose = () => {
      if (!bound) return;
      bound = false;
      for (const event of eventNames) target.removeEventListener(event, listener);
    };
    const listener = async () => {
      if (await unlock()) dispose();
    };
    for (const event of eventNames) target.addEventListener(event, listener, { passive: true });
    return dispose;
  }

  function setVolume(target, value) {
    assertUsable();
    const normalized = clamp(finite(value, 'Audio volume'));
    if (target !== 'master') busId(target);
    volumes[target] = normalized;
    applyGains();
    return normalized;
  }

  function setMuted(target, value) {
    assertUsable();
    if (typeof value !== 'boolean') throw new TypeError('Audio mute state must be boolean.');
    if (target !== 'master') busId(target);
    muted[target] = value;
    applyGains();
    return value;
  }

  function releaseVoice(voiceId, reason = 'ended') {
    const voice = active.get(voiceId);
    if (!voice) return false;
    active.delete(voiceId);
    voice.slot.voiceId = null;
    voice.slot.bus = null;
    safeDisconnect(voice.source);
    safeDisconnect(voice.slot.gain);
    setGain(voice.slot.gain, 1, context?.currentTime ?? 0);
    record('voice-release', 'Audio voice released.', { voiceId, reason, bus: voice.bus });
    return true;
  }

  function playBuffer({
    buffer,
    bus = 'sfx',
    volume = 1,
    loop = false,
    playbackRate = 1,
    when = 0,
    offset = 0,
    duration,
    tag = null,
  } = {}) {
    assertUsable();
    const route = busId(bus);
    if (status !== 'running') return Object.freeze({ ok: false, reason: status === 'locked' ? 'locked' : status });
    if (paused) return Object.freeze({ ok: false, reason: 'paused' });
    if (!buffer) return Object.freeze({ ok: false, reason: 'missing-buffer' });
    const slot = slots.find((candidate) => candidate.voiceId === null);
    if (!slot) {
      record('voice-rejected', 'Audio voice limit reached.', { bus: route, maxVoices: voiceLimit });
      return Object.freeze({ ok: false, reason: 'voice-limit' });
    }

    const normalizedVolume = clamp(finite(volume, 'Audio voice volume'));
    const normalizedRate = finite(playbackRate, 'Audio playbackRate');
    if (normalizedRate <= 0) throw new RangeError('Audio playbackRate must be positive.');
    const startWhen = Math.max(0, finite(when, 'Audio start time'));
    const startOffset = Math.max(0, finite(offset, 'Audio start offset'));
    const startDuration = duration === undefined ? null : Math.max(0, finite(duration, 'Audio duration'));
    const normalizedTag = tag === null ? null : stableId(tag, 'Audio voice tag');
    const voiceId = `voice-${nextVoiceId++}`;
    let source;
    try {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = Boolean(loop);
      if (source.playbackRate) source.playbackRate.value = normalizedRate;
      setGain(slot.gain, normalizedVolume, context.currentTime ?? 0);
      slot.gain.connect(busGains.get(route));
      source.connect(slot.gain);
      slot.voiceId = voiceId;
      slot.bus = route;
      const voice = { id: voiceId, source, slot, bus: route, tag: normalizedTag, startedAt: context.currentTime ?? 0 };
      active.set(voiceId, voice);
      source.onended = () => releaseVoice(voiceId, 'ended');
      if (startDuration === null) source.start(startWhen, startOffset);
      else source.start(startWhen, startOffset, startDuration);
      record('voice-start', 'Audio voice started.', { voiceId, bus: route, tag: normalizedTag });
      return Object.freeze({
        ok: true,
        id: voiceId,
        bus: route,
        tag: normalizedTag,
        stop: () => stopVoice(voiceId),
      });
    } catch (error) {
      if (source) safeDisconnect(source);
      slot.voiceId = null;
      slot.bus = null;
      safeDisconnect(slot.gain);
      record('error', 'Audio voice start failed.', { bus: route, error: errorMessage(error) });
      return Object.freeze({ ok: false, reason: 'start-failed' });
    }
  }

  function stopVoice(voiceId) {
    assertUsable();
    const id = stableId(voiceId, 'Audio voice ID');
    const voice = active.get(id);
    if (!voice) return false;
    try { voice.source.stop?.(); } catch { /* source may already be ended */ }
    return releaseVoice(id, 'stopped');
  }

  function stopAll({ bus = null, tag = null } = {}) {
    assertUsable();
    const route = bus === null ? null : busId(bus);
    const normalizedTag = tag === null ? null : stableId(tag, 'Audio voice tag');
    const idsToStop = [...active.values()]
      .filter((voice) => (route === null || voice.bus === route) && (normalizedTag === null || voice.tag === normalizedTag))
      .map((voice) => voice.id)
      .sort();
    for (const voiceId of idsToStop) stopVoice(voiceId);
    return idsToStop.length;
  }

  async function pause() {
    assertUsable();
    if (!context || status !== 'running' || paused) return false;
    try {
      await context.suspend?.();
      paused = true;
      status = 'paused';
      record('pause', 'Audio mixer paused.');
      return true;
    } catch (error) {
      record('error', 'Audio pause failed.', { error: errorMessage(error) });
      return false;
    }
  }

  async function resume() {
    assertUsable();
    if (!context) return unlock();
    if (!paused && status === 'running') return true;
    try {
      await context.resume?.();
      paused = false;
      status = 'running';
      record('resume', 'Audio mixer resumed.');
      return true;
    } catch (error) {
      status = 'failed';
      record('error', 'Audio resume failed.', { error: errorMessage(error) });
      return false;
    }
  }

  async function decodeAudioData(data) {
    assertUsable();
    if (!(data instanceof ArrayBuffer)) throw new TypeError('Audio decode input must be an ArrayBuffer.');
    if (!context && !(await unlock())) return Object.freeze({ ok: false, reason: status });
    try {
      const buffer = await context.decodeAudioData(data.slice(0));
      return Object.freeze({ ok: true, buffer });
    } catch (error) {
      record('error', 'Audio decode failed.', { error: errorMessage(error) });
      return Object.freeze({ ok: false, reason: 'decode-failed' });
    }
  }

  function snapshot() {
    const busState = {};
    for (const bus of AUDIO_BUS_IDS) busState[bus] = Object.freeze({ volume: volumes[bus], muted: muted[bus] });
    return deepFreeze({
      version: AUDIO_MIXER_VERSION,
      status,
      available: status !== 'unavailable',
      unlocked: Boolean(context),
      paused,
      disposed,
      contextState: context?.state ?? null,
      master: { volume: volumes.master, muted: muted.master },
      buses: busState,
      voices: [...active.values()]
        .map((voice) => ({ id: voice.id, bus: voice.bus, tag: voice.tag, slot: voice.slot.index, startedAt: voice.startedAt }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      activeVoiceCount: active.size,
      maxVoices: voiceLimit,
      diagnostics: [...diagnostics],
    });
  }

  async function dispose() {
    if (disposed) return;
    stopAll();
    for (const slot of slots) safeDisconnect(slot.gain);
    for (const gain of busGains.values()) safeDisconnect(gain);
    safeDisconnect(masterGain);
    try { await context?.close?.(); } catch (error) { record('error', 'Audio context close failed.', { error: errorMessage(error) }); }
    disposed = true;
    paused = false;
    status = 'closed';
    context = null;
    masterGain = null;
    busGains.clear();
    slots.length = 0;
  }

  return Object.freeze({
    unlock,
    bindUnlock,
    playBuffer,
    stopVoice,
    stopAll,
    pause,
    resume,
    decodeAudioData,
    setMasterVolume: (value) => setVolume('master', value),
    setBusVolume: (bus, value) => setVolume(busId(bus), value),
    setMasterMuted: (value) => setMuted('master', value),
    setBusMuted: (bus, value) => setMuted(busId(bus), value),
    snapshot,
    dispose,
  });
}
