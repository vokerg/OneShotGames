import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CONSTRUCTION_POLICY,
  advanceConstruction,
  assignConstructionBuilder,
  cancelConstruction,
  constructionProgressFraction,
  createConstructionProgress,
  effectiveConstructionBuilders,
  reconcileConstructionBuilders,
  removeConstructionBuilder,
  setConstructionPaused,
} from '../../src/systems/construction-progress-system.js';

function state(builderIds = [3]) {
  return createConstructionProgress({
    buildingId: 20,
    buildTime: 10,
    cost: { metal: 100, fuel: 40 },
    builderIds,
  });
}

test('creates frozen normalized construction progress', () => {
  const progress = state([7, 3, 7]);
  assert.deepEqual(progress.builderIds, [3, 7]);
  assert.equal(progress.completedWork, 0);
  assert.equal(progress.completed, false);
  assert.equal(Object.isFrozen(progress), true);
});

test('applies deterministic diminishing returns for multiple builders', () => {
  assert.equal(effectiveConstructionBuilders(0), 0);
  assert.equal(effectiveConstructionBuilders(1), 1);
  assert.equal(effectiveConstructionBuilders(2), 1.7);
  assert.ok(Math.abs(effectiveConstructionBuilders(5) - 2.75) < 1e-12);
  const result = advanceConstruction(state([1, 2, 3]), 2);
  assert.equal(result.effectiveBuilders, 2.2);
  assert.equal(result.workApplied, 4.4);
  assert.equal(result.state.completedWork, 4.4);
});

test('completes exactly without work overshoot', () => {
  const first = advanceConstruction(state([1, 2]), 5).state;
  const result = advanceConstruction(first, 20);
  assert.equal(result.state.completedWork, 10);
  assert.equal(result.state.completed, true);
  assert.equal(result.completedNow, true);
  assert.equal(constructionProgressFraction(result.state), 1);
});

test('pause and resume preserve progress', () => {
  const started = advanceConstruction(state(), 3).state;
  const paused = setConstructionPaused(started, true);
  assert.equal(advanceConstruction(paused, 5).state.completedWork, 3);
  const resumed = setConstructionPaused(paused, false);
  assert.equal(advanceConstruction(resumed, 2).state.completedWork, 5);
});

test('assignment is stable and removal is idempotent', () => {
  const original = state([4]);
  const assigned = assignConstructionBuilder(original, 2);
  assert.deepEqual(assigned.builderIds, [2, 4]);
  assert.deepEqual(assignConstructionBuilder(assigned, 2), assigned);
  const removed = removeConstructionBuilder(assigned, 4);
  assert.deepEqual(removed.builderIds, [2]);
  assert.deepEqual(removeConstructionBuilder(removed, 4), removed);
});

test('reconciliation removes dead, non-worker, and unavailable builders', () => {
  const progress = state([1, 2, 3, 4]);
  const reconciled = reconcileConstructionBuilders(progress, [
    { id: 1, alive: true, worker: true, available: true },
    { id: 2, alive: false, worker: true, available: true },
    { id: 3, alive: true, worker: false, available: true },
    { id: 4, alive: true, worker: true, available: false },
  ]);
  assert.deepEqual(reconciled.builderIds, [1]);
});

test('cancellation refunds only uncompleted proportional work', () => {
  const halfway = advanceConstruction(state(), 5).state;
  const cancelled = cancelConstruction(halfway);
  assert.equal(cancelled.progress, 0.5);
  assert.deepEqual(cancelled.refund, { fuel: 15, metal: 37 });
  assert.equal(cancelled.state.cancelled, true);
  assert.deepEqual(cancelled.state.builderIds, []);
  assert.equal(advanceConstruction(cancelled.state, 10).workApplied, 0);
});

test('custom cancellation policy and invalid inputs are validated', () => {
  const progress = state();
  const cancelled = cancelConstruction(progress, {
    ...DEFAULT_CONSTRUCTION_POLICY,
    cancellationRefundRate: 1,
  });
  assert.deepEqual(cancelled.refund, { fuel: 40, metal: 100 });
  assert.throws(() => effectiveConstructionBuilders(-1), /non-negative integer/);
  assert.throws(() => advanceConstruction(progress, -1), /non-negative finite/);
  assert.throws(
    () => cancelConstruction(progress, { ...DEFAULT_CONSTRUCTION_POLICY, cancellationRefundRate: 1.1 }),
    /must not exceed 1/,
  );
  assert.throws(
    () => createConstructionProgress({ buildingId: 1, buildTime: 0 }),
    /positive finite/,
  );
});
