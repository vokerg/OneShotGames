import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_MODERNIZATION_CHOICE_ID,
  DEFAULT_MODERNIZATION_CHOICES,
  MODERNIZATION_REFUND_MODES,
  activeModernizationUpgradeIds,
  awardModernizationPoints,
  createModernizationCatalog,
  createModernizationPresentation,
  createModernizationState,
  deserializeModernizationState,
  evaluateModernizationChoice,
  readModernizationFromCampaignProfile,
  refundModernizationChoice,
  respecModernizationChoices,
  resolveModernizationRefundPolicy,
  selectModernizationChoice,
  serializeModernizationState,
  writeModernizationToCampaignProfile,
} from '../../src/core/campaign-modernization.js';

const upgradeDefinitions = DEFAULT_MODERNIZATION_CHOICES.map(({ upgradeId }) => ({ id: upgradeId }));
const catalog = () => createModernizationCatalog({ upgradeDefinitions });
const context = (count) => ({ completedOperationIds: Array.from({ length: count }, (_, index) => `operation-${index + 1}`) });
const profile = () => ({
  version: 1,
  profileId: 'alpha',
  difficulty: 'standard',
  revision: 0,
  unlockedOperationIds: [],
  completedOperationIds: [],
  choices: {},
  missionResults: {},
  unlockedUpgradeIds: [],
  medalIds: [],
});

function funded(points = 12, modernCatalog = catalog()) {
  return createModernizationState({ earnedPoints: points, availablePoints: points }, modernCatalog);
}

function select(modernCatalog, state, choiceId, completedOperations = 2) {
  return selectModernizationChoice({ catalog: modernCatalog, state, choiceId, context: context(completedOperations) });
}

test('default catalog is deterministic, deeply immutable, and validates UFR-062 upgrade IDs', () => {
  const modernCatalog = catalog();
  assert.deepEqual(modernCatalog.choiceIds, [
    'modernization.cage-armor',
    'modernization.nato-ammunition',
    'modernization.thermal-sights',
    'modernization.active-protection',
    'modernization.digital-c2',
    'modernization.mine-roller',
  ]);
  assert.equal(Object.isFrozen(modernCatalog), true);
  assert.equal(Object.isFrozen(modernCatalog.choices[0].unlock), true);
  assert.throws(
    () => createModernizationCatalog({ upgradeDefinitions: upgradeDefinitions.slice(1) }),
    /unknown upgrade cageArmor/,
  );
});

test('point awards and state accounting enforce campaign caps without hidden currency', () => {
  const modernCatalog = catalog();
  let state = createModernizationState({}, modernCatalog);
  state = awardModernizationPoints(state, 5, modernCatalog);
  assert.deepEqual(state, {
    version: 1,
    earnedPoints: 5,
    availablePoints: 5,
    selectedChoiceIds: [],
    activeCost: 0,
    sunkPoints: 0,
  });
  assert.throws(() => awardModernizationPoints(state, 8, modernCatalog), /campaign cap/);
  assert.throws(
    () => createModernizationState({ earnedPoints: 3, availablePoints: 2, selectedChoiceIds: ['modernization.cage-armor'] }, modernCatalog),
    /more points than have been earned/,
  );
});

test('unlock, prerequisite, affordability, selection, and category constraints are explicit', () => {
  const modernCatalog = catalog();
  let state = funded(8, modernCatalog);
  assert.deepEqual(
    evaluateModernizationChoice({ catalog: modernCatalog, state, choiceId: 'modernization.active-protection', context: context(0) }).reasons,
    ['insufficient-completed-operations', 'missing-prerequisite:modernization.cage-armor'],
  );
  state = select(modernCatalog, state, 'modernization.cage-armor', 0);
  state = select(modernCatalog, state, 'modernization.active-protection', 2);
  assert.deepEqual(state.selectedChoiceIds, ['modernization.active-protection', 'modernization.cage-armor']);
  assert.equal(state.availablePoints, 2);
  assert.throws(() => select(modernCatalog, state, 'modernization.nato-ammunition', 2), /insufficient-points/);

  const cappedCatalog = createModernizationCatalog({
    choices: DEFAULT_MODERNIZATION_CHOICES,
    upgradeDefinitions,
    policy: {
      maxEarnedPoints: 12,
      maxSelectedChoices: 4,
      categoryCaps: { protection: 1 },
      refund: {},
    },
  });
  let capped = funded(12, cappedCatalog);
  capped = select(cappedCatalog, capped, 'modernization.cage-armor', 2);
  assert.throws(() => select(cappedCatalog, capped, 'modernization.active-protection', 2), /category-cap:protection/);
});

test('campaign-profile persistence stores active choices while preserving additive unlock history', () => {
  const modernCatalog = catalog();
  let state = funded(8, modernCatalog);
  state = select(modernCatalog, state, 'modernization.cage-armor');
  state = select(modernCatalog, state, 'modernization.thermal-sights');
  const saved = writeModernizationToCampaignProfile(profile(), state, modernCatalog);
  assert.equal(saved.choices[CAMPAIGN_MODERNIZATION_CHOICE_ID].version, 1);
  assert.deepEqual(saved.unlockedUpgradeIds, ['cageArmor', 'thermal']);
  assert.deepEqual(readModernizationFromCampaignProfile(saved, modernCatalog), state);

  const refunded = refundModernizationChoice({
    catalog: modernCatalog,
    state,
    choiceId: 'modernization.thermal-sights',
    context: context(0),
  }).state;
  const resaved = writeModernizationToCampaignProfile(saved, refunded, modernCatalog);
  assert.deepEqual(activeModernizationUpgradeIds(refunded, modernCatalog), ['cageArmor']);
  assert.deepEqual(resaved.unlockedUpgradeIds, ['cageArmor', 'thermal'], 'UFR-084 unlock history remains additive');
});

test('partial refunds preserve sunk points and dependent removal requires explicit cascade', () => {
  const modernCatalog = catalog();
  let state = funded(12, modernCatalog);
  state = select(modernCatalog, state, 'modernization.cage-armor');
  state = select(modernCatalog, state, 'modernization.active-protection');
  assert.throws(
    () => refundModernizationChoice({ catalog: modernCatalog, state, choiceId: 'modernization.cage-armor', context: context(2) }),
    /selected dependents: modernization.active-protection/,
  );
  const result = refundModernizationChoice({
    catalog: modernCatalog,
    state,
    choiceId: 'modernization.cage-armor',
    context: context(2),
    cascade: true,
  });
  assert.equal(result.refundPolicy.mode, MODERNIZATION_REFUND_MODES.PARTIAL);
  assert.equal(result.removedCost, 6);
  assert.equal(result.refundedPoints, 3);
  assert.equal(result.forfeitedPoints, 3);
  assert.equal(result.state.availablePoints, 9);
  assert.equal(result.state.sunkPoints, 3);
  assert.deepEqual(result.state.selectedChoiceIds, []);
});

test('respec policy supports free, partial, and locked campaign windows', () => {
  const modernCatalog = catalog();
  let state = funded(8, modernCatalog);
  state = select(modernCatalog, state, 'modernization.cage-armor');
  state = select(modernCatalog, state, 'modernization.thermal-sights');
  const free = respecModernizationChoices({ catalog: modernCatalog, state, context: context(1) });
  assert.equal(free.refundPolicy.mode, MODERNIZATION_REFUND_MODES.FULL);
  assert.equal(free.state.availablePoints, 8);

  const partial = respecModernizationChoices({ catalog: modernCatalog, state, context: context(3) });
  assert.equal(partial.refundPolicy.mode, MODERNIZATION_REFUND_MODES.PARTIAL);
  assert.equal(partial.state.availablePoints, 6);
  assert.equal(partial.state.sunkPoints, 2);

  const lockedCatalog = createModernizationCatalog({
    choices: DEFAULT_MODERNIZATION_CHOICES,
    upgradeDefinitions,
    policy: {
      maxEarnedPoints: 12,
      maxSelectedChoices: 4,
      categoryCaps: {},
      refund: { freeThroughCompletedOperations: 1, partialRatio: 0.5, lockedAfterCompletedOperations: 4 },
    },
  });
  assert.equal(resolveModernizationRefundPolicy(lockedCatalog, context(4)).mode, MODERNIZATION_REFUND_MODES.LOCKED);
  assert.throws(() => respecModernizationChoices({ catalog: lockedCatalog, state, context: context(4) }), /locked/);
});

test('presentation is stable, immutable, and explains unlock and refund state', () => {
  const modernCatalog = catalog();
  let state = funded(6, modernCatalog);
  state = select(modernCatalog, state, 'modernization.cage-armor', 0);
  const view = createModernizationPresentation({ catalog: modernCatalog, state, context: context(2) });
  assert.deepEqual(view.activeUpgradeIds, ['cageArmor']);
  assert.equal(view.budget.availablePoints, 4);
  assert.equal(view.refundPolicy.mode, MODERNIZATION_REFUND_MODES.PARTIAL);
  assert.equal(view.choices.find((choice) => choice.id === 'modernization.cage-armor').refundValue, 1);
  assert.equal(view.choices.find((choice) => choice.id === 'modernization.active-protection').status, 'available');
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.choices), true);
});

test('serialization round trips canonically and rejects future versions', () => {
  const modernCatalog = catalog();
  let state = funded(12, modernCatalog);
  state = select(modernCatalog, state, 'modernization.thermal-sights');
  state = select(modernCatalog, state, 'modernization.digital-c2');
  const serialized = serializeModernizationState(state, modernCatalog);
  assert.equal(serialized, '{"version":1,"earnedPoints":12,"availablePoints":6,"selectedChoiceIds":["modernization.digital-c2","modernization.thermal-sights"]}');
  assert.deepEqual(deserializeModernizationState(serialized, modernCatalog), state);
  assert.throws(() => deserializeModernizationState('{"version":2}', modernCatalog), /Unsupported/);
});

test('invalid graphs, exclusions, and duplicate selections fail closed', () => {
  const base = (id, upgradeId, overrides = {}) => ({ id, upgradeId, name: id, description: `Choice ${id}`, category: 'x', tier: 1, cost: 1, ...overrides });
  assert.throws(
    () => createModernizationCatalog({
      choices: [base('a', 'up-a', { requiresChoiceIds: ['b'] }), base('b', 'up-b', { requiresChoiceIds: ['a'] })],
      policy: { maxEarnedPoints: 2, maxSelectedChoices: 2, categoryCaps: {}, refund: {} },
    }),
    /cycle/,
  );
  assert.throws(
    () => createModernizationCatalog({
      choices: [base('a', 'up-a', { excludesChoiceIds: ['b'] }), base('b', 'up-b')],
      policy: { maxEarnedPoints: 2, maxSelectedChoices: 2, categoryCaps: {}, refund: {} },
    }),
    /reciprocal/,
  );
  assert.throws(
    () => createModernizationState({ earnedPoints: 2, availablePoints: 0, selectedChoiceIds: ['modernization.cage-armor', 'modernization.cage-armor'] }, catalog()),
    /duplicate/,
  );
});
