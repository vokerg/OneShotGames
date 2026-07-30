import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  UKRAINIAN_INFANTRY_BRANCH,
  UKRAINIAN_INFANTRY_ROLE_IDS,
  UKRAINIAN_INFANTRY_UNIT_IDS,
  availableUkrainianInfantryUnits,
  getUkrainianInfantryUnit,
  summarizeUkrainianInfantryTaskGroup,
  validateUkrainianInfantryBranch,
} from '../../src/content/ukrainian-infantry.js';

const clone = (value) => structuredClone(value);

function techRosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.ukraine.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines exactly the seven required Ukrainian infantry/support roles', () => {
  assert.deepEqual(UKRAINIAN_INFANTRY_BRANCH.units.map((unit) => unit.id), UKRAINIAN_INFANTRY_UNIT_IDS);
  assert.deepEqual(UKRAINIAN_INFANTRY_BRANCH.units.map((unit) => unit.roleId), UKRAINIAN_INFANTRY_ROLE_IDS);
  assert.deepEqual(validateUkrainianInfantryBranch(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_INFANTRY_BRANCH), true);
  assert.equal(Object.isFrozen(UKRAINIAN_INFANTRY_BRANCH.units[0].capabilities[0].parameters), true);
});

test('matches UFR-070 roster IDs, tiers, producers, and prerequisites', () => {
  const techNodes = techRosterNodes();
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units) {
    const node = techNodes.get(unit.id);
    assert.ok(node, `${unit.id} must exist in UFR-070`);
    assert.equal(unit.tier, node.tier);
    assert.equal(unit.producer, node.producer);
    assert.deepEqual(unit.requires, node.requires);
  }
});

test('keeps every role mechanically distinct and exposes readable counterplay', () => {
  const capabilitySignatures = new Set();
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units) {
    assert.ok(unit.capabilities.length >= 3, `${unit.id} needs at least three capabilities`);
    assert.ok(unit.counters.length >= 1, `${unit.id} needs a counter domain`);
    assert.ok(unit.vulnerabilities.length >= 1, `${unit.id} needs a vulnerability`);
    assert.ok(unit.playerUse.length > 40, `${unit.id} needs actionable player guidance`);
    const signature = unit.capabilities.map((entry) => entry.id).sort().join('|');
    assert.equal(capabilitySignatures.has(signature), false, `${unit.id} duplicates another role's capability set`);
    capabilitySignatures.add(signature);
  }
  assert.deepEqual(getUkrainianInfantryUnit('ua.anti-armor-team').counters, ['light-vehicles', 'armor']);
  assert.deepEqual(getUkrainianInfantryUnit('ua.mobile-sam').weapons[0].targetDomains, ['air']);
  assert.equal(getUkrainianInfantryUnit('ua.recon-team').signature, 'very-low');
  assert.equal(getUkrainianInfantryUnit('ua.casevac-team').capabilities[0].id, 'casualty-stabilization');
});

test('resolves available units from completed UFR-070 nodes deterministically', () => {
  assert.deepEqual(availableUkrainianInfantryUnits([]), []);
  assert.deepEqual(
    availableUkrainianInfantryUnits(['ua.command-post']),
    ['ua.combat-engineers', 'ua.command-team'],
  );
  assert.deepEqual(
    availableUkrainianInfantryUnits(['ua.command-post', 'ua.infantry-center']),
    ['ua.combat-engineers', 'ua.line-infantry', 'ua.anti-armor-team', 'ua.casevac-team', 'ua.command-team'],
  );
  assert.deepEqual(
    availableUkrainianInfantryUnits([
      'ua.command-post',
      'ua.infantry-center',
      'ua.distributed-c2',
      'ua.air-defense-site',
      'ua.layered-air-defense',
    ]),
    UKRAINIAN_INFANTRY_UNIT_IDS,
  );
});

test('summarizes task-group doctrine without hidden global bonuses', () => {
  const incomplete = summarizeUkrainianInfantryTaskGroup(['ua.line-infantry', 'ua.anti-armor-team']);
  assert.equal(incomplete.doctrine.combinedArmsReady, false);
  assert.deepEqual(incomplete.missingCoreRoles, ['reconnaissance', 'command-support']);
  assert.equal(incomplete.totalCapacityCost, 4);

  const complete = summarizeUkrainianInfantryTaskGroup([
    'ua.line-infantry',
    'ua.anti-armor-team',
    'ua.recon-team',
    'ua.casevac-team',
    'ua.command-team',
  ]);
  assert.equal(complete.doctrine.distributedCommand, true);
  assert.equal(complete.doctrine.contactToAction, true);
  assert.equal(complete.doctrine.casualtyPreservation, true);
  assert.equal(complete.doctrine.combinedArmsReady, true);
  assert.ok(complete.doctrine.supportLinkPairs >= 4);
  assert.deepEqual(complete.missingCoreRoles, []);
  assert.equal(Object.isFrozen(complete), true);
});

test('rejects drift from the stable branch and tech-tree contract', () => {
  const invalid = clone(UKRAINIAN_INFANTRY_BRANCH);
  invalid.units[0].roleId = 'line-infantry';
  invalid.units[1].producer = 'ua.command-post';
  invalid.units[2].weapons[0].minimumRange = 999;
  invalid.units[3].supportLinks = ['ua.unknown'];
  invalid.units[4].capabilities.push(clone(invalid.units[4].capabilities[0]));
  invalid.units[5].counters = ['unknown-domain'];
  invalid.units.pop();
  const errors = validateUkrainianInfantryBranch(invalid);
  assert.ok(errors.some((error) => error.includes('duplicate roleId')));
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('minimumRange exceeds range')));
  assert.ok(errors.some((error) => error.includes('supportLinks contain an unknown unit')));
  assert.ok(errors.some((error) => error.includes('duplicate capability')));
  assert.ok(errors.some((error) => error.includes('counters are invalid')));
  assert.ok(errors.some((error) => error.includes('missing required unit: ua.command-team')));
  assert.ok(errors.some((error) => error.includes('missing required role: command-support')));
});

test('lookup and input boundaries fail explicitly', () => {
  assert.throws(() => getUkrainianInfantryUnit('ua.unknown'), /Unknown Ukrainian infantry unit/);
  assert.throws(() => availableUkrainianInfantryUnits('ua.command-post'), /must be an array/);
  assert.throws(() => summarizeUkrainianInfantryTaskGroup('ua.line-infantry'), /must be an array/);
  assert.throws(() => summarizeUkrainianInfantryTaskGroup(['ua.unknown']), /Unknown Ukrainian infantry unit/);
});
