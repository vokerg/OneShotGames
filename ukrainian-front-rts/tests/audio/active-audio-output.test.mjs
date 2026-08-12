import assert from 'node:assert/strict';
import test from 'node:test';

import { installActiveAudioOutput } from '../../src/audio/active-audio-output.js';

function fakeMixer() {
  const state = { status: 'locked', contextState: 'suspended', starts: [] };
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
      return { ok: true, id, stop() {} };
    },
    snapshot() {
      return { status: state.status, contextState: state.contextState };
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

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

test('trusted interaction unlocks mixer and records real source starts across required families', async () => {
  const mixer = fakeMixer();
  const windowTarget = fakeWindow();
  const events = fakeEvents();
  const game = { mission: null, startCalls: 0, start() { this.startCalls += 1; } };
  const status = { textContent: '' };
  const documentTarget = { querySelector: () => status };
  const runtime = installActiveAudioOutput({ mixer, events, game, windowTarget, documentTarget });

  windowTarget.emit('pointerdown');
  await flush();
  assert.equal(mixer.state.status, 'running');
  assert.equal(runtime.snapshot().sourcesStarted.ui, 1);

  game.start();
  await flush();
  assert.equal(runtime.snapshot().sourcesStarted.voice, 1);
  assert.equal(runtime.snapshot().sourcesStarted.ambience, 1);
  assert.equal(runtime.snapshot().sourcesStarted.music, 1);

  events.emit('weapon.fire');
  await flush();
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.sourcesStarted.combat, 1);
  assert.deepEqual(snapshot.loadedFamilies, ['ambience', 'combat', 'music', 'ui', 'voice']);
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(mixer.state.starts.map((entry) => entry.bus), ['sfx', 'voice', 'ambience', 'music', 'sfx']);

  assert.equal(runtime.dispose(), true);
});

test('locked/no-output and decode failures surface actionable output diagnostics', async () => {
  const mixer = fakeMixer();
  mixer.unlock = async () => false;
  const windowTarget = fakeWindow();
  const status = { textContent: '' };
  const runtime = installActiveAudioOutput({
    mixer,
    windowTarget,
    documentTarget: { querySelector: () => status },
  });

  assert.match(status.textContent, /locked/i);
  assert.equal(await runtime.preload(), false);
  assert.equal(runtime.snapshot().status, 'error');
  assert.match(status.textContent, /error/i);
  runtime.dispose();
});
