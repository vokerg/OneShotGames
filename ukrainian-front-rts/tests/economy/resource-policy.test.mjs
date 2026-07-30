import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RESOURCE_RULES,
  RESOURCE_POLICY_VERSION,
  createResourcePolicy,
  extractResource,
  regenerateResource,
  resolveResourceRule,
  resolveSalvageBurst,
} from '../../src/core/resource-policy.js';

test('creates a frozen versioned resource policy with all resource kinds', () => {
  const policy = createResourcePolicy();
  assert.equal(policy.version, RESOURCE_POLICY_VERSION);
  assert.deepEqual(Object.keys(policy.resources), ['metal', 'fuel', 'intel']);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.resources.metal), true);
});

test('mission overrides replace only authored rule fields', () => {
  const policy = createResourcePolicy({
    missionOverrides: { donbas: { metal: { extractionRate: 25 } } },
  });
  const metal = resolveResourceRule(policy, 'metal', 'donbas');
  assert.equal(metal.extractionRate, 25);
  assert.equal(metal.carryCapacity, DEFAULT_RESOURCE_RULES.metal.carryCapacity);
  assert.equal(resolveResourceRule(policy, 'fuel', 'donbas'), policy.missionOverrides.donbas.fuel);
  assert.equal(resolveResourceRule(policy, 'metal', 'kherson'), policy.resources.metal);
});

test('extraction is bounded by rate, source amount, and carry capacity', () => {
  const rule = resolveResourceRule(createResourcePolicy(), 'metal');
  assert.deepEqual(extractResource({ sourceAmount: 100, carriedAmount: 10, elapsedSeconds: 1, rule }), {
    extracted: 18,
    sourceAmount: 82,
    carriedAmount: 28,
    depleted: false,
    full: false,
  });
  assert.deepEqual(extractResource({ sourceAmount: 100, carriedAmount: 35, elapsedSeconds: 1, rule }), {
    extracted: 5,
    sourceAmount: 95,
    carriedAmount: 40,
    depleted: false,
    full: true,
  });
});

test('extraction depletes small sources without negative drift', () => {
  const rule = resolveResourceRule(createResourcePolicy(), 'fuel');
  const result = extractResource({ sourceAmount: 3, carriedAmount: 0, elapsedSeconds: 1, rule });
  assert.equal(result.extracted, 3);
  assert.equal(result.sourceAmount, 0);
  assert.equal(result.depleted, true);
});

test('regeneration is optional and clamps to max amount', () => {
  const policy = createResourcePolicy({ resources: { metal: { regenerationRate: 2 } } });
  const metal = resolveResourceRule(policy, 'metal');
  assert.deepEqual(regenerateResource({ amount: 95, maxAmount: 100, elapsedSeconds: 4, rule: metal }), {
    regenerated: 5,
    amount: 100,
    full: true,
  });
  const fuel = resolveResourceRule(policy, 'fuel');
  assert.equal(regenerateResource({ amount: 10, maxAmount: 20, elapsedSeconds: 10, rule: fuel }).regenerated, 0);
});

test('salvage bursts respect available, requested, and authored burst limits', () => {
  const rule = resolveResourceRule(createResourcePolicy(), 'metal');
  assert.deepEqual(resolveSalvageBurst({ availableAmount: 100, requestedAmount: 20, rule }), {
    granted: 20,
    remainingAmount: 80,
    depleted: false,
  });
  assert.deepEqual(resolveSalvageBurst({ availableAmount: 30, rule }), {
    granted: 30,
    remainingAmount: 0,
    depleted: true,
  });
});

test('policy rejects unknown resource kinds and invalid numbers', () => {
  assert.throws(() => createResourcePolicy({ resources: { water: {} } }), /Unknown resource kind/);
  assert.throws(() => createResourcePolicy({ resources: { metal: { extractionRate: 0 } } }), /positive finite/);
  assert.throws(() => resolveResourceRule(createResourcePolicy(), 'water'), /Unknown resource kind/);
});

test('extraction rejects over-cap and invalid elapsed state', () => {
  const rule = resolveResourceRule(createResourcePolicy(), 'intel');
  assert.throws(
    () => extractResource({ sourceAmount: 10, carriedAmount: 25, elapsedSeconds: 1, rule }),
    /exceeds the resolved carry capacity/,
  );
  assert.throws(
    () => extractResource({ sourceAmount: 10, carriedAmount: 0, elapsedSeconds: -1, rule }),
    /non-negative finite/,
  );
});
