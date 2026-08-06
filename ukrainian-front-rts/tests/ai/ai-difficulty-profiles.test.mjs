import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_DIFFICULTY_IDS,
  AI_DIFFICULTY_PROFILES,
  createAiDifficultyProfile,
  createAiDifficultyRuntimePolicy,
  createAiEconomyDifficultyLimits,
  projectObservedContactsForDifficulty,
  resolveAiDifficultyProfile,
} from '../../src/ai/ai-difficulty-profiles.js';
import { createAiDoctrineProfile } from '../../src/ai/ai-contracts.js';

const doctrine = createAiDoctrineProfile({
  id: 'ua-balanced',
  factionId: 'ukraine',
  strategy: 'combined-arms',
  decisionIntervalTicks: 12,
  decisionOffsetTicks: 3,
  contactStaleAfterTicks: 120,
  contactForgetAfterTicks: 360,
  riskTolerance: 0.5,
  retreatThreshold: 0.35,
});

test('ships four immutable fair profiles ordered from forgiving to demanding', () => {
  assert.deepEqual(AI_DIFFICULTY_IDS, ['recruit', 'regular', 'veteran', 'commander']);
  const profiles = AI_DIFFICULTY_IDS.map((id) => AI_DIFFICULTY_PROFILES[id]);
  assert.ok(profiles.every(Object.isFrozen));
  assert.deepEqual(profiles.map((profile) => profile.fairness.resourceMultiplier), [1, 1, 1, 1]);
  assert.deepEqual(profiles.map((profile) => profile.fairness.damageMultiplier), [1, 1, 1, 1]);
  assert.deepEqual(profiles.map((profile) => profile.fairness.healthMultiplier), [1, 1, 1, 1]);
  assert.ok(profiles.every((profile) => profile.informationPolicy === 'observed-only'));
  assert.ok(profiles.every((profile) => !profile.fairness.fullMapVision && !profile.fairness.ignoresFogOfWar));
  assert.deepEqual(profiles.map((profile) => profile.planningQuality), [0.45, 0.7, 0.88, 1]);
  assert.deepEqual(profiles.map((profile) => profile.economyEfficiency), [0.6, 0.8, 0.93, 1]);
});

test('rejects hidden stat and information cheats', () => {
  assert.throws(() => createAiDifficultyProfile({
    id: 'cheat',
    displayNameKey: 'difficulty.cheat',
    resourceMultiplier: 1.1,
  }), /hidden stat cheats/);
  assert.throws(() => createAiDifficultyProfile({
    id: 'omniscient',
    displayNameKey: 'difficulty.omniscient',
    informationPolicy: 'full-map',
  }), /observed-only/);
});

test('delays only observed contacts and never invents hidden knowledge', () => {
  const contacts = [
    { id: 'late', observedTick: 95, x: 5, y: 6 },
    { id: 'early-b', observedTick: 50, x: 2, y: 3 },
    { id: 'early-a', observedTick: 50, x: 1, y: 3 },
  ];
  assert.deepEqual(
    projectObservedContactsForDifficulty({ contacts, tick: 100, difficulty: 'recruit' }).map((entry) => entry.id),
    ['early-a', 'early-b'],
  );
  assert.deepEqual(
    projectObservedContactsForDifficulty({ contacts, tick: 100, difficulty: 'commander' }).map((entry) => entry.id),
    ['early-a', 'early-b', 'late'],
  );
  assert.deepEqual(contacts.map((entry) => entry.id), ['late', 'early-b', 'early-a']);
});

test('adjusts decision quality, reaction, risk, and economy utilization without changing rules', () => {
  const recruit = createAiDifficultyRuntimePolicy({ doctrine, difficulty: 'recruit' });
  const commander = createAiDifficultyRuntimePolicy({ doctrine, difficulty: 'commander' });

  assert.ok(recruit.doctrine.decisionIntervalTicks > commander.doctrine.decisionIntervalTicks);
  assert.ok(recruit.doctrine.retreatThreshold > commander.doctrine.retreatThreshold);
  assert.ok(recruit.doctrine.riskTolerance < commander.doctrine.riskTolerance);
  assert.ok(recruit.economy.utilizationRatio < commander.economy.utilizationRatio);
  assert.ok(recruit.economy.maximumConcurrentPlans < commander.economy.maximumConcurrentPlans);

  for (const policy of [recruit, commander]) {
    assert.equal(policy.economy.resourceMultiplier, 1);
    assert.equal(policy.economy.costMultiplier, 1);
    assert.equal(policy.economy.buildTimeMultiplier, 1);
    assert.equal(policy.doctrine.informationPolicy, 'observed-only');
    assert.ok(Object.isFrozen(policy));
  }
});

test('profile resolution and economy limits are deterministic and fail closed', () => {
  assert.equal(resolveAiDifficultyProfile().id, 'regular');
  assert.deepEqual(createAiEconomyDifficultyLimits('veteran'), createAiEconomyDifficultyLimits('veteran'));
  assert.throws(() => resolveAiDifficultyProfile('nightmare'), /unknown AI difficulty/);
});
