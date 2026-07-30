import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVE_TYPES, evaluateObjective, evaluateObjectiveSet } from '../../src/systems/objective-library.js';

test('covers every required objective family', () => {
  assert.deepEqual(OBJECTIVE_TYPES, ['build', 'gather', 'capture', 'escort', 'defend', 'survive', 'destroy', 'disable', 'rescue', 'recon', 'extract']);
});

test('evaluates progress, timed failure, optional and hidden metadata', () => {
  assert.equal(evaluateObjective({ id: 'g', type: 'gather', resource: 'metal', target: 100 }, { resources: { metal: 50 } }).progress, 0.5);
  assert.equal(evaluateObjective({ id: 's', type: 'survive', duration: 10, timeLimit: 5 }, { elapsed: 6 }).status, 'failed');
  assert.equal(evaluateObjective({ id: 'r', type: 'rescue', targetId: 'c', optional: true, target: 2 }, { rescued: { c: 2 } }).status, 'completed');
});

test('aggregates required objectives only', () => {
  const result = evaluateObjectiveSet([{ id: 'a', type: 'build', contentId: 'x' }, { id: 'b', type: 'recon', regionId: 'r', optional: true }], { a: { built: { x: 1 } }, b: { failed: true } });
  assert.equal(result.completed, true);
  assert.equal(result.failed, false);
});
