import test from 'node:test';
import assert from 'node:assert/strict';

import { TEAM } from '../../src/config.js';
import {
  canTargetDomain,
  resolveDamageMultiplier,
  validateDefenseProfile,
  validateWeaponProfile,
} from '../../src/combat/combat-schema.js';
import {
  GARRISON_RESULTS,
  canEnterGarrison,
  createGarrisonState,
} from '../../src/combat/garrison-system.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import { UKRAINIAN_FIRES_PROFILE_IDS } from '../../src/content/ukrainian-fires.js';
import {
  UKRAINIAN_INFANTRY_BRANCH,
  UKRAINIAN_INFANTRY_ROLE_IDS,
  UKRAINIAN_INFANTRY_UNIT_IDS,
  availableUkrainianInfantryUnits,
  getUkrainianInfantryGarrisonDescriptor,
  getUkrainianInfantryProductionConfig,
  getUkrainianInfantryTransportDescriptor,
  getUkrainianInfantryUnit,
  getUkrainianInfantryUpgradeDescriptor,
  summarizeUkrainianInfantryTaskGroup,
  validateUkrainianInfantryBranch,
} from '../../src/content/ukrainian-infantry.js';
import { createCommandCapacitySnapshot } from '../../src/systems/command-capacity-system.js';
import { ensureProductionQueueState } from '../../src/systems/production-queue-system.js';
import { transportSlotCost } from '../../src/systems/transport-system.js';
import {
  UPGRADE_MODIFIER_OPERATIONS,
  createUpgradeDefinition,
  upgradeAppliesTo,
} from '../../src/systems/upgrade-modifier-system.js';

const clone = (value) => structuredClone(value);

function techRosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.ukraine.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines exactly the seven required current-main Ukrainian infantry roles', () => {
  assert.deepEqual(UKRAINIAN_INFANTRY_BRANCH.units.map((unit) => unit.id), UKRAINIAN_INFANTRY_UNIT_IDS);
  assert.deepEqual(UKRAINIAN_INFANTRY_BRANCH.units.map((unit) => unit.roleId), UKRAINIAN_INFANTRY_ROLE_IDS);
  assert.deepEqual(validateUkrainianInfantryBranch(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_INFANTRY_BRANCH), true);
  assert.equal(Object.isFrozen(UKRAINIAN_INFANTRY_BRANCH.units[0].weapons[0].profile), true);
  assert.equal(Object.isFrozen(UKRAINIAN_INFANTRY_BRANCH.units[0].upgradeDescriptor), true);
});

test('matches exact UFR-070 identities, producers, tiers, and ordered prerequisites', () => {
  const techNodes = techRosterNodes();
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units) {
    const node = techNodes.get(unit.id);
    assert.ok(node, `${unit.id} must exist in UFR-070`);
    assert.equal(unit.rosterNodeId, node.id);
    assert.equal(unit.tier, node.tier);
    assert.equal(unit.producer, node.producer);
    assert.deepEqual(unit.requires, node.requires);
  }
});

test('executes every weapon and defense profile through the UFR-031 public contract', () => {
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units) {
    assert.deepEqual(validateDefenseProfile(unit.durability.defenseProfile), []);
    for (const weapon of unit.weapons) {
      assert.deepEqual(validateWeaponProfile(weapon.profile), []);
      const targetDomain = weapon.profile.targetDomains[0];
      assert.equal(canTargetDomain(weapon.profile, targetDomain), true);
      assert.ok(resolveDamageMultiplier(weapon.profile, unit.durability.defenseProfile, targetDomain) > 0);
    }
  }
});

test('projects established production resources and command-capacity costs without parallel vocabulary', () => {
  const production = UKRAINIAN_INFANTRY_UNIT_IDS.map(getUkrainianInfantryProductionConfig);
  for (const config of production) {
    assert.deepEqual(Object.keys(config.cost).sort(), ['fuel', 'intel', 'metal']);
    assert.equal(config.pop, getUkrainianInfantryUnit(config.type).commandCapacityCost);
  }

  const building = {
    id: 'ua.infantry-center:test',
    queue: production.slice(0, 2).map((config, index) => ({
      id: `queue:${index}`,
      type: config.type,
      duration: 5,
      left: 5,
      cost: config.cost,
      pop: config.pop,
      reserved: true,
    })),
  };
  ensureProductionQueueState(building);
  assert.deepEqual(building.queue.map((item) => item.pop), production.slice(0, 2).map((item) => item.pop));
  assert.deepEqual(building.queue.map((item) => item.cost), production.slice(0, 2).map((item) => item.cost));

  const fielded = UKRAINIAN_INFANTRY_BRANCH.units.map((unit, index) => ({
    id: index + 1,
    type: unit.id,
    team: TEAM.UA,
    hp: 100,
    commandCapacityCost: unit.commandCapacityCost,
  }));
  const snapshot = createCommandCapacitySnapshot({
    units: fielded,
    buildings: [],
    player: { cap: 100 },
  }, { baseCapacity: 100 });
  assert.equal(
    snapshot.fielded,
    UKRAINIAN_INFANTRY_BRANCH.units.reduce((total, unit) => total + unit.commandCapacityCost, 0),
  );
  assert.equal(snapshot.reserved, 0);
});

test('executes transport and garrison compatibility through prerequisite public contracts', () => {
  const game = {
    unitStats: (type) => getUkrainianInfantryTransportDescriptor(type),
  };
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units) {
    assert.equal(
      transportSlotCost(game, { type: unit.id, team: TEAM.UA }),
      unit.mobility.transportSlots,
    );
  }

  const state = createGarrisonState({
    id: 'test-trench',
    x: 0,
    y: 0,
    team: TEAM.UA,
    garrisonKind: 'trench',
    garrisonCapacity: 6,
  });
  const line = {
    ...getUkrainianInfantryGarrisonDescriptor('ua.line-infantry'),
    id: 'line:test',
    team: TEAM.UA,
    hp: 100,
    x: 0,
    y: 0,
  };
  const airDefense = {
    ...getUkrainianInfantryGarrisonDescriptor('ua.mobile-sam'),
    id: 'sam:test',
    team: TEAM.UA,
    hp: 100,
    x: 0,
    y: 0,
  };
  assert.equal(canEnterGarrison(state, line).ok, true);
  const rejected = canEnterGarrison(state, airDefense);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, GARRISON_RESULTS.INVALID_UNIT);
});

test('exposes upgrade descriptors accepted by the UFR-062 target contract', () => {
  const readiness = createUpgradeDefinition({
    id: 'ua.infantry-readiness-test',
    target: {
      factions: ['ukraine'],
      tags: ['infantry'],
      requiresAbilities: ['cover-discipline'],
    },
    statModifiers: [{
      stat: 'sight',
      operation: UPGRADE_MODIFIER_OPERATIONS.ADD,
      value: 10,
    }],
  });
  assert.equal(upgradeAppliesTo(readiness, getUkrainianInfantryUpgradeDescriptor('ua.line-infantry')), true);
  assert.equal(upgradeAppliesTo(readiness, getUkrainianInfantryUpgradeDescriptor('ua.anti-armor-team')), false);
});

test('keeps exact ua.mobile-sam ownership in UFR-071 and subordinate variants in UFR-074', () => {
  assert.equal(getUkrainianInfantryUnit('ua.mobile-sam').rosterNodeId, 'ua.mobile-sam');
  assert.equal(UKRAINIAN_FIRES_PROFILE_IDS.includes('ua.mobile-sam'), false);
  const variants = UKRAINIAN_FIRES_PROFILE_IDS.filter((id) => id.startsWith('ua.mobile-sam.'));
  assert.deepEqual(variants, ['ua.mobile-sam.point-defense', 'ua.mobile-sam.medium-range']);
});

test('resolves unlocks and task-group doctrine deterministically', () => {
  assert.deepEqual(availableUkrainianInfantryUnits([]), []);
  assert.deepEqual(
    availableUkrainianInfantryUnits(['ua.command-post']),
    ['ua.combat-engineers', 'ua.command-team'],
  );
  assert.deepEqual(
    availableUkrainianInfantryUnits(['ua.command-post', 'ua.infantry-center']),
    ['ua.combat-engineers', 'ua.line-infantry', 'ua.anti-armor-team', 'ua.casevac-team', 'ua.command-team'],
  );

  const summary = summarizeUkrainianInfantryTaskGroup([
    'ua.line-infantry',
    'ua.anti-armor-team',
    'ua.recon-team',
    'ua.casevac-team',
    'ua.command-team',
  ]);
  assert.equal(summary.doctrine.distributedCommand, true);
  assert.equal(summary.doctrine.contactToAction, true);
  assert.equal(summary.doctrine.casualtyPreservation, true);
  assert.equal(summary.doctrine.combinedArmsReady, true);
  assert.deepEqual(summary.missingCoreRoles, []);
  assert.deepEqual(summary.cost, { metal: 455, fuel: 0, intel: 125 });
  assert.equal(summary.totalCommandCapacityCost, 10);
  assert.equal(Object.isFrozen(summary), true);
});

test('rejects dependency drift, parallel resources, malformed adapters, and duplicate identities', () => {
  const invalid = clone(UKRAINIAN_INFANTRY_BRANCH);
  invalid.units[0].producer = 'ua.infantry-center';
  invalid.units[1].commandCapacityCost = 4;
  invalid.units[2].cost.supplies = 10;
  invalid.units[3].weapons[0].profile.damageClass = 'unknown-damage';
  invalid.units[4].mobility.garrisonable = false;
  invalid.units[4].mobility.garrisonSlots = 1;
  invalid.units[5].counterDomains = ['unknown-counter'];
  invalid.units[6].id = 'ua.mobile-sam';

  const errors = validateUkrainianInfantryBranch(invalid);
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('capacityCost compatibility alias')));
  assert.ok(errors.some((error) => error.includes('cost must use only metal, fuel, and intel')));
  assert.ok(errors.some((error) => error.includes('invalid UFR-031 profile')));
  assert.ok(errors.some((error) => error.includes('non-garrisonable units must use zero garrisonSlots')));
  assert.ok(errors.some((error) => error.includes('counterDomains must use UFR-070 vocabulary')));
  assert.ok(errors.some((error) => error.includes('duplicate unit id: ua.mobile-sam')));
  assert.ok(errors.some((error) => error.includes('missing required unit: ua.command-team')));
  assert.ok(errors.some((error) => error.includes('exact ua.mobile-sam identity must have one UFR-071 owner')));
});

test('lookup and input boundaries fail explicitly', () => {
  assert.throws(() => getUkrainianInfantryUnit('ua.unknown'), /Unknown Ukrainian infantry unit/);
  assert.throws(() => availableUkrainianInfantryUnits('ua.command-post'), /must be an array/);
  assert.throws(() => summarizeUkrainianInfantryTaskGroup('ua.line-infantry'), /must be an array/);
  assert.throws(() => summarizeUkrainianInfantryTaskGroup(['ua.unknown']), /Unknown Ukrainian infantry unit/);
  assert.throws(() => summarizeUkrainianInfantryTaskGroup(['ua.line-infantry', 'ua.line-infantry']), /duplicate unit id/);
});
