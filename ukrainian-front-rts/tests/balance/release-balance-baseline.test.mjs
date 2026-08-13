import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DIFFICULTY_PROFILES } from '../../src/ai/ai-difficulty-profiles.js';
import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES, UPGRADES, WORLD } from '../../src/config.js';
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

function researchStats(upgrade) {
  return {
    tier: upgrade.tier,
    ...(upgrade.requires ? { requires: upgrade.requires } : {}),
    applies: upgrade.applies,
    cost: upgrade.cost,
    mods: upgrade.mods,
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

function teamName(team) {
  if (team === TEAM.UA) return 'ukraine';
  if (team === TEAM.RU) return 'russia';
  throw new Error(`Unexpected battlefield team: ${team}`);
}

function battlefieldSnapshot(missionIndex) {
  const harness = createSimulationHarness({ simulationSeed: 'release-balance-map-review' });
  const state = harness.startScenario({ missionIndex, seed: 'release-balance-map-review' });
  const terrainTileCounts = harness.game.terrain.reduce((counts, tile) => {
    if (tile === 0) counts.neutral += 1;
    else if (tile === 1) counts.lowBand += 1;
    else if (tile === 2) counts.highBand += 1;
    else throw new Error(`Unexpected terrain tile class: ${tile}`);
    return counts;
  }, { neutral: 0, lowBand: 0, highBand: 0 });

  return {
    world: { width: WORLD.w, height: WORLD.h, tile: WORLD.tile },
    terrainTileCounts,
    road: harness.game.road.map((point) => [...point]),
    resources: state.nodes.map((node) => ({
      x: node.x,
      y: node.y,
      kind: node.kind,
      amount: node.amount,
      label: node.label,
    })),
    buildings: state.buildings.map((building) => ({
      type: building.type,
      team: teamName(building.team),
      x: building.x,
      y: building.y,
    })),
    fixedNonHeroUnits: state.units
      .filter((unit) => !UNIT_TYPES[unit.type]?.hero)
      .map((unit) => ({
        type: unit.type,
        team: teamName(unit.team),
        x: unit.x,
        y: unit.y,
      })),
  };
}

function missionBalanceSnapshot(mission) {
  return {
    id: mission.id,
    objectives: [...mission.objectives],
    start: { ...mission.start },
    waves: { ...mission.waves },
  };
}

test('release candidate combat, structure, and research values do not drift silently', () => {
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

  assert.deepEqual(Object.keys(UPGRADES).sort(), Object.keys(RELEASE_BALANCE_BASELINE.research).sort());
  for (const [upgradeId, expected] of Object.entries(RELEASE_BALANCE_BASELINE.research)) {
    assert.deepEqual(
      researchStats(UPGRADES[upgradeId]),
      expected,
      `${upgradeId} research changed without updating the reviewed release balance baseline`,
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

test('all release missions preserve the reviewed battlefield, resource, chokepoint, and spawn geometry', () => {
  const expected = RELEASE_BALANCE_BASELINE.mapReview;
  assert.equal(expected.model, 'authored-asymmetric-pve');
  assert.equal(expected.review.hiddenStartingSideCombatModifiers, false);

  for (let missionIndex = 0; missionIndex < MISSIONS.length; missionIndex += 1) {
    const actual = battlefieldSnapshot(missionIndex);
    assert.deepEqual(actual.world, expected.world, `Mission ${missionIndex} world geometry drifted`);
    assert.deepEqual(actual.terrainTileCounts, expected.terrainTileCounts, `Mission ${missionIndex} terrain distribution drifted`);
    assert.deepEqual(actual.road, expected.road, `Mission ${missionIndex} operational/chokepoint axis drifted`);
    assert.deepEqual(actual.resources, expected.resources, `Mission ${missionIndex} resource geometry drifted`);
    assert.deepEqual(actual.buildings, expected.buildings, `Mission ${missionIndex} base spawn geometry drifted`);
    assert.deepEqual(actual.fixedNonHeroUnits, expected.fixedNonHeroUnits, `Mission ${missionIndex} fixed force spawns drifted`);
  }
});

test('release mission objectives, starting resources, and wave pressure remain part of the map-balance review', () => {
  assert.deepEqual(MISSIONS.map(missionBalanceSnapshot), RELEASE_BALANCE_BASELINE.mapReview.missions);
  assert.equal(RELEASE_BALANCE_BASELINE.mapReview.missions.length, 3);
  assert.match(RELEASE_BALANCE_BASELINE.mapReview.review.exploitAssessment, /No release P0\/P1 placement exploit/);
});
