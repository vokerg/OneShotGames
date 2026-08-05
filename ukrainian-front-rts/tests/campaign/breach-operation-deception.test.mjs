import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BREACH_OPERATION_SCRIPT_SOURCE,
} from '../../src/content/campaign/breach-operation.js';

test('western deception diverts the reserve into the decoy axis', () => {
  const trigger = BREACH_OPERATION_SCRIPT_SOURCE.triggers
    .find((candidate) => candidate.id === 'decoy-axis-entered');
  const reinforcement = trigger.actions
    .find((action) => action.kind === 'reinforcement');
  const reserve = reinforcement.entities[0];
  const decoyAxis = BREACH_OPERATION_SCRIPT_SOURCE.regions
    .find((region) => region.id === 'decoy-axis');
  const breachLane = BREACH_OPERATION_SCRIPT_SOURCE.regions
    .find((region) => region.id === 'breach-lane');

  assert.equal(reserve.regionId, 'decoy-axis');
  assert.equal(reserve.tag, 'diverted-reserve');
  assert.equal(reserve.count, 2);
  assert.ok(decoyAxis.x < breachLane.x);
  assert.ok(decoyAxis.x + decoyAxis.width <= breachLane.x + breachLane.width / 2);
});
