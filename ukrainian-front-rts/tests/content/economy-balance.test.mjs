import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_TYPES, MISSIONS, UNIT_TYPES, UPGRADES } from '../../src/config.js';
import {
  ECONOMY_BALANCE_PROFILE,
  ECONOMY_BALANCE_PROFILE_ID,
  ECONOMY_BALANCE_SCHEMA_VERSION,
  ECONOMY_RESOURCE_IDS,
  evaluateEconomyBalance,
  projectDepletionCurves,
  projectEconomyPlan,
  resourcePressureSeconds,
  timeToAffordEconomyCost,
} from '../../src/content/economy-balance.js';
import { reconcileActiveRuntimeContent } from '../../src/content/runtime-content-reconciliation.js';
import { DEFAULT_RESOURCE_RULES } from '../../src/core/resource-policy.js';
import { Game } from '../../src/game.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runtimeSources() {
  const previousWidth = globalThis.innerWidth;
  const previousHeight = globalThis.innerHeight;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  try {
    const game = new Game();
    game.start(0);
    return game.nodes.map((node, index) => ({
      id: `${node.kind}-${index + 1}`,
      kind: node.kind,
      amount: node.amount,
    }));
  } finally {
    if (previousWidth === undefined) delete globalThis.innerWidth;
    else globalThis.innerWidth = previousWidth;
    if (previousHeight === undefined) delete globalThis.innerHeight;
    else globalThis.innerHeight = previousHeight;
  }
}

function evaluate(overrides = {}) {
  reconcileActiveRuntimeContent();
  return evaluateEconomyBalance({
    unitTypes: UNIT_TYPES,
    buildingTypes: BUILDING_TYPES,
    upgrades: UPGRADES,
    missions: MISSIONS,
    resourceRules: DEFAULT_RESOURCE_RULES,
    resourceSources: runtimeSources(),
    ...overrides,
  });
}

test('publishes an immutable versioned economy baseline across all required balance dimensions', () => {
  assert.equal(ECONOMY_BALANCE_PROFILE.version, ECONOMY_BALANCE_SCHEMA_VERSION);
  assert.equal(ECONOMY_BALANCE_PROFILE.id, ECONOMY_BALANCE_PROFILE_ID);
  assert.deepEqual(ECONOMY_RESOURCE_IDS, ['metal', 'fuel', 'intel']);
  assert.equal(Object.isFrozen(ECONOMY_BALANCE_PROFILE), true);
  assert.equal(Object.isFrozen(ECONOMY_BALANCE_PROFILE.missionBenchmarks.donbas.steps), true);
  assert.ok(ECONOMY_BALANCE_PROFILE.missionBenchmarks.donbas);
  assert.ok(ECONOMY_BALANCE_PROFILE.affordability);
  assert.ok(ECONOMY_BALANCE_PROFILE.researchOpportunity);
  assert.ok(ECONOMY_BALANCE_PROFILE.depletion);
  assert.ok(ECONOMY_BALANCE_PROFILE.comeback);
});

test('current runtime opening, expansion, affordability, research, depletion, and comeback values satisfy the baseline', () => {
  const report = evaluate();
  assert.deepEqual(report.errors, []);
  assert.equal(report.profileId, ECONOMY_BALANCE_PROFILE_ID);

  for (const [missionId, benchmark] of Object.entries(ECONOMY_BALANCE_PROFILE.missionBenchmarks)) {
    const missionReport = report.missionReports[missionId];
    assert.equal(missionReport.status, 'completed');
    assert.ok(missionReport.elapsedSeconds <= benchmark.maxCompletionSeconds);
    assert.equal(missionReport.timeline.length, benchmark.steps.length);
    for (const step of missionReport.timeline) {
      const expected = benchmark.steps.find((candidate) => candidate.id === step.id);
      assert.ok(step.completionSeconds <= expected.deadline);
    }
  }

  for (const entry of Object.values(report.affordabilityReports)) {
    assert.ok(Number.isFinite(entry.seconds));
    assert.ok(entry.seconds <= entry.maximum);
  }
  for (const entry of Object.values(report.researchReports)) {
    assert.ok(entry.unitEquivalents >= ECONOMY_BALANCE_PROFILE.researchOpportunity.minUnitEquivalents);
    assert.ok(entry.unitEquivalents <= ECONOMY_BALANCE_PROFILE.researchOpportunity.maxUnitEquivalents);
  }
  assert.equal(report.comebackReport.salvageFundsRecovery, false);
  assert.equal(report.comebackReport.combinedFundsRecovery, true);
  assert.equal(report.comebackReport.fundedRecoveryUnits, 1);
});

test('opening plans use deterministic parallel income and sequential commitment timing', () => {
  reconcileActiveRuntimeContent();
  const benchmark = ECONOMY_BALANCE_PROFILE.missionBenchmarks.donbas;
  const plan = projectEconomyPlan({
    start: benchmark.start,
    workers: benchmark.workers,
    steps: benchmark.steps,
    resourceRules: DEFAULT_RESOURCE_RULES,
    unitTypes: UNIT_TYPES,
    buildingTypes: BUILDING_TYPES,
    upgrades: UPGRADES,
  });
  assert.equal(plan.status, 'completed');
  assert.deepEqual(plan.timeline.map((step) => step.id), [
    'first-reinforcement',
    'first-tech-expansion',
    'first-research-choice',
  ]);
  assert.deepEqual(plan.timeline.map((step) => step.completionSeconds), [5, 17, 35]);

  assert.equal(timeToAffordEconomyCost({
    available: { metal: 0, fuel: 0, intel: 0 },
    cost: { metal: 36, fuel: 30, intel: 20 },
    incomeRates: { metal: 18, fuel: 15, intel: 10 },
  }), 2);
});

test('research opportunity cost remains a meaningful production tradeoff', () => {
  reconcileActiveRuntimeContent();
  const linePressure = resourcePressureSeconds(UNIT_TYPES.uaInfantry.cost, DEFAULT_RESOURCE_RULES);
  const ratios = Object.fromEntries(Object.entries(UPGRADES).map(([id, upgrade]) => [
    id,
    resourcePressureSeconds(upgrade.cost, DEFAULT_RESOURCE_RULES) / linePressure,
  ]));
  assert.ok(ratios.cageArmor > 2);
  assert.ok(ratios.thermal > 2);
  assert.ok(ratios.activeProtection > 5);
  assert.ok(ratios.activeProtection < 6);
});

test('resource sources expose bounded deterministic depletion curves under a two-worker stress allocation', () => {
  const curves = projectDepletionCurves({
    sourcePools: runtimeSources(),
    resourceRules: DEFAULT_RESOURCE_RULES,
    workersPerSource: ECONOMY_BALANCE_PROFILE.depletion.workersPerSource,
  });
  assert.deepEqual(curves.map((curve) => Number(curve.depletionSeconds.toFixed(2))), [
    44.44,
    36.67,
    45,
    50,
    40,
  ]);
  for (const curve of curves) {
    assert.ok(curve.depletionSeconds >= ECONOMY_BALANCE_PROFILE.depletion.minSecondsPerSource);
    assert.ok(curve.depletionSeconds <= ECONOMY_BALANCE_PROFILE.depletion.maxSecondsPerSource);
  }
});

test('validator reports actionable drift for each balance dimension', () => {
  reconcileActiveRuntimeContent();

  const expensiveBuildings = clone(BUILDING_TYPES);
  expensiveBuildings.workshop.cost = { metal: 5000, fuel: 80 };
  const opening = evaluate({ buildingTypes: expensiveBuildings });
  assert.ok(opening.errors.some((error) => /opening benchmark becomes economically blocked|above/.test(error)));

  const cheapUpgrades = clone(UPGRADES);
  cheapUpgrades.thermal.cost = { metal: 1 };
  const research = evaluate({ upgrades: cheapUpgrades });
  assert.ok(research.errors.some((error) => /thermal: research opportunity cost/.test(error)));

  const depletedSources = runtimeSources();
  depletedSources[0].amount = 50;
  const depletion = evaluate({ resourceSources: depletedSources });
  assert.ok(depletion.errors.some((error) => /resource-source amounts drift/.test(error)));
  assert.ok(depletion.errors.some((error) => /depletion .* below/.test(error)));

  const expensiveRecoveryUnits = clone(UNIT_TYPES);
  expensiveRecoveryUnits.uaEngineer.cost = { metal: 200, fuel: 0, intel: 0 };
  const comeback = evaluate({ unitTypes: expensiveRecoveryUnits });
  assert.ok(comeback.errors.some((error) => /reserve plus salvage cannot fund/.test(error)));
});
