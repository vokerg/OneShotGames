import assert from 'node:assert/strict';
import test from 'node:test';

import { runCampaignAlphaGate } from '../../scripts/lib/campaign-alpha-gate.mjs';

test('campaign alpha gate completes every operation on every difficulty with saves, checkpoints, and credits', () => {
  const report = runCampaignAlphaGate();
  assert.equal(report.status, 'alpha-ready');
  assert.deepEqual(report.difficulties.sort(), ['standard', 'story', 'veteran']);
  assert.equal(report.operationRuns, 27);
  assert.equal(report.checkpointCaptures, 27);
  assert.equal(report.checkpointSaveRestores, 27);
  assert.equal(report.creditsTransitions, 3);
  assert.equal(report.contentAuditViolations, 0);
  assert.deepEqual(report.blockers, []);
  for (const run of report.runs) {
    assert.equal(run.operationsCompleted, 9);
    assert.equal(run.checkpointCaptures, 9);
    assert.equal(run.saveRestores, 9);
    assert.equal(run.finalStage, 'credits');
    assert.equal(run.firstBalance.combatStatMultiplier, 1);
  }
});
