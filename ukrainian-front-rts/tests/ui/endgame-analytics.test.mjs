import test from 'node:test';
import assert from 'node:assert/strict';

import { CAMPAIGN_MISSION_OUTCOMES } from '../../src/core/campaign-profile.js';
import {
  DEFAULT_ENDGAME_SCORE_POLICY,
  ENDGAME_ACTION_IDS,
  ENDGAME_OBJECTIVE_STATUSES,
  createCampaignResultHandoff,
  createEndgameAnalyticsReport,
} from '../../src/ui/endgame-analytics.js';

function completeVictory(overrides = {}) {
  return createEndgameAnalyticsReport({
    operationId: 'operation-ember-crossing',
    title: 'Operation Ember Crossing',
    summary: 'The crossing is secure and the reserve remains intact.',
    outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    completedTick: 1800,
    ticksPerSecond: 20,
    parTick: 2400,
    combat: {
      friendly: [
        { id: 'armor', label: 'Armored vehicles', deployed: 4, lost: 1, scoreValue: 100 },
        { id: 'infantry', label: 'Infantry squads', deployed: 6, lost: 1, scoreValue: 50 },
      ],
      enemy: [
        { id: 'armor', label: 'Enemy armor', deployed: 5, destroyed: 4, captured: 0, escaped: 1, scoreValue: 700 },
        { id: 'infantry', label: 'Enemy infantry', deployed: 7, destroyed: 6, captured: 1, escaped: 0, scoreValue: 500 },
      ],
      damageDealt: 4100,
      damageTaken: 1650,
      healingDone: 320,
      repairDone: 480,
    },
    economy: {
      resources: {
        metal: { starting: 200, gathered: 900, salvaged: 100, spent: 850, remaining: 300, lost: 50 },
        fuel: { starting: 80, gathered: 300, salvaged: 20, spent: 300, remaining: 90, lost: 10 },
        intel: { starting: 20, gathered: 180, salvaged: 0, spent: 140, remaining: 60, lost: 0 },
      },
      unitsProduced: 12,
      structuresBuilt: 4,
      peakWorkers: 7,
      peakCommandUsed: 34,
      peakCommandCapacity: 40,
      scoreValue: 300,
    },
    technology: [
      { id: 'thermal', label: 'Thermal Fire-Control Sights', completedTick: 700, cost: { metal: 110, intel: 65 } },
      { id: 'digital-c2', label: 'Digital Battle Management', completedTick: 1200, cost: { metal: 180, intel: 120 } },
    ],
    objectives: [
      { id: 'secure-crossing', title: 'Secure the crossing', status: ENDGAME_OBJECTIVE_STATUSES.COMPLETED, resolvedTick: 1500 },
      { id: 'hold-reserve', title: 'Preserve the reserve', status: ENDGAME_OBJECTIVE_STATUSES.COMPLETED, resolvedTick: 1700 },
      { id: 'recover-convoy', title: 'Recover the convoy', optional: true, status: ENDGAME_OBJECTIVE_STATUSES.COMPLETED, resolvedTick: 1300 },
    ],
    medals: [{ id: 'steel-bridge', title: 'Steel Bridge', description: 'Held the crossing.', iconId: 'medal.steel-bridge', scoreBonus: 250 }],
    penalties: [{ id: 'damaged-civic-site', label: 'Protected site damaged', points: 50 }],
    timeline: [
      { id: 'first-contact', tick: 300, kind: 'combat', title: 'First contact' },
      { id: 'convoy-secured', tick: 1300, kind: 'objective', title: 'Convoy secured' },
      { id: 'crossing-secured', tick: 1500, kind: 'objective', title: 'Crossing secured' },
    ],
    actions: {
      canContinue: true,
      nextOperationId: 'operation-shelterbelt',
      canRetry: true,
      canSaveGame: true,
      saveId: 'save-slot-2',
      canViewReplay: true,
      canSaveReplay: true,
      replayId: 'replay-ember-crossing-1',
    },
    campaignConsequences: {
      unlockedOperationIds: ['operation-shelterbelt'],
      unlockedUpgradeIds: ['digital-c2'],
      choices: { reservePreserved: true },
      modifiers: [{ id: 'reserve-ready', label: 'Reserve ready', value: { strength: 2 } }],
      persistentLosses: [{ id: 'armor', label: 'Armored vehicles', count: 1 }],
    },
    metadata: { seed: 42, difficulty: 'standard' },
    ...overrides,
  });
}

test('builds a detailed deterministic victory report and campaign result handoff', () => {
  const report = completeVictory();

  assert.equal(report.kind, 'endgame-analytics-report');
  assert.equal(report.duration.clock, '1:30');
  assert.deepEqual(report.combat.friendlyTotals, { deployed: 10, lost: 2, survived: 8, lossValue: 150 });
  assert.deepEqual(report.combat.enemyTotals, {
    deployed: 12, destroyed: 10, captured: 1, escaped: 1, remaining: 0, destroyedValue: 1200,
  });
  assert.deepEqual(report.economy.totals, {
    starting: 300, gathered: 1380, salvaged: 120, spent: 1290, remaining: 450, lost: 60,
  });
  assert.deepEqual(report.technology.totalCost, { intel: 185, metal: 290 });
  assert.deepEqual(report.objectives.summary, {
    total: 3, required: 2, optional: 1, requiredCompleted: 2, optionalCompleted: 1,
    completed: 3, failed: 0, incomplete: 0,
  });
  assert.equal(report.score.timeBonus, 375);
  assert.equal(report.score.rawTotal, 8425);
  assert.equal(report.score.total, 8425);
  assert.equal(report.actions.primary.id, ENDGAME_ACTION_IDS.CONTINUE_CAMPAIGN);
  assert.deepEqual(report.actions.primary.payload, { operationId: 'operation-shelterbelt' });
  assert.equal(report.actions.all.find((entry) => entry.id === ENDGAME_ACTION_IDS.SAVE_GAME).enabled, true);
  assert.equal(report.actions.all.find((entry) => entry.id === ENDGAME_ACTION_IDS.VIEW_REPLAY).enabled, true);
  assert.deepEqual(report.campaignConsequences.awardedMedalIds, ['steel-bridge']);
  assert.deepEqual(report.campaignResult, {
    outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    score: 8425,
    attempts: 1,
    completedTick: 1800,
    medalIds: ['steel-bridge'],
  });
  assert.deepEqual(createCampaignResultHandoff(report), report.campaignResult);
});

test('clamps a negative defeat score and exposes disabled save/replay actions with reasons', () => {
  const report = createEndgameAnalyticsReport({
    operationId: 'operation-failed-line',
    title: 'Operation Failed Line',
    outcome: CAMPAIGN_MISSION_OUTCOMES.DEFEAT,
    completedTick: 600,
    combat: {
      friendly: [{ id: 'force', label: 'Task force', deployed: 5, lost: 5, scoreValue: 900 }],
      enemy: [{ id: 'enemy', label: 'Enemy group', deployed: 4, destroyed: 0, escaped: 4, scoreValue: 0 }],
    },
    economy: { resources: {}, scoreValue: 0 },
    objectives: [{ id: 'hold', title: 'Hold the line', status: ENDGAME_OBJECTIVE_STATUSES.FAILED, resolvedTick: 600 }],
    penalties: [{ id: 'command-loss', label: 'Command post lost', points: 300 }],
    actions: { canRetry: false },
  });

  assert.equal(report.score.rawTotal, -1200);
  assert.equal(report.score.total, 0);
  assert.equal(report.actions.primary.id, ENDGAME_ACTION_IDS.RETURN_TO_OPERATIONS);
  for (const id of [ENDGAME_ACTION_IDS.RETRY_MISSION, ENDGAME_ACTION_IDS.SAVE_GAME, ENDGAME_ACTION_IDS.VIEW_REPLAY, ENDGAME_ACTION_IDS.SAVE_REPLAY]) {
    const action = report.actions.all.find((entry) => entry.id === id);
    assert.equal(action.enabled, false);
    assert.ok(action.disabledReason);
  }
});

test('supports a versioned score policy without mutating the default policy', () => {
  const customPolicy = {
    outcome: { victory: 100, withdrawal: 20, defeat: 0 },
    requiredObjective: 10,
    optionalObjective: 5,
    technology: 3,
    timeBonusCap: 40,
  };
  const report = completeVictory({
    scorePolicy: customPolicy,
    combat: { friendly: [], enemy: [] },
    economy: { resources: {}, scoreValue: 0 },
    technology: [{ id: 'thermal', label: 'Thermal', completedTick: 1, cost: {} }],
    objectives: [{ id: 'required', title: 'Required', status: 'completed', resolvedTick: 2 }],
    medals: [],
    penalties: [],
    completedTick: 50,
    parTick: 100,
  });

  assert.equal(report.score.total, 133);
  assert.equal(DEFAULT_ENDGAME_SCORE_POLICY.outcome.victory, 4000);
  assert.ok(Object.isFrozen(report.score.policy));
});

test('canonicalizes identifiers and deeply freezes mutable input data', () => {
  const choices = { zeta: [2, 1], alpha: { enabled: true } };
  const report = completeVictory({
    medals: [
      { id: 'z-medal', title: 'Z Medal' },
      { id: 'a-medal', title: 'A Medal' },
    ],
    campaignConsequences: {
      awardedMedalIds: ['extra-medal'],
      unlockedOperationIds: ['operation-z', 'operation-a', 'operation-z'],
      unlockedUpgradeIds: ['upgrade-b', 'upgrade-a'],
      choices,
    },
  });

  choices.alpha.enabled = false;
  choices.zeta.push(3);
  assert.deepEqual(report.medals.ids, ['a-medal', 'z-medal']);
  assert.deepEqual(report.campaignConsequences.awardedMedalIds, ['a-medal', 'extra-medal', 'z-medal']);
  assert.deepEqual(report.campaignConsequences.unlockedOperationIds, ['operation-a', 'operation-z']);
  assert.deepEqual(report.campaignConsequences.choices, { alpha: { enabled: true }, zeta: [2, 1] });
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.campaignConsequences.choices.alpha));
  assert.throws(() => { report.score.total = 1; }, TypeError);
});

test('rejects resource conservation errors and over-accounted force categories', () => {
  assert.throws(() => completeVictory({
    economy: { resources: { metal: { starting: 10, spent: 4, remaining: 5 } } },
  }), /not conserved/);

  assert.throws(() => completeVictory({
    combat: { friendly: [{ id: 'force', label: 'Force', deployed: 2, lost: 3 }] },
  }), /more entities than deployed/);

  assert.throws(() => completeVictory({
    combat: { enemy: [{ id: 'enemy', label: 'Enemy', deployed: 2, destroyed: 1, captured: 1, escaped: 1 }] },
  }), /more entities than deployed/);
});

test('rejects duplicate identities, unordered timelines, and unresolved resolved objectives', () => {
  assert.throws(() => completeVictory({
    medals: [{ id: 'same', title: 'One' }, { id: 'same', title: 'Two' }],
  }), /duplicate id/);

  assert.throws(() => completeVictory({
    timeline: [
      { id: 'later', tick: 20, kind: 'system', title: 'Later' },
      { id: 'earlier', tick: 10, kind: 'system', title: 'Earlier' },
    ],
  }), /ordered by tick/);

  assert.throws(() => completeVictory({
    objectives: [{ id: 'objective', title: 'Objective', status: ENDGAME_OBJECTIVE_STATUSES.COMPLETED }],
  }), /requires resolvedTick/);
});

test('rejects unsupported outcomes, invalid score policies, and circular metadata', () => {
  assert.throws(() => completeVictory({ outcome: 'stalemate' }), /Unknown mission outcome/);
  assert.throws(() => completeVictory({
    scorePolicy: {
      outcome: { victory: 1, withdrawal: 1, defeat: -1 },
      requiredObjective: 1,
      optionalObjective: 1,
      technology: 1,
      timeBonusCap: 1,
    },
  }), /outcome.defeat/);

  const circular = {};
  circular.self = circular;
  assert.throws(() => completeVictory({ metadata: circular }), /circular/);
  assert.throws(() => createCampaignResultHandoff({}), /current endgame analytics report/);
});
