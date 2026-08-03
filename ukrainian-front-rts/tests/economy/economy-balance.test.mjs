import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUILDING_TYPES,
  MISSIONS,
  UNIT_TYPES,
  UPGRADES,
} from '../../src/config.js';
import {
  DEFAULT_ECONOMY_BALANCE_PROFILE,
  ECONOMY_BALANCE_PROFILE_VERSION,
  calculateDepletionWindow,
  calculateGatherSeconds,
  calculateTripEquivalents,
  createEconomyBalanceProfile,
  evaluateEconomyBalanceBaseline,
} from '../../src/core/economy-balance.js';
import { DEFAULT_RESOURCE_RULES } from '../../src/core/resource-policy.js';

function evaluate(overrides = {}) {
  return evaluateEconomyBalanceBaseline({
    missions: MISSIONS,
    unitTypes: UNIT_TYPES,
    buildingTypes: BUILDING_TYPES,
    upgrades: UPGRADES,
    ...overrides,
  });
}

function checkById(result, id) {
  const check = result.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `Expected economy balance check ${id}.`);
  return check;
}

test('default economy balance profile is versioned and deeply immutable', () => {
  assert.equal(DEFAULT_ECONOMY_BALANCE_PROFILE.version, ECONOMY_BALANCE_PROFILE_VERSION);
  assert.ok(Object.isFrozen(DEFAULT_ECONOMY_BALANCE_PROFILE));
  assert.ok(Object.isFrozen(DEFAULT_ECONOMY_BALANCE_PROFILE.opening));
  assert.ok(Object.isFrozen(DEFAULT_ECONOMY_BALANCE_PROFILE.opening.package));
  assert.ok(Object.isFrozen(DEFAULT_ECONOMY_BALANCE_PROFILE.opening.package[0]));
  assert.ok(Object.isFrozen(DEFAULT_ECONOMY_BALANCE_PROFILE.affordability[0].unitIds));
  assert.throws(
    () => DEFAULT_ECONOMY_BALANCE_PROFILE.opening.package.push({ kind: 'unit', id: 'uaTank' }),
    TypeError,
  );
});

test('trip, gather, and depletion analyzers use authoritative resource rules', () => {
  const tankTrips = calculateTripEquivalents(UNIT_TYPES.uaTank.cost);
  assert.equal(tankTrips.byResource.metal, 5.875);
  assert.equal(tankTrips.byResource.fuel, 3.75);
  assert.equal(tankTrips.byResource.intel, 0);
  assert.equal(tankTrips.total, 9.625);

  const expansionGather = calculateGatherSeconds({
    cost: { metal: 320, fuel: 80 },
    availableResources: { metal: 5, fuel: 110, intel: 25 },
    workersByResource: { metal: 2, fuel: 1, intel: 0 },
  });
  assert.deepEqual(expansionGather.deficits, { metal: 315, fuel: 0, intel: 0 });
  assert.deepEqual(expansionGather.byResource, { metal: 8.75, fuel: 0, intel: 0 });
  assert.equal(expansionGather.totalSeconds, 8.75);

  const depletion = calculateDepletionWindow({
    sourceAmounts: { metal: 1800, fuel: 900, intel: 360 },
    workersByResource: { metal: 4, fuel: 2, intel: 1 },
  });
  assert.deepEqual(depletion.byResource, { metal: 25, fuel: 30, intel: 36 });
  assert.equal(depletion.earliestSeconds, 25);
  assert.equal(depletion.latestSeconds, 36);
});

test('current assembled economy satisfies all six baseline constraints', () => {
  const result = evaluate();
  assert.equal(result.passed, true);
  assert.deepEqual(result.checks.map(({ id, passed }) => ({ id, passed })), [
    { id: 'opening', passed: true },
    { id: 'expansion', passed: true },
    { id: 'affordability', passed: true },
    { id: 'research-opportunity-cost', passed: true },
    { id: 'depletion', passed: true },
    { id: 'comeback', passed: true },
  ]);

  const opening = checkById(result, 'opening');
  assert.deepEqual(opening.cost, { metal: 235, fuel: 0, intel: 0 });
  assert.deepEqual(opening.residual, { metal: 5, fuel: 110, intel: 25 });

  const expansion = checkById(result, 'expansion');
  assert.equal(expansion.gather.totalSeconds, 8.75);
  assert.equal(expansion.tripEquivalent, 7.875);

  const affordability = checkById(result, 'affordability');
  assert.deepEqual(
    affordability.groups.map(({ id, maximum, limit }) => ({ id, maximum, limit })),
    [
      { id: 'frontline', maximum: 2.5, limit: 3 },
      { id: 'precision', maximum: 3.041666666666667, limit: 3.1 },
      { id: 'armor-and-fires', maximum: 9.625, limit: 9.75 },
    ],
  );

  const research = checkById(result, 'research-opportunity-cost');
  assert.equal(research.referenceTripEquivalent, 9.625);
  assert.equal(research.tiers[0].maximumRatio, 7.152777777777778 / 9.625);
  assert.equal(research.tiers[1].maximumRatio, 11.75 / 9.625);

  const depletion = checkById(result, 'depletion');
  assert.deepEqual(depletion.window.byResource, { metal: 25, fuel: 30, intel: 36 });

  const comeback = checkById(result, 'comeback');
  assert.deepEqual(comeback.available, { metal: 165, fuel: 0, intel: 0 });
  assert.deepEqual(comeback.cost, { metal: 165, fuel: 0, intel: 0 });
  assert.deepEqual(comeback.residual, { metal: 0, fuel: 0, intel: 0 });
});

test('an unaffordable armored unit fails only its declared balance check', () => {
  const unitTypes = {
    ...UNIT_TYPES,
    uaTank: {
      ...UNIT_TYPES.uaTank,
      cost: { metal: 400, fuel: 200 },
    },
  };
  const result = evaluate({ unitTypes });
  assert.equal(result.passed, false);
  assert.equal(checkById(result, 'affordability').passed, false);
  assert.deepEqual(
    result.checks.filter((check) => !check.passed).map((check) => check.id),
    ['affordability'],
  );
});

test('missing package IDs fail with an actionable error', () => {
  const profile = createEconomyBalanceProfile({
    ...DEFAULT_ECONOMY_BALANCE_PROFILE,
    opening: {
      ...DEFAULT_ECONOMY_BALANCE_PROFILE.opening,
      package: [{ kind: 'building', id: 'missing-building' }],
    },
  });
  assert.throws(
    () => evaluate({ profile }),
    /Opening package references unknown building: missing-building/,
  );
});

test('nonzero deficits with no assigned workers remain explicitly unreachable', () => {
  const gather = calculateGatherSeconds({
    cost: { metal: 80 },
    availableResources: { metal: 0, fuel: 0, intel: 0 },
    workersByResource: { metal: 0, fuel: 0, intel: 0 },
    resourceRules: DEFAULT_RESOURCE_RULES,
  });
  assert.equal(gather.byResource.metal, Infinity);
  assert.equal(gather.totalSeconds, Infinity);
});

test('profile validation rejects inverted depletion windows and unknown resources', () => {
  assert.throws(
    () => createEconomyBalanceProfile({
      ...DEFAULT_ECONOMY_BALANCE_PROFILE,
      depletion: {
        ...DEFAULT_ECONOMY_BALANCE_PROFILE.depletion,
        minSeconds: 50,
        maxSeconds: 40,
      },
    }),
    /maximum must be greater than or equal to its minimum/,
  );

  assert.throws(
    () => calculateTripEquivalents({ metal: 5, credits: 10 }),
    /Unknown resource kind in Cost: credits/,
  );
});
