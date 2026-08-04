import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptiveMusicDirector } from '../../src/audio/adaptive-music.js';

test('stable initial state starts playback and reconciles on every update', () => {
  const calls = [];
  const responses = [
    { ok: true, id: 'voice-1' },
    { ok: true, id: 'voice-1', reason: 'already-playing' },
    { ok: true, id: 'voice-2' },
  ];
  const director = createAdaptiveMusicDirector({
    runtime: {
      playState(state, request) {
        calls.push([state, request.tick]);
        return responses.shift();
      },
    },
    initialState: 'menu',
  });

  const initial = director.update({ stage: 'menu', tick: 0 });
  assert.equal(initial.ok, true);
  assert.equal(initial.changed, false);
  assert.equal(initial.reason, 'reconciled');

  const stable = director.update({ stage: 'menu', tick: 1 });
  assert.equal(stable.reason, 'stable');

  const recovered = director.update({ stage: 'menu', tick: 2 });
  assert.equal(recovered.reason, 'reconciled');
  assert.deepEqual(calls, [['menu', 0], ['menu', 1], ['menu', 2]]);
});

test('stable-state playback failure does not advance director state', () => {
  const director = createAdaptiveMusicDirector({
    runtime: { playState() { return { ok: false, reason: 'missing-buffer' }; } },
    initialState: 'briefing',
  });
  const result = director.update({ stage: 'briefing', tick: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-buffer');
  assert.equal(result.currentState, 'briefing');
  assert.equal(result.lastTick, 4);
});
