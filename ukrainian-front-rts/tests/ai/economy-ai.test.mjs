import test from 'node:test';
import assert from 'node:assert/strict';

import { planEconomy } from '../../src/ai/economy-planner.js';

const doctrine = (factionId = 'ukraine') => ({
  factionId,
  budgetWeights: {
    economy: 0.2,
    construction: 0.2,
    production: 0.2,
    research: 0.1,
    repair: 0.1,
    reserves: 0.1,
    operations: 0.1,
  },
  resourcePriorities: {
    supplies: 2,
    fuel: 1,
  },
});

function baseSnapshot(overrides = {}) {
  return {
    tick: 120,
    factionId: 'ukraine',
    resources: { supplies: 1200, fuel: 500 },
    workers: [
      { id: 'worker-c' },
      { id: 'worker-a' },
      { id: 'worker-b' },
    ],
    resourceSites: [
      { id: 'fuel-east', resourceId: 'fuel', capacity: 2, claimed: true, distance: 30 },
      { id: 'supplies-home', resourceId: 'supplies', capacity: 2, claimed: true, distance: 5 },
      { id: 'supplies-north', resourceId: 'supplies', capacity: 3, claimed: false, distance: 20 },
    ],
    bases: [{ id: 'hq', operational: true }],
    productionBuildings: [{ id: 'barracks', operational: true }],
    capacity: { used: 8, maximum: 12 },
    damagedStructures: [],
    buildOptions: [
      { id: 'forward-base', kind: 'base', cost: { supplies: 300, fuel: 100 }, priority: 2 },
      { id: 'resource-outpost', kind: 'expansion', cost: { supplies: 180 }, priority: 3 },
      { id: 'barracks-kit', kind: 'production', cost: { supplies: 250 }, priority: 2 },
      { id: 'logistics-hub', kind: 'capacity', cost: { supplies: 120 }, priority: 1 },
    ],
    unitOptions: [
      { id: 'rifle-squad', cost: { supplies: 160 }, priority: 2 },
      { id: 'engineer-squad', cost: { supplies: 120 }, priority: 1 },
    ],
    researchOptions: [
      { id: 'field-logistics', cost: { supplies: 200, fuel: 50 }, priority: 2 },
    ],
    targets: {
      desiredBases: 1,
      desiredProductionBuildings: 1,
      desiredCapacityBuffer: 2,
      expansionWorkerSaturation: 0.4,
      reserveFraction: 0.1,
    },
    ...overrides,
  };
}

test('allocates workers and expands saturated resource operations deterministically', () => {
  const plan = planEconomy(baseSnapshot(), doctrine());

  assert.deepEqual(plan.workerAssignments.map(({ workerId, siteId }) => [workerId, siteId]), [
    ['worker-a', 'supplies-home'],
    ['worker-b', 'supplies-north'],
    ['worker-c', 'fuel-east'],
  ]);
  assert.equal(plan.actions.find((action) => action.type === 'expansion')?.targetId, 'supplies-north');
  assert.equal(plan.actions.find((action) => action.type === 'train-unit')?.optionId, 'rifle-squad');
  assert.equal(plan.actions.find((action) => action.type === 'research')?.optionId, 'field-logistics');
});

test('recovers a lost base, production building, capacity, and damaged infrastructure before research', () => {
  const plan = planEconomy(baseSnapshot({
    bases: [],
    productionBuildings: [],
    capacity: { used: 12, maximum: 12 },
    damagedStructures: [
      { id: 'power-yard', priority: 5, repairCost: { supplies: 80 } },
    ],
    targets: {
      desiredBases: 1,
      desiredProductionBuildings: 1,
      desiredCapacityBuffer: 3,
      expansionWorkerSaturation: 0.4,
      reserveFraction: 0.1,
    },
  }), doctrine());

  assert.deepEqual(plan.recovery, {
    baseLost: true,
    productionLost: true,
    damagedInfrastructure: true,
  });
  assert.deepEqual(plan.actions.slice(0, 4).map((action) => action.type), [
    'repair',
    'base',
    'production',
    'capacity',
  ]);
  assert.equal(plan.actions.some((action) => action.type === 'research'), false);
  assert.ok(plan.budgetPlan.allocations.construction.supplies >
    plan.budgetPlan.allocations.research.supplies);
});

test('never spends below the configured reserve floor', () => {
  const snapshot = baseSnapshot({
    resources: { supplies: 300, fuel: 100 },
    bases: [],
    productionBuildings: [],
    capacity: { used: 10, maximum: 10 },
    damagedStructures: [{ id: 'hq', repairCost: { supplies: 100 } }],
    targets: {
      desiredBases: 1,
      desiredProductionBuildings: 1,
      desiredCapacityBuffer: 3,
      expansionWorkerSaturation: 0.4,
      reserveFraction: 0.25,
    },
  });
  const plan = planEconomy(snapshot, doctrine());

  assert.ok(plan.remainingResources.supplies >= 75);
  assert.ok(plan.remainingResources.fuel >= 25);
  const spentSupplies = plan.actions.reduce((sum, action) => sum + (action.cost.supplies ?? 0), 0);
  assert.equal(spentSupplies + plan.remainingResources.supplies, 300);
});

test('uses one shared planner contract for every faction doctrine', () => {
  const ukrainian = planEconomy(baseSnapshot(), doctrine('ukraine'));
  const opposing = planEconomy(
    baseSnapshot({ factionId: 'opposition' }),
    doctrine('opposition'),
  );

  assert.deepEqual(
    ukrainian.actions.map(({ type, optionId }) => [type, optionId]),
    opposing.actions.map(({ type, optionId }) => [type, optionId]),
  );
  assert.equal(opposing.factionId, 'opposition');
});

test('is stable when input arrays arrive in a different order', () => {
  const snapshot = baseSnapshot();
  const reversed = {
    ...snapshot,
    workers: [...snapshot.workers].reverse(),
    resourceSites: [...snapshot.resourceSites].reverse(),
    buildOptions: [...snapshot.buildOptions].reverse(),
    unitOptions: [...snapshot.unitOptions].reverse(),
    researchOptions: [...snapshot.researchOptions].reverse(),
  };

  assert.deepEqual(planEconomy(snapshot, doctrine()), planEconomy(reversed, doctrine()));
});
