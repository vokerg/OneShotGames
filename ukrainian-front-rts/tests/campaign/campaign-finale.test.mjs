import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_MISSION_OUTCOMES,
  createCampaignProfile,
  recordCampaignMissionResult,
  setCampaignChoice,
  setCampaignDifficulty,
  unlockCampaignOperation,
  unlockCampaignUpgrade,
} from '../../src/core/campaign-profile.js';
import {
  CAMPAIGN_OPERATION_IDS,
  CAMPAIGN_OPERATION_SEQUENCE,
  getNextCampaignOperation,
} from '../../src/content/campaign/campaign-operation-registry.js';
import {
  CAMPAIGN_FINALE_OPERATION_ID,
  CAMPAIGN_FINALE_ROSTER,
  createFinaleMission,
  resolveFinaleCampaignCallbacks,
} from '../../src/content/campaign/finale-operation.js';
import {
  CAMPAIGN_PROGRESSION_STAGES,
  createCampaignProgressionRuntime,
  installCampaignProgressionRuntime,
} from '../../src/app/campaign-progression-runtime.js';

function completedProfile({ difficulty = CAMPAIGN_DIFFICULTIES.STANDARD, score = 82 } = {}) {
  let profile = createCampaignProfile({ difficulty, initialOperationIds: [CAMPAIGN_OPERATION_IDS[0]] });
  for (const operationId of CAMPAIGN_OPERATION_IDS.slice(0, -1)) {
    profile = unlockCampaignOperation(profile, operationId);
    profile = recordCampaignMissionResult(profile, operationId, {
      outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
      score,
      completedTick: 600,
      medalIds: [`medal-${operationId}`],
    });
  }
  profile = unlockCampaignOperation(profile, CAMPAIGN_FINALE_OPERATION_ID);
  return profile;
}

test('campaign registry closes the authored sequence with one finale', () => {
  assert.equal(CAMPAIGN_OPERATION_SEQUENCE.length, 9);
  assert.equal(CAMPAIGN_OPERATION_IDS.at(-1), CAMPAIGN_FINALE_OPERATION_ID);
  assert.equal(new Set(CAMPAIGN_OPERATION_IDS).size, CAMPAIGN_OPERATION_IDS.length);
  assert.equal(getNextCampaignOperation(CAMPAIGN_OPERATION_IDS.at(-2)).id, CAMPAIGN_FINALE_OPERATION_ID);
  assert.equal(getNextCampaignOperation(CAMPAIGN_FINALE_OPERATION_ID), null);
});

test('finale uses every runtime roster family for both factions', () => {
  const mission = createFinaleMission(completedProfile());
  assert.equal(mission.composition.fullRosterRequired, true);
  assert.deepEqual(mission.composition.player.map((entry) => entry.type), CAMPAIGN_FINALE_ROSTER.ua);
  assert.deepEqual(mission.composition.enemy.map((entry) => entry.type), CAMPAIGN_FINALE_ROSTER.ru);
  assert.equal(new Set(mission.objectiveDefinitions.flatMap((objective) => objective.requiredRoster)).size >= 8, true);
  assert.equal(mission.authoredAi.phases.length, 4);
});

test('prior choices and campaign performance deterministically alter finale callbacks', () => {
  let veteran = completedProfile({ difficulty: CAMPAIGN_DIFFICULTIES.VETERAN, score: 96 });
  veteran = setCampaignChoice(veteran, 'operation-ember-line.salvage', 'recovered');
  veteran = setCampaignChoice(veteran, 'operation-iron-horizon.reserve-axis', 'north');
  veteran = unlockCampaignUpgrade(veteran, 'thermal');
  veteran = unlockCampaignUpgrade(veteran, 'digitalC2');
  veteran = unlockCampaignUpgrade(veteran, 'natoAmmo');
  const veteranCallbacks = resolveFinaleCampaignCallbacks(veteran);

  let story = completedProfile({ difficulty: CAMPAIGN_DIFFICULTIES.STORY, score: 50 });
  story = setCampaignDifficulty(story, CAMPAIGN_DIFFICULTIES.STORY);
  story = setCampaignChoice(story, 'operation-ember-line.salvage', 'scuttled');
  story = setCampaignChoice(story, 'operation-iron-horizon.reserve-axis', 'south');
  const storyCallbacks = resolveFinaleCampaignCallbacks(story);

  assert.equal(veteranCallbacks.reserveAxis, 'north');
  assert.equal(veteranCallbacks.logisticsState, 'reinforced');
  assert.equal(veteranCallbacks.modernizationDepth, 3);
  assert.equal(storyCallbacks.reserveAxis, 'south');
  assert.equal(storyCallbacks.logisticsState, 'standard');
  assert.ok(veteranCallbacks.pressureMultiplier > storyCallbacks.pressureMultiplier);
  assert.deepEqual(resolveFinaleCampaignCallbacks(veteran), veteranCallbacks);
});

test('progression unlocks operations in order and a victorious finale transitions to credits', () => {
  const runtime = createCampaignProgressionRuntime();
  for (const [index, operationId] of CAMPAIGN_OPERATION_IDS.entries()) {
    const before = runtime.snapshot();
    assert.equal(before.operations.find((operation) => operation.id === operationId).unlocked, true);
    const operation = runtime.beginOperation(operationId);
    assert.equal(operation.id, operationId);
    runtime.enterBattlefield();
    const debrief = runtime.recordResult(operationId, {
      outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
      score: 85 + index,
      completedTick: 500 + index,
      medalIds: [],
      losses: { totalLost: 2, totalDeployed: 8 },
    });
    if (operationId === CAMPAIGN_FINALE_OPERATION_ID) {
      assert.equal(debrief.creditsTransition.available, true);
      assert.equal(runtime.snapshot().stage, CAMPAIGN_PROGRESSION_STAGES.CREDITS_READY);
    } else {
      assert.equal(runtime.snapshot().stage, CAMPAIGN_PROGRESSION_STAGES.DEBRIEF);
      runtime.returnToOperations();
      assert.equal(runtime.snapshot().operations[index + 1].unlocked, true);
    }
  }
  const credits = runtime.showCredits();
  assert.equal(credits.stage, CAMPAIGN_PROGRESSION_STAGES.CREDITS);
  assert.equal(credits.operationId, CAMPAIGN_FINALE_OPERATION_ID);
  assert.equal(runtime.snapshot().profile.completedOperationIds.length, CAMPAIGN_OPERATION_IDS.length);
});

test('browser installer publishes campaign progression and keeps game profile synchronized', () => {
  const game = {};
  const windowTarget = {};
  const installation = installCampaignProgressionRuntime({ game, windowTarget });
  assert.equal(game.campaignRuntime, installation.runtime);
  assert.equal(typeof windowTarget.__fieldsOfResolveCampaign.snapshot, 'function');
  assert.equal(game.campaignProfile.unlockedOperationIds[0], CAMPAIGN_OPERATION_IDS[0]);
  assert.equal(windowTarget.__fieldsOfResolveCampaign.snapshot().operations.length, 9);
  installation.dispose();
  assert.equal('campaignRuntime' in game, false);
  assert.equal('__fieldsOfResolveCampaign' in windowTarget, false);
});