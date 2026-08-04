import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAdaptiveMusicState, createAdaptiveMusicDirector } from '../../src/audio/adaptive-music.js';

test('campaign withdrawal uses the restrained defeat score', () => {
  assert.equal(chooseAdaptiveMusicState({ stage: 'debrief', tick: 12, outcome: 'withdrawal' }, 'battle'), 'defeat');
});

test('withdrawal bypasses battlefield dwell like other mission outcomes', () => {
  const played = [];
  const director = createAdaptiveMusicDirector({
    runtime: {
      playState(state, request) {
        played.push([state, request.tick]);
        return { ok: true, id: state };
      },
    },
    initialState: 'battle',
    minDwellTicks: 120,
  });
  const result = director.update({ stage: 'debrief', tick: 1, outcome: 'withdrawal' });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.currentState, 'defeat');
  assert.deepEqual(played, [['defeat', 1]]);
});
