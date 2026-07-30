import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE_CLASSES } from '../../src/combat/combat-schema.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  RUSSIAN_INFANTRY_BRANCH,
  RUSSIAN_INFANTRY_ROLE_IDS,
  RUSSIAN_INFANTRY_UNIT_IDS,
  availableRussianInfantryUnits,
  getRussianInfantryUnit,
  getRussianInfantryVariants,
  summarizeRussianInfantryTaskGroup,
  validateRussianInfantryBranch,
} from '../../src/content/russian-infantry.js';

const clone = (value) => structuredClone(value);

function techRosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.russia.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines the complete immutable Russian infantry role set', () => {
  assert.deepEqual(RUSSIAN_INFANTRY_BRANCH.units.map((unit) => unit.id), RUSSIAN_INFANTRY_UNIT_IDS);
  assert.deepEqual(RUSSIAN_INFANTRY_BRANCH.units.map((unit) => unit.roleId), RUSSIAN_INFANTRY_ROLE_IDS);
  assert.deepEqual(validateRussianInfantryBranch(), []);
  assert.equal(Object.isFrozen(RUSSIAN_INFANTRY_BRANCH), true);
  assert.equal(Object.isFrozen(RUSSIAN_INFANTRY_BRANCH.units[0].capabilities[0].parameters), true);
});

test('maps variants to exact UFR-070 tiers, producers, and prerequisites', () => {
  const techNodes = techRosterNodes();
  for (const unit of RUSSIAN_INFANTRY_BRANCH.units) {
    const node = techNodes.get(unit.rosterNodeId);
    assert.ok(node, `${unit.rosterNodeId} must exist in UFR-070`);
    assert.equal(unit.tier, node.tier);
    assert.equal(unit.producer, node.producer);
    assert.deepEqual(unit.requires, node.requires);
  }
  assert.deepEqual(
    getRussianInfantryVariants('ru.assault-group'),
    ['ru.assault-group.shock', 'ru.assault-group.anti-armor'],
  );
});

test('keeps manpower, assault, reconnaissance, engineering, medical, and anti-armor roles distinct', () => {
  const signatures = new Set();
  for (const unit of RUSSIAN_INFANTRY_BRANCH.units) {
    assert.ok(unit.capabilities.length >= 3);
    assert.ok(unit.counters.length >= 1);
    assert.ok(unit.vulnerabilities.length >= 1);
    assert.ok(unit.playerUse.length >= 40);
    const signature = unit.capabilities.map((entry) => entry.id).sort().join('|');
    assert.equal(signatures.has(signature), false, `${unit.id} duplicates a capability set`);
    signatures.add(signature);
  }
  assert.equal(getRussianInfantryUnit('ru.motor-rifle-squad').squadSize, 10);
  assert.equal(getRussianInfantryUnit('ru.assault-group.shock').durability.suppressionResistance > 1, true);
  assert.equal(getRussianInfantryUnit('ru.scout-section').signature, 'low');
  assert.equal(getRussianInfantryUnit('ru.medical-team').capabilities[2].id, 'replacement-continuity');
  assert.equal(getRussianInfantryUnit('ru.assault-group.anti-armor').weapons[0].damageClass, DAMAGE_CLASSES.SHAPED_CHARGE);
});

test('preserves explicit command, reserve, replacement, and counterplay limits', () => {
  const command = getRussianInfantryUnit('ru.command-group');
  const antiArmor = getRussianInfantryUnit('ru.assault-group.anti-armor');
  const line = getRussianInfantryUnit('ru.motor-rifle-squad');
  assert.equal(command.capabilities.find((entry) => entry.id === 'sector-preparation').parameters.maximumSectors, 2);
  assert.equal(antiArmor.capabilities.find((entry) => entry.id === 'reserve-commitment').parameters.requiresCommandRelease, true);
  assert.equal(line.replacement.weight < antiArmor.replacement.weight, true);
  assert.deepEqual(antiArmor.counters, ['light-vehicles', 'armor']);
  assert.ok(command.vulnerabilities.includes('reconnaissance'));
});

test('resolves available variants deterministically from completed UFR-070 nodes', () => {
  assert.deepEqual(availableRussianInfantryUnits([]), []);
  assert.deepEqual(
    availableRussianInfantryUnits(['ru.regimental-command']),
    ['ru.engineer-sappers', 'ru.command-group'],
  );
  assert.deepEqual(
    availableRussianInfantryUnits(['ru.regimental-command', 'ru.motor-rifle-barracks']),
    [
      'ru.engineer-sappers',
      'ru.command-group',
      'ru.motor-rifle-squad',
      'ru.assault-group.shock',
      'ru.assault-group.anti-armor',
      'ru.medical-team',
    ],
  );
  assert.deepEqual(
    availableRussianInfantryUnits(['ru.regimental-command', 'ru.motor-rifle-barracks', 'ru.echelon-command']),
    RUSSIAN_INFANTRY_UNIT_IDS,
  );
});

test('summarizes Echeloned Pressure readiness without hidden global bonuses', () => {
  const incomplete = summarizeRussianInfantryTaskGroup(['ru.motor-rifle-squad', 'ru.assault-group.shock']);
  assert.equal(incomplete.doctrine.successiveEchelonReady, false);
  assert.deepEqual(incomplete.missingCoreRoles, ['command-support']);
  assert.equal(incomplete.totalPersonnel, 18);

  const complete = summarizeRussianInfantryTaskGroup([
    'ru.engineer-sappers',
    'ru.command-group',
    'ru.motor-rifle-squad',
    'ru.assault-group.shock',
    'ru.assault-group.anti-armor',
    'ru.scout-section',
    'ru.medical-team',
  ]);
  assert.equal(complete.doctrine.echelonCommand, true);
  assert.equal(complete.doctrine.replacementContinuity, true);
  assert.equal(complete.doctrine.preparedAssault, true);
  assert.equal(complete.doctrine.armorReserve, true);
  assert.equal(complete.doctrine.successiveEchelonReady, true);
  assert.ok(complete.doctrine.supportLinkPairs >= 8);
  assert.deepEqual(complete.missingCoreRoles, []);
  assert.equal(Object.isFrozen(complete), true);
  assert.equal(complete.totalCost.metal, 586);
});

test('rejects drift from stable IDs, variants, policy shape, and tech-tree ownership', () => {
  const invalid = clone(RUSSIAN_INFANTRY_BRANCH);
  invalid.units[0].roleId = 'line-infantry';
  invalid.units[1].producer = 'ru.motor-rifle-barracks';
  invalid.units[2].replacement.weight = 0;
  invalid.units[3].weapons[1].minimumRange = 999;
  invalid.units[4].supportLinks = ['ru.unknown'];
  invalid.units[5].capabilities.push(clone(invalid.units[5].capabilities[0]));
  invalid.units[6].counters = ['unknown-domain'];
  invalid.units.pop();
  const errors = validateRussianInfantryBranch(invalid);
  assert.ok(errors.some((error) => error.includes('duplicate roleId')));
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('replacement.weight must be positive')));
  assert.ok(errors.some((error) => error.includes('minimumRange exceeds range')));
  assert.ok(errors.some((error) => error.includes('supportLinks contain an unknown unit')));
  assert.ok(errors.some((error) => error.includes('duplicate capability')));
  assert.ok(errors.some((error) => error.includes('missing required unit: ru.medical-team')));
  assert.ok(errors.some((error) => error.includes('missing required role: medical')));
});

test('lookup and input boundaries fail explicitly', () => {
  assert.throws(() => getRussianInfantryUnit('ru.unknown'), /Unknown Russian infantry unit/);
  assert.throws(() => getRussianInfantryVariants('ru.unknown'), /Unknown Russian infantry roster node/);
  assert.throws(() => getRussianInfantryVariants(''), /non-empty string/);
  assert.throws(() => availableRussianInfantryUnits('ru.regimental-command'), /must be an array/);
  assert.throws(() => summarizeRussianInfantryTaskGroup('ru.motor-rifle-squad'), /must be an array/);
  assert.throws(() => summarizeRussianInfantryTaskGroup(['ru.unknown']), /Unknown Russian infantry unit/);
  assert.throws(() => summarizeRussianInfantryTaskGroup(['ru.motor-rifle-squad', 'ru.motor-rifle-squad']), /duplicate unit id/);
});
