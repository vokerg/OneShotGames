import assert from 'node:assert/strict';
import test from 'node:test';

import { smokeAccuracyMultiplier, smokeBlocksVision } from '../../src/core/smoke-policy.js';
import { resolveProjectileAim } from '../../src/combat/projectile-accuracy.js';
import {
  chooseSmokeDeployment,
  createSmokeState,
  deploySmoke,
  sampleSmokeDensity,
  sampleSmokeLineDensity,
  smokeCellsForVisibility,
  updateSmokeState,
} from '../../src/systems/smoke-system.js';
import { VISIBILITY_BLOCKERS, createVisibilityField, resolveLineOfSight } from '../../src/visibility/line-of-sight.js';

const point = (x, y) => ({ x: x * 32 + 16, y: y * 32 + 16 });

test('deploys renderer-neutral smoke state with stable ids', () => {
  const state = createSmokeState();
  const cloud = deploySmoke(state, { x: 100, y: 120, team: 0, sourceId: 9 });
  assert.equal(cloud.id, 'smoke-1');
  assert.equal(cloud.remaining, cloud.duration);
  assert.equal(cloud.team, 0);
  assert.equal(cloud.sourceId, 9);
  assert.equal(state.nextId, 2);
});

test('updates duration and deterministic drift before expiring clouds', () => {
  const state = createSmokeState();
  deploySmoke(state, { x: 10, y: 20, duration: 2, drift: { x: 4, y: -2 } });
  updateSmokeState(state, 0.5);
  assert.deepEqual(
    { x: state.clouds[0].x, y: state.clouds[0].y, remaining: state.clouds[0].remaining },
    { x: 12, y: 19, remaining: 1.5 },
  );
  updateSmokeState(state, 1.5);
  assert.equal(state.clouds.length, 0);
});

test('overlapping smoke stacks deterministically and clamps density', () => {
  const state = createSmokeState();
  deploySmoke(state, { x: 50, y: 50, radius: 100, density: 0.7 });
  deploySmoke(state, { x: 50, y: 50, radius: 100, density: 0.6 });
  assert.equal(sampleSmokeDensity(state, { x: 50, y: 50 }), 1);
  assert.equal(sampleSmokeLineDensity(state, { x: 0, y: 50 }, { x: 100, y: 50 }), 1);
});

test('smoke cells use the same density threshold as line of sight', () => {
  const state = createSmokeState();
  deploySmoke(state, { x: point(2, 0).x, y: point(2, 0).y, radius: 28, density: 0.8 });
  const smoke = smokeCellsForVisibility(state, { width: 5, height: 1 });
  const field = createVisibilityField({ width: 5, height: 1, smoke });
  const result = resolveLineOfSight(field, point(0, 0), point(4, 0));
  assert.equal(result.reason, VISIBILITY_BLOCKERS.SMOKE);
  assert.ok(smokeBlocksVision(result.smokeDensity));
});

test('the same smoke density reduces deterministic projectile accuracy', () => {
  const target = { x: 100, y: 100 };
  const clear = resolveProjectileAim({ seed: 6, target, kind: 'bullet' });
  const smoked = resolveProjectileAim({ seed: 6, target, kind: 'bullet', smokeDensity: 1 });
  assert.equal(smoked.adjustedAccuracy, clear.adjustedAccuracy * smokeAccuracyMultiplier(1));
  assert.notEqual(clear.hit, smoked.hit);
});

test('AI deployment scoring protects friendlies without duplicating smoke', () => {
  const candidates = [{ x: 50, y: 0, radius: 30 }, { x: 100, y: 100, radius: 30 }];
  const context = {
    friendlies: [{ x: 100, y: 0 }],
    threats: [{ x: 0, y: 0 }],
    clouds: [],
  };
  assert.deepEqual(chooseSmokeDeployment(candidates, context).candidate, candidates[0]);
  const state = createSmokeState();
  deploySmoke(state, { x: 50, y: 0, radius: 40, density: 1 });
  assert.deepEqual(chooseSmokeDeployment(candidates, { ...context, clouds: state.clouds }).candidate, candidates[1]);
});
