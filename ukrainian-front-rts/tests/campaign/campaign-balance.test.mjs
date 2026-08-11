import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_DIFFICULTIES } from '../../src/core/campaign-profile.js';
import { CAMPAIGN_OPERATION_SEQUENCE } from '../../src/content/campaign/campaign-operation-registry.js';
import {
  CAMPAIGN_DIFFICULTY_BALANCE,
  applyCampaignBalance,
  buildCampaignPlaytestMatrix,
  resolveCampaignBalance,
} from '../../src/content/campaign/campaign-balance.js';

test('campaign balance covers all supported difficulties without combat stat cheats', () => {
  assert.deepEqual(Object.keys(CAMPAIGN_DIFFICULTY_BALANCE).sort(), Object.values(CAMPAIGN_DIFFICULTIES).sort());
  for (const profile of Object.values(CAMPAIGN_DIFFICULTY_BALANCE)) assert.equal(profile.combatStatMultiplier, 1);
});

test('story standard veteran curves remain monotonic across all nine operations', () => {
  const matrix = buildCampaignPlaytestMatrix(CAMPAIGN_OPERATION_SEQUENCE);
  assert.equal(matrix.length, 27);
  for (let operationIndex = 0; operationIndex < 9; operationIndex += 1) {
    const story = resolveCampaignBalance(CAMPAIGN_DIFFICULTIES.STORY, operationIndex);
    const standard = resolveCampaignBalance(CAMPAIGN_DIFFICULTIES.STANDARD, operationIndex);
    const veteran = resolveCampaignBalance(CAMPAIGN_DIFFICULTIES.VETERAN, operationIndex);
    assert.ok(story.resourceMultiplier > standard.resourceMultiplier);
    assert.ok(standard.resourceMultiplier > veteran.resourceMultiplier);
    assert.ok(story.pressureDelayMultiplier > standard.pressureDelayMultiplier);
    assert.ok(standard.pressureDelayMultiplier > veteran.pressureDelayMultiplier);
    assert.ok(story.reinforcementDelayMultiplier > standard.reinforcementDelayMultiplier);
    assert.ok(standard.reinforcementDelayMultiplier > veteran.reinforcementDelayMultiplier);
    assert.ok(story.objectiveTimerMultiplier > standard.objectiveTimerMultiplier);
    assert.ok(standard.objectiveTimerMultiplier > veteran.objectiveTimerMultiplier);
    assert.ok(story.recoveryWindowSeconds > standard.recoveryWindowSeconds);
    assert.ok(standard.recoveryWindowSeconds > veteran.recoveryWindowSeconds);
  }
});

test('balance transformation tunes resources and authored timing while preserving operation identity', () => {
  const fixture = {
    id: 'fixture-operation',
    map: { metadata: { economyOnboarding: { startingResources: { metal: 100, fuel: 50, intel: 20 } } } },
    mission: {
      id: 'fixture-operation',
      objectiveIds: ['hold'],
      start: { metal: 100, fuel: 50, intel: 20 },
      authoredAi: { phases: [{ id: 'wave-1', afterSeconds: 100 }] },
      objectiveDefinitions: [{ id: 'hold', timeLimitSeconds: 200 }],
      checkpointLabels: [{ id: 'checkpoint', afterSeconds: 120 }],
    },
    briefing: { title: 'Fixture' },
  };
  const story = applyCampaignBalance(fixture, CAMPAIGN_DIFFICULTIES.STORY, 0);
  const veteran = applyCampaignBalance(fixture, CAMPAIGN_DIFFICULTIES.VETERAN, 0);
  assert.equal(story.id, fixture.id);
  assert.deepEqual(story.mission.objectiveIds, fixture.mission.objectiveIds);
  assert.ok(story.mission.start.metal > veteran.mission.start.metal);
  assert.ok(story.mission.authoredAi.phases[0].afterSeconds > veteran.mission.authoredAi.phases[0].afterSeconds);
  assert.ok(story.mission.objectiveDefinitions[0].timeLimitSeconds > veteran.mission.objectiveDefinitions[0].timeLimitSeconds);
  assert.ok(story.mission.checkpointLabels[0].afterSeconds < veteran.mission.checkpointLabels[0].afterSeconds);
  assert.equal(story.mission.balance.combatStatMultiplier, 1);
  assert.equal(veteran.mission.balance.combatStatMultiplier, 1);
});

test('every authored campaign operation can be transformed deterministically', () => {
  for (const [operationIndex, operation] of CAMPAIGN_OPERATION_SEQUENCE.entries()) {
    for (const difficulty of Object.values(CAMPAIGN_DIFFICULTIES)) {
      const first = applyCampaignBalance(operation, difficulty, operationIndex);
      const second = applyCampaignBalance(operation, difficulty, operationIndex);
      assert.deepEqual(first, second, `${operation.id}/${difficulty}`);
      assert.equal(first.id, operation.id);
      assert.equal(first.mission?.id ?? operation.id, operation.mission?.id ?? operation.id);
      assert.equal(first.briefing?.difficulty, difficulty);
    }
  }
});
