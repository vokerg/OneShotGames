import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPAIGN_MISSION_OUTCOMES,
  awardCampaignMedal,
  createCampaignProfile,
  recordCampaignMissionResult,
} from '../../src/core/campaign-profile.js';
import { createEndgameAnalyticsReport } from '../../src/ui/endgame-analytics.js';
import { createCampaignDebriefFromAnalytics } from '../../src/ui/endgame-report-adapter.js';

function reportFixture() {
  return createEndgameAnalyticsReport({
    operationId: 'operation-test',
    title: 'Operation Test',
    summary: 'A verified report handoff.',
    outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    completedTick: 900,
    combat: {
      friendly: [{ id: 'infantry', label: 'Infantry', deployed: 5, lost: 1, scoreValue: 40 }],
      enemy: [{ id: 'opposition', label: 'Opposition', deployed: 6, destroyed: 6, scoreValue: 600 }],
    },
    economy: { resources: {}, scoreValue: 100 },
    objectives: [{ id: 'main', title: 'Complete the mission', status: 'completed', resolvedTick: 850 }],
    medals: [{ id: 'mission-medal', title: 'Mission Medal', description: 'Completed the operation.', scoreBonus: 100 }],
    timeline: [{ id: 'mission-complete', tick: 850, kind: 'objective', title: 'Mission complete' }],
    campaignConsequences: {
      unlockedOperationIds: ['operation-next'],
      unlockedUpgradeIds: ['upgrade-next'],
      choices: { route: 'north' },
    },
  });
}

test('adapts analytics into the existing UFR-089 mission debrief contract', () => {
  const report = reportFixture();
  const debrief = createCampaignDebriefFromAnalytics(report, {
    nextOperations: [{
      operationId: 'operation-next',
      title: 'Operation Next',
      summary: 'Continue the campaign.',
      unlocked: true,
      recommended: true,
    }],
  });

  assert.equal(debrief.kind, 'mission-debrief');
  assert.equal(debrief.screenId, 'endgame');
  assert.equal(debrief.operationId, report.operationId);
  assert.equal(debrief.score, report.score.total);
  assert.deepEqual(debrief.losses.categories, [{ id: 'infantry', label: 'Infantry', lost: 1, deployed: 5 }]);
  assert.deepEqual(debrief.medals, [{
    id: 'mission-medal',
    title: 'Mission Medal',
    description: 'Completed the operation.',
    iconId: null,
  }]);
  assert.equal(debrief.actions.primary.id, 'continue-campaign');
  assert.deepEqual(debrief.campaignConsequences.unlockedOperationIds, ['operation-next']);
  assert.ok(Object.isFrozen(debrief));
});

test('records the analytics campaign-result handoff through the UFR-084 campaign profile API', () => {
  const report = reportFixture();
  let profile = createCampaignProfile({ initialOperationIds: ['operation-test'] });
  profile = awardCampaignMedal(profile, 'mission-medal');
  profile = recordCampaignMissionResult(profile, report.operationId, report.campaignResult);

  assert.deepEqual(profile.completedOperationIds, ['operation-test']);
  assert.equal(profile.missionResults['operation-test'].outcome, CAMPAIGN_MISSION_OUTCOMES.VICTORY);
  assert.equal(profile.missionResults['operation-test'].score, report.score.total);
  assert.equal(profile.missionResults['operation-test'].completedTick, 900);
  assert.deepEqual(profile.missionResults['operation-test'].medalIds, ['mission-medal']);
});

test('rejects non-report inputs and delegates next-operation validation to campaign flow', () => {
  assert.throws(() => createCampaignDebriefFromAnalytics({}), /current endgame analytics report/);
  assert.throws(() => createCampaignDebriefFromAnalytics(reportFixture(), {
    nextOperations: [
      { operationId: 'duplicate', title: 'One' },
      { operationId: 'duplicate', title: 'Two' },
    ],
  }), /duplicate operationId/);
});
