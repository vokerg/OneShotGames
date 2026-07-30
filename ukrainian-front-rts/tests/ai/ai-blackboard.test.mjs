import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_BUDGET_CATEGORIES,
  createAiBudgetPlan,
  createAiDoctrineProfile,
} from '../../src/ai/ai-contracts.js';
import {
  ageAiKnowledge,
  createAiBlackboard,
  inspectAiBlackboard,
  observeAiContact,
  replaceAiGoals,
  runAiDecisionCadence,
  setAiBudgetPlan,
} from '../../src/ai/ai-blackboard.js';

function doctrine(overrides = {}) {
  return createAiDoctrineProfile({
    id: 'ua.standard',
    factionId: 'ukraine',
    strategy: 'networked-maneuver',
    decisionIntervalTicks: 3,
    decisionOffsetTicks: 1,
    contactStaleAfterTicks: 4,
    contactForgetAfterTicks: 8,
    ...overrides,
  });
}

function blackboard(overrides = {}) {
  return createAiBlackboard({ factionId: 'ukraine', doctrine: doctrine(), ...overrides });
}

test('creates immutable observed-only doctrine profiles with normalized weights', () => {
  const profile = doctrine({ budgetWeights: { production: 3, research: 1 } });
  assert.equal(profile.informationPolicy, 'observed-only');
  assert.equal(profile.budgetWeights.production, 0.75);
  assert.equal(profile.budgetWeights.research, 0.25);
  assert.equal(Object.keys(profile.budgetWeights).length, AI_BUDGET_CATEGORIES.length);
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.goalWeights));
  assert.throws(() => doctrine({ informationPolicy: 'omniscient' }), /observed-only/);
  assert.throws(() => doctrine({ decisionOffsetTicks: 3 }), /less than/);
});

test('builds exact multi-resource budgets and rejects overspending', () => {
  const plan = createAiBudgetPlan({
    tick: 5,
    resources: { fuel: 90, metal: 120 },
    allocations: {
      production: { fuel: 40, metal: 70 },
      reserves: { fuel: 20, metal: 30 },
    },
  });
  assert.deepEqual(plan.unallocated, { fuel: 30, metal: 20 });
  assert.ok(Object.isFrozen(plan.allocations.production));
  assert.throws(() => createAiBudgetPlan({
    resources: { metal: 10 },
    allocations: { production: { metal: 11 } },
  }), /exceed available metal/);
});

test('stores only explicit scouting observations and ages them deterministically', () => {
  const board = blackboard();
  assert.throws(() => observeAiContact(board, {
    id: 'enemy-1', tick: 0, source: 'hidden-state', kind: 'armor', teamId: 'russia', position: { x: 3, y: 4 },
  }), /source must be one of/);

  observeAiContact(board, {
    id: 'enemy-2', tick: 1, source: 'line-of-sight', kind: 'infantry', teamId: 'russia', position: { x: 9, y: 2 }, strength: 2,
  });
  observeAiContact(board, {
    id: 'enemy-1', tick: 2, source: 'domain-event', kind: 'armor', teamId: 'russia', position: { x: 3, y: 4 }, strength: 5,
    details: { tags: ['vehicle', 'priority'] },
  });
  observeAiContact(board, {
    id: 'enemy-1', tick: 3, source: 'line-of-sight', kind: 'armor', teamId: 'russia', position: { x: 4, y: 4 }, strength: 4,
  });
  let snapshot = inspectAiBlackboard(board);
  assert.deepEqual(snapshot.knowledge.map((contact) => contact.id), ['enemy-1', 'enemy-2']);
  assert.equal(snapshot.knowledge[0].observationCount, 2);
  assert.equal(snapshot.knowledge[0].position.x, 4);

  ageAiKnowledge(board, 6);
  snapshot = inspectAiBlackboard(board);
  assert.equal(snapshot.knowledge.find((contact) => contact.id === 'enemy-2').state, 'stale');
  assert.equal(snapshot.knowledge.find((contact) => contact.id === 'enemy-1').state, 'confirmed');

  ageAiKnowledge(board, 10);
  assert.deepEqual(inspectAiBlackboard(board).knowledge.map((contact) => contact.id), ['enemy-1']);
  ageAiKnowledge(board, 11);
  assert.equal(inspectAiBlackboard(board).knowledge.length, 0);
});

test('orders goals by priority, age, and stable id', () => {
  const board = blackboard();
  replaceAiGoals(board, [
    { id: 'goal-c', kind: 'attack', priority: 50, createdTick: 3 },
    { id: 'goal-b', kind: 'defense', priority: 80, createdTick: 4 },
    { id: 'goal-a', kind: 'scouting', priority: 80, createdTick: 4 },
    { id: 'goal-old', kind: 'economy', priority: 80, createdTick: 1 },
  ]);
  assert.deepEqual(inspectAiBlackboard(board).goals.map((goal) => goal.id), ['goal-old', 'goal-a', 'goal-b', 'goal-c']);
  assert.throws(() => replaceAiGoals(board, [
    { id: 'same', kind: 'attack' },
    { id: 'same', kind: 'defense' },
  ]), /duplicate goal id/);
});

test('keeps budget state reference-free and monotonic', () => {
  const board = blackboard();
  const allocations = { production: { metal: 60 } };
  setAiBudgetPlan(board, { tick: 2, resources: { metal: 100 }, allocations });
  allocations.production.metal = 99;
  const snapshot = inspectAiBlackboard(board);
  assert.equal(snapshot.budgetPlan.allocations.production.metal, 60);
  assert.equal(snapshot.tick, 2);
  assert.throws(() => setAiBudgetPlan(board, { tick: 1, resources: {}, allocations: {} }), /older/);
});

test('produces the same decisions for incremental and chunked tick advancement', () => {
  const incremental = blackboard();
  const chunked = blackboard();
  for (const board of [incremental, chunked]) {
    observeAiContact(board, {
      id: 'contact', tick: 0, source: 'mission-intel', kind: 'objective', teamId: 'neutral', position: { x: 1, y: 1 },
    });
    replaceAiGoals(board, [{ id: 'secure', kind: 'defense', priority: 10, createdTick: 0 }]);
  }
  const decide = (snapshot, cadence) => ({
    cadence,
    contacts: snapshot.summary.knownContacts,
    topGoal: snapshot.goals[0]?.id ?? null,
  });
  for (let tick = 0; tick <= 13; tick += 1) runAiDecisionCadence(incremental, { throughTick: tick, decide });
  runAiDecisionCadence(chunked, { throughTick: 13, decide });
  assert.deepEqual(inspectAiBlackboard(chunked).decisionHistory, inspectAiBlackboard(incremental).decisionHistory);
  assert.deepEqual(inspectAiBlackboard(chunked).cadence, inspectAiBlackboard(incremental).cadence);
  assert.equal(inspectAiBlackboard(chunked).summary.knownContacts, 0);
});

test('bounds decision history and exposes deeply frozen debug snapshots', () => {
  const board = createAiBlackboard({ factionId: 'ukraine', doctrine: doctrine({ decisionIntervalTicks: 1, decisionOffsetTicks: 0 }), historyLimit: 3 });
  runAiDecisionCadence(board, { throughTick: 5, decide: (_snapshot, cadence) => ({ index: cadence.index }) });
  const snapshot = inspectAiBlackboard(board);
  assert.deepEqual(snapshot.decisionHistory.map((record) => record.index), [3, 4, 5]);
  assert.equal(snapshot.summary.decisionsRetained, 3);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.cadence));
  assert.ok(Object.isFrozen(snapshot.decisionHistory));
  assert.throws(() => { snapshot.summary.knownContacts = 99; }, TypeError);
});

test('rejects mutable live references and cyclic decision output', () => {
  const board = blackboard();
  assert.throws(() => observeAiContact(board, {
    id: 'bad', tick: 0, source: 'line-of-sight', kind: 'unit', teamId: 'russia', position: { x: 0, y: 0 }, details: new Map(),
  }), /plain object/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => runAiDecisionCadence(board, { throughTick: 1, decide: () => cyclic }), /cycle/);
  assert.equal(inspectAiBlackboard(board).decisionHistory.length, 0);
});
