import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DIFFICULTY_PROFILES } from '../../src/ai/ai-difficulty-profiles.js';
import { BUILDING_TYPES, UNIT_TYPES } from '../../src/config.js';
import {
  CAMPAIGN_BALANCE_VERSION,
  CAMPAIGN_DIFFICULTY_BALANCE,
} from '../../src/content/campaign/campaign-balance.js';
import {
  ECONOMY_BALANCE_PROFILE,
  ECONOMY_BALANCE_PROFILE_ID,
  ECONOMY_BALANCE_SCHEMA_VERSION,
} from '../../src/content/economy-balance.js';
import { RELEASE_BALANCE_BASELINE } from '../../src/content/release-balance-baseline.js';
import { BALANCE_BATCH_KINDS } from '../../src/core/balance-snapshot.js';

const UNIT_IDS = Object.freeze({
  infantry: { ukraine: 'uaInfantry', russia: 'ruInfantry' },
  drone: { ukraine: 'uaDrone', russia: 'ruDrone' },
  ifv: { ukraine: 'uaIfv', russia: 'ruIfv' },
  tank: { ukraine: 'uaTank', russia: 'ruTank' },
  artillery: { ukraine: 'uaArtillery', russia: 'ruArtillery' },
});

function combatStats(unit) {
  return {
    hp: unit.hp,
    speed: unit.speed,
    range: unit.range,
    damage: unit.damage,
    rate: unit.rate,
    sight: unit.sight,
    cost: unit.cost,
  };
}

function aiTuning(profile) {
  return {
    observationDelayTicks: profile.observationDelayTicks,
    reactionDelayTicks: profile.reactionDelayTicks,
    planningQuality: profile.planningQuality,
    riskTolerance: profile.riskTolerance,
    economyEfficiency: profile.economyEfficiency,
  };
}

test('release candidate combat and structure values do not drift silently', () => {
  for (const [archetype, factionIds] of Object.entries(UNIT_IDS)) {
    for (const [side, unitId] of Object.entries(factionIds)) {
      assert.deepEqual(
        combatStats(UNIT_TYPES[unitId]),
        RELEASE_BALANCE_BASELINE.pairedCounters[archetype][side],
        `${unitId} changed without updating the reviewed release balance baseline`,
      );
    }
  }

  for (const buildingId of ['depot', 'barracks', 'workshop']) {
    const building = BUILDING_TYPES[buildingId];
    assert.deepEqual(
      { cost: building.cost, buildTime: building.buildTime },
      RELEASE_BALANCE_BASELINE.structures[buildingId],
      `${buildingId} changed without updating the reviewed release balance baseline`,
    );
  }
});

test('release candidate economy pacing remains tied to the authoritative economy profile', () => {
  const expected = RELEASE_BALANCE_BASELINE.economy;
  assert.equal(ECONOMY_BALANCE_SCHEMA_VERSION, expected.schemaVersion);
  assert.equal(ECONOMY_BALANCE_PROFILE_ID, expected.profileId);
  assert.deepEqual(ECONOMY_BALANCE_PROFILE.startingForce, expected.startingForce);
  assert.deepEqual(ECONOMY_BALANCE_PROFILE.affordability.maxSecondsByClass, expected.affordabilitySeconds);
  assert.deepEqual(
    Object.fromEntries(Object.entries(ECONOMY_BALANCE_PROFILE.missionBenchmarks)
      .map(([id, benchmark]) => [id, benchmark.maxCompletionSeconds])),
    expected.missionBenchmarks,
  );
});

test('release candidate AI difficulty changes decision quality without hidden stat cheats', () => {
  for (const id of ['recruit', 'regular', 'veteran', 'commander']) {
    const profile = AI_DIFFICULTY_PROFILES[id];
    assert.deepEqual(aiTuning(profile), RELEASE_BALANCE_BASELINE.ai[id]);
    assert.equal(profile.informationPolicy, RELEASE_BALANCE_BASELINE.ai.fairness.informationPolicy);
    assert.deepEqual(profile.fairness, {
      resourceMultiplier: 1,
      damageMultiplier: 1,
      healthMultiplier: 1,
      fullMapVision: false,
      ignoresFogOfWar: false,
    });
  }
});

test('release candidate campaign pressure and batch-simulation contract are versioned', () => {
  assert.equal(CAMPAIGN_BALANCE_VERSION, RELEASE_BALANCE_BASELINE.campaign.version);
  for (const id of ['story', 'standard', 'veteran']) {
    assert.deepEqual(CAMPAIGN_DIFFICULTY_BALANCE[id], RELEASE_BALANCE_BASELINE.campaign[id]);
  }
  assert.deepEqual(BALANCE_BATCH_KINDS, RELEASE_BALANCE_BASELINE.batchSimulation.batchKinds);
  assert.deepEqual(RELEASE_BALANCE_BASELINE.batchSimulation.batchIds, [
    'combat-mission',
    'economy-window',
    'mission-timing',
  ]);
  assert.equal(RELEASE_BALANCE_BASELINE.batchSimulation.requireDeterministicSeeds, true);
});
