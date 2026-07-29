import assert from 'node:assert/strict';
import test from 'node:test';

import { clamp, distance, randomBetween } from '../../src/core/math.js';
import { setSimulationSeed } from '../../src/core/random.js';

test('clamp keeps values inside inclusive bounds', () => {
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(6, 0, 10), 6);
  assert.equal(clamp(14, 0, 10), 10);
});

test('distance returns Euclidean distance without mutating points', () => {
  const left = { x: -1, y: 2 };
  const right = { x: 2, y: 6 };
  assert.equal(distance(left, right), 5);
  assert.deepEqual(left, { x: -1, y: 2 });
  assert.deepEqual(right, { x: 2, y: 6 });
});

test('randomBetween uses the seeded simulation stream and respects bounds', () => {
  setSimulationSeed('math-test');
  const first = [randomBetween(-5, 5), randomBetween(10, 20)];
  setSimulationSeed('math-test');
  const repeated = [randomBetween(-5, 5), randomBetween(10, 20)];

  assert.deepEqual(repeated, first);
  assert.ok(first[0] >= -5 && first[0] < 5);
  assert.ok(first[1] >= 10 && first[1] < 20);
});
