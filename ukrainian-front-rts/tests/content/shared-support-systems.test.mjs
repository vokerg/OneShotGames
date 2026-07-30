import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_SUPPORT_SYSTEMS,
  SUPPORT_ROLE_IDS,
  availableSupportProfiles,
  getFactionSupportProfiles,
  getSupportProfile,
  summarizeSupportTaskGroup,
  validateSharedSupportSystems,
} from '../../src/content/shared-support-systems.js';

test('catalog validates and is deeply immutable', () => {
  assert.deepEqual(validateSharedSupportSystems(), []);
  assert.ok(Object.isFrozen(SHARED_SUPPORT_SYSTEMS));
  assert.ok(Object.isFrozen(SHARED_SUPPORT_SYSTEMS.profiles));
  assert.ok(SHARED_SUPPORT_SYSTEMS.profiles.every((profile) => Object.isFrozen(profile.mechanics)));
});

test('both factions cover every required support role with distinct doctrine', () => {
  for (const faction of ['ukraine', 'russia']) {
    const profiles = getFactionSupportProfiles(faction).map(getSupportProfile);
    assert.deepEqual([...new Set(profiles.map((profile) => profile.roleId))].sort(), [...SUPPORT_ROLE_IDS].sort());
    assert.equal(profiles.length, 7);
  }
  assert.notEqual(getSupportProfile('ua.support.distributed-command').doctrine, getSupportProfile('ru.support.regimental-command').doctrine);
});

test('availability follows exact ordered UFR-070 prerequisites', () => {
  assert.deepEqual(availableSupportProfiles('ukraine', ['ua.command-post']), [
    'ua.support.distributed-command',
    'ua.support.off-map-coordination',
  ]);
  assert.deepEqual(availableSupportProfiles('ukraine', ['ua.logistics-hub']), [
    'ua.support.mobile-logistics',
    'ua.support.forward-resupply',
  ]);
  assert.deepEqual(availableSupportProfiles('russia', ['ru.armored-park', 'ru.replacement-depth']), [
    'ru.support.mass-transport',
    'ru.support.repair-tractor',
  ]);
});

test('transport and recovery mechanics preserve dependency contracts', () => {
  const transport = getSupportProfile('ua.support.protected-transport');
  assert.equal(transport.mechanics.blockedExitPolicy, 'retain-cargo');
  assert.equal(transport.mechanics.destructionPolicy, 'catastrophic-loss');
  const recovery = getSupportProfile('ru.support.repair-tractor');
  assert.equal(recovery.mechanics.modifierHook, 'ru.replacement-depth');
  assert.ok(recovery.mechanics.fieldRepairCap <= 1);
});

test('task-group summary exposes readiness and exact totals', () => {
  const ids = getFactionSupportProfiles('ukraine');
  const summary = summarizeSupportTaskGroup(ids);
  assert.equal(summary.faction, 'ukraine');
  assert.equal(summary.combinedSupportReady, true);
  assert.deepEqual(summary.missingRoles, []);
  assert.equal(summary.totalCapacityCost, ids.map(getSupportProfile).reduce((total, profile) => total + profile.capacityCost, 0));
  assert.ok(summary.supportLinkPairs >= 5);
});

test('partial task group reports missing support roles deterministically', () => {
  const summary = summarizeSupportTaskGroup(['ru.support.supply-column', 'ru.support.forward-ammunition']);
  assert.equal(summary.sustainmentReady, true);
  assert.equal(summary.mobilityReady, false);
  assert.deepEqual(summary.roles, ['logistics', 'resupply']);
  assert.deepEqual(summary.missingRoles, ['transport', 'command', 'recovery', 'bridging', 'off-map-support']);
});

test('validation detects compatibility and completeness defects', () => {
  const bad = structuredClone(SHARED_SUPPORT_SYSTEMS);
  bad.profiles[0].producer = 'ua.command-post';
  bad.profiles.pop();
  const errors = validateSharedSupportSystems(bad);
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('russia: missing support role off-map-support')));
});

test('invalid lookup, mixed factions, and duplicate groups fail clearly', () => {
  assert.throws(() => getSupportProfile('missing'), /Unknown support profile/);
  assert.throws(() => availableSupportProfiles('unknown', []), /Unknown support faction/);
  assert.throws(() => summarizeSupportTaskGroup(['ua.support.mobile-logistics', 'ua.support.mobile-logistics']), /duplicate/);
  assert.throws(() => summarizeSupportTaskGroup(['ua.support.mobile-logistics', 'ru.support.supply-column']), /cannot mix factions/);
});
