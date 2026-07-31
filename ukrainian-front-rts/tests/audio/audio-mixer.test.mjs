import assert from 'node:assert/strict';
import test from 'node:test';

import { AUDIO_BUS_IDS, createAudioMixer } from '../../src/audio/audio-mixer.js';

class FakeParam {
  constructor(value = 1) { this.value = value; this.changes = []; }
  setValueAtTime(value, time) { this.value = value; this.changes.push({ value, time }); }
}

class FakeNode {
  constructor(kind) { this.kind = kind; this.connections = []; this.disconnects = 0; }
  connect(target) { this.connections.push(target); return target; }
  disconnect() { this.connections = []; this.disconnects += 1; }
}

class FakeGain extends FakeNode {
  constructor() { super('gain'); this.gain = new FakeParam(); }
}

class FakeSource extends FakeNode {
  constructor() {
    super('source');
    this.buffer = null;
    this.loop = false;
    this.playbackRate = new FakeParam();
    this.starts = [];
    this.stops = 0;
    this.onended = null;
  }
  start(...args) { this.starts.push(args); }
  stop() { this.stops += 1; }
  finish() { this.onended?.(); }
}

class FakeContext {
  constructor({ resumeError = null, decodeError = null } = {}) {
    this.state = 'suspended';
    this.currentTime = 12;
    this.destination = new FakeNode('destination');
    this.gains = [];
    this.sources = [];
    this.resumeError = resumeError;
    this.decodeError = decodeError;
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closeCalls = 0;
  }
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createBufferSource() { const node = new FakeSource(); this.sources.push(node); return node; }
  async resume() {
    this.resumeCalls += 1;
    if (this.resumeError) throw this.resumeError;
    this.state = 'running';
  }
  async suspend() { this.suspendCalls += 1; this.state = 'suspended'; }
  async close() { this.closeCalls += 1; this.state = 'closed'; }
  async decodeAudioData(data) {
    if (this.decodeError) throw this.decodeError;
    return { decodedBytes: data.byteLength };
  }
}

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  async dispatch(type) { await this.listeners.get(type)?.({ type }); }
}

const create = (options = {}) => {
  const context = options.context ?? new FakeContext();
  return { context, mixer: createAudioMixer({ contextFactory: () => context, ...options }) };
};

test('starts locked and fails closed when Web Audio is unavailable', async () => {
  const mixer = createAudioMixer({ contextFactory: () => null });
  assert.equal(mixer.snapshot().status, 'locked');
  assert.equal(await mixer.unlock(), false);
  const snapshot = mixer.snapshot();
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.available, false);
  assert.deepEqual(mixer.playBuffer({ buffer: {} }), { ok: false, reason: 'unavailable' });
  assert.equal(snapshot.diagnostics.at(-1).kind, 'unavailable');
});

test('unlock lazily creates master and five routed buses exactly once', async () => {
  const { context, mixer } = create({ maxVoices: 3 });
  assert.equal(context.gains.length, 0);
  assert.equal(await mixer.unlock(), true);
  assert.equal(await mixer.unlock(), true);
  assert.equal(context.resumeCalls, 1);
  assert.equal(context.gains.length, 1 + AUDIO_BUS_IDS.length + 3);
  const [master, ...busGains] = context.gains;
  assert.equal(master.connections[0], context.destination);
  for (const busGain of busGains.slice(0, AUDIO_BUS_IDS.length)) assert.equal(busGain.connections[0], master);
  assert.equal(mixer.snapshot().status, 'running');
});

test('master and bus volume/mute state updates authoritative gain nodes', async () => {
  const { context, mixer } = create();
  await mixer.unlock();
  const master = context.gains[0];
  const music = context.gains[1];
  assert.equal(mixer.setMasterVolume(0.4), 0.4);
  assert.equal(master.gain.value, 0.4);
  assert.equal(mixer.setBusVolume('music', 2), 1);
  assert.equal(music.gain.value, 1);
  mixer.setBusMuted('music', true);
  assert.equal(music.gain.value, 0);
  mixer.setBusMuted('music', false);
  assert.equal(music.gain.value, 1);
  mixer.setMasterMuted(true);
  assert.equal(master.gain.value, 0);
  assert.throws(() => mixer.setBusVolume('unknown', 1), /Unknown audio bus/);
});

test('user-gesture binding unlocks once and removes all listeners', async () => {
  const { context, mixer } = create();
  const target = new FakeTarget();
  const dispose = mixer.bindUnlock(target, { events: ['pointerdown', 'keydown'] });
  assert.deepEqual([...target.listeners.keys()].sort(), ['keydown', 'pointerdown']);
  await target.dispatch('pointerdown');
  assert.equal(context.resumeCalls, 1);
  assert.equal(target.listeners.size, 0);
  dispose();
});

test('bounded voice slots route buffers, reject overflow, and are reused after end', async () => {
  const { context, mixer } = create({ maxVoices: 2 });
  await mixer.unlock();
  const first = mixer.playBuffer({ buffer: { id: 'a' }, bus: 'sfx', volume: 0.5, tag: 'impact' });
  const second = mixer.playBuffer({ buffer: { id: 'b' }, bus: 'voice', playbackRate: 1.25 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(mixer.playBuffer({ buffer: { id: 'c' } }), { ok: false, reason: 'voice-limit' });
  assert.equal(context.sources[0].buffer.id, 'a');
  assert.equal(context.sources[0].playbackRate.value, 1);
  assert.deepEqual(context.sources[0].starts[0], [0, 0]);
  const firstSlot = mixer.snapshot().voices.find((voice) => voice.id === first.id).slot;
  context.sources[0].finish();
  assert.equal(mixer.snapshot().activeVoiceCount, 1);
  const third = mixer.playBuffer({ buffer: { id: 'c' }, duration: 2 });
  assert.equal(third.ok, true);
  assert.equal(mixer.snapshot().voices.find((voice) => voice.id === third.id).slot, firstSlot);
});

test('voice handles, filtered stopAll, and missing buffers are deterministic', async () => {
  const { context, mixer } = create({ maxVoices: 4 });
  await mixer.unlock();
  assert.deepEqual(mixer.playBuffer(), { ok: false, reason: 'missing-buffer' });
  const a = mixer.playBuffer({ buffer: {}, bus: 'music', tag: 'theme' });
  const b = mixer.playBuffer({ buffer: {}, bus: 'sfx', tag: 'battle' });
  const c = mixer.playBuffer({ buffer: {}, bus: 'sfx', tag: 'battle' });
  assert.equal(a.stop(), true);
  assert.equal(context.sources[0].stops, 1);
  assert.equal(mixer.stopAll({ bus: 'sfx', tag: 'battle' }), 2);
  assert.equal(mixer.snapshot().activeVoiceCount, 0);
  assert.equal(mixer.stopVoice(b.id), false);
  assert.ok(c.id.localeCompare(b.id) > 0);
});

test('pause suspends playback and resume restores the context', async () => {
  const { context, mixer } = create();
  await mixer.unlock();
  assert.equal(await mixer.pause(), true);
  assert.equal(context.suspendCalls, 1);
  assert.equal(mixer.snapshot().status, 'paused');
  assert.deepEqual(mixer.playBuffer({ buffer: {} }), { ok: false, reason: 'paused' });
  assert.equal(await mixer.resume(), true);
  assert.equal(context.resumeCalls, 2);
  assert.equal(mixer.playBuffer({ buffer: {} }).ok, true);
});

test('decode returns buffers or safe reason codes with diagnostics', async () => {
  const { mixer } = create();
  const decoded = await mixer.decodeAudioData(new ArrayBuffer(8));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.buffer.decodedBytes, 8);
  await assert.rejects(() => mixer.decodeAudioData('bad'), /ArrayBuffer/);

  const failing = create({ context: new FakeContext({ decodeError: new Error('bad codec') }) }).mixer;
  const failure = await failing.decodeAudioData(new ArrayBuffer(4));
  assert.deepEqual(failure, { ok: false, reason: 'decode-failed' });
  assert.match(failing.snapshot().diagnostics.at(-1).details.error, /bad codec/);
});

test('unlock and resume failures remain observable without throwing into gameplay', async () => {
  const { mixer } = create({ context: new FakeContext({ resumeError: new Error('blocked') }) });
  assert.equal(await mixer.unlock(), false);
  assert.equal(mixer.snapshot().status, 'failed');
  assert.match(mixer.snapshot().diagnostics.at(-1).details.error, /blocked/);
});

test('dispose stops voices, closes context, and rejects later mutation', async () => {
  const { context, mixer } = create();
  await mixer.unlock();
  mixer.playBuffer({ buffer: {} });
  await mixer.dispose();
  await mixer.dispose();
  assert.equal(context.closeCalls, 1);
  assert.equal(context.sources[0].stops, 1);
  assert.equal(mixer.snapshot().status, 'closed');
  assert.throws(() => mixer.setMasterVolume(0.5), /disposed/);
});
