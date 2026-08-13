import assert from 'node:assert/strict';
import test from 'node:test';

import { installActiveAudioOutput } from '../../src/audio/active-audio-output.js';

function fakeMixer() {
  const state = { status: 'locked', contextState: 'suspended', starts: [], voices: [] };
  return {
    state,
    async unlock() {
      state.status = 'running';
      state.contextState = 'running';
      return true;
    },
    async decodeAudioData(data) {
      assert.ok(data instanceof ArrayBuffer);
      return { ok: true, buffer: { decoded: true } };
    },
    playBuffer(options) {
      state.starts.push(options);
      const id = `voice-${state.starts.length}`;
      state.voices.push({ id, tag: options.tag ?? null });
      return { ok: true, id, stop() { state.voices = state.voices.filter((voice) => voice.id !== id); } };
    },
    stopAll() { return 0; },
    async pause() { return true; },
    async resume() { return true; },
    snapshot() {
      return {
        status: state.status,
        contextState: state.contextState,
        maxVoices: 32,
        activeVoiceCount: state.voices.length,
        voices: [...state.voices],
      };
    },
  };
}

function fakeWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener({ type });
    },
  };
}

function fakeEvents() {
  let subscriber = null;
  return {
    subscribe(_type, callback) {
      subscriber = callback;
      return () => { subscriber = null; };
    },
    emit(cue) {
      subscriber?.({ tick: 1, sequence: 1, payload: { cue } });
    },
  };
}

function fakeFactories() {
  const runtime = (family, cue, bus) => async ({ mixer }) => ({
    catalog: { byCue: { [cue]: { id: cue } } },
    async preload() { return { loaded: true }; },
    play(requestedCue) {
      if (requestedCue !== cue) return { ok: false, reason: 'unknown-cue' };
      return mixer.playBuffer({ buffer: { family }, bus, tag: `${family}-${cue}` });
    },
    snapshot() { return { family, loaded: true }; },
  });
  return {
    ui: runtime('ui', 'menu.confirm', 'sfx'),
    combat: runtime('combat', 'weapon.rifle', 'sfx'),
    music: async ({ mixer }) => ({
      async preload() { return { loaded: true }; },
      playState(state) { return mixer.playBuffer({ buffer: { family: 'music' }, bus: 'music', loop: true, tag: `music-${state}` }); },
      snapshot() { return { family: 'music', loaded: true }; },
      dispose() {},
    }),
    ambience: () => ({ samples: new Float32Array([0, 0.1, -0.1, 0]) }),
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

test('trusted interaction unlocks mixer and authored runtimes start every required source family', async () => {
  const mixer = fakeMixer();
  const windowTarget = fakeWindow();
  const events = fakeEvents();
  const game = { mission: null, startCalls: 0, start() { this.startCalls += 1; } };
  const status = { textContent: '' };
  const runtime = installActiveAudioOutput({
    mixer,
    events,
    game,
    windowTarget,
    documentTarget: { querySelector: () => status },
    factories: fakeFactories(),
  });

  windowTarget.emit('pointerdown');
  await flush();
  assert.equal(mixer.state.status, 'running');
  assert.equal(runtime.snapshot().sourcesStarted.ui, 1);

  game.start();
  await flush();
  assert.equal(runtime.snapshot().sourcesStarted.ambience, 1);
  assert.equal(runtime.snapshot().sourcesStarted.music, 1);

  events.emit('weapon.rifle');
  await flush();
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.sourcesStarted.combat, 1);
  assert.deepEqual(snapshot.requiredFamilies, ['ui', 'combat', 'ambience', 'music']);
  assert.equal(snapshot.voiceMode, 'hook-only');
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(mixer.state.starts.map((entry) => entry.bus), ['sfx', 'ambience', 'music', 'sfx']);
  assert.match(status.textContent, /UI, combat, ambience, and music/i);

  assert.equal(runtime.dispose(), true);
});

test('locked and unlock-failure states expose actionable output diagnostics', async () => {
  const mixer = fakeMixer();
  mixer.unlock = async () => false;
  const windowTarget = fakeWindow();
  const status = { textContent: '' };
  const runtime = installActiveAudioOutput({
    mixer,
    windowTarget,
    documentTarget: { querySelector: () => status },
    factories: fakeFactories(),
  });

  assert.match(status.textContent, /locked/i);
  assert.equal(await runtime.activate(), false);
  assert.equal(runtime.snapshot().status, 'error');
  assert.match(status.textContent, /error/i);
  runtime.dispose();
});
