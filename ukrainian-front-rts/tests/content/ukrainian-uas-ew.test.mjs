import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirDefenseState, evaluateEngagementEnvelope, AIR_TARGET_CLASSES } from '../../src/combat/air-defense-system.js';
import { createDroneState, evaluateDroneLink } from '../../src/combat/drone-ew-system.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  UKRAINIAN_UAS_EW,
  UKRAINIAN_UAS_EW_PROFILE_IDS,
  UAS_EW_CAPABILITIES,
  availableUkrainianUasEwProfiles,
  getUkrainianAirDefenseRuntimeConfig,
  getUkrainianDroneRuntimeConfig,
  getUkrainianUasEwProfile,
  resolveUasEwTaskGroup,
  validateUkrainianUasEw,
} from '../../src/content/ukrainian-uas-ew.js';

const clone = (value) => structuredClone(value);

function rosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.ukraine.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines exactly six canonical profiles and validates deeply', () => {
  assert.deepEqual(UKRAINIAN_UAS_EW.profiles.map((record) => record.id), UKRAINIAN_UAS_EW_PROFILE_IDS);
  assert.deepEqual(validateUkrainianUasEw(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_UAS_EW), true);
  assert.equal(Object.isFrozen(UKRAINIAN_UAS_EW.profiles[0].droneConfig), true);
  assert.equal(Object.isFrozen(UKRAINIAN_UAS_EW.profiles[0].capabilities[0].parameters), true);
});

test('maps every profile to exact UFR-070 roster ownership', () => {
  const nodes = rosterNodes();
  for (const record of UKRAINIAN_UAS_EW.profiles) {
    const node = nodes.get(record.rosterNodeId);
    assert.ok(node, `${record.id} needs a roster node`);
    assert.equal(record.tier, node.tier);
    assert.equal(record.producer, node.producer);
    assert.deepEqual(record.requires, node.requires);
    assert.ok(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`));
  }
});

test('produces UFR-038-compatible drone configs', () => {
  const config = getUkrainianDroneRuntimeConfig('ua.recon-drone.fpv-strike');
  const state = createDroneState(config);
  assert.equal(state.payload, 1);
  const connected = evaluateDroneLink({ distance: 400, relayBonus: 0, jammerStrength: 0.2 }, config);
  assert.equal(connected.connected, true);
  const jammed = evaluateDroneLink({ distance: 510, relayBonus: 0, jammerStrength: 1 }, config);
  assert.equal(jammed.connected, false);
  assert.equal(config.consumedOnStrike, true);
  assert.equal(config.requiresSpottedTarget, true);
});

test('produces UFR-039-compatible counter-UAS config and target classes', () => {
  const profile = getUkrainianUasEwProfile('ua.ew-team.counter-uas');
  const config = getUkrainianAirDefenseRuntimeConfig(profile.id);
  const state = createAirDefenseState(config);
  assert.equal(state.ammunition, 6);
  assert.deepEqual(profile.airTargetPriority, [
    AIR_TARGET_CLASSES.LOITERING_MUNITION,
    AIR_TARGET_CLASSES.STRIKE_DRONE,
    AIR_TARGET_CLASSES.RECON_DRONE,
  ]);
  assert.equal(evaluateEngagementEnvelope({ x: 0, y: 0 }, { x: 100, y: 0, altitude: 50 }, config).ok, true);
  assert.equal(evaluateEngagementEnvelope({ x: 0, y: 0 }, { x: 250, y: 0, altitude: 50 }, config).reason, 'outside-maximum-range');
});

test('availability includes variant technologies instead of overwriting roster prerequisites', () => {
  assert.deepEqual(availableUkrainianUasEwProfiles(['ua.uas-ew-cell']), ['ua.recon-drone']);
  assert.deepEqual(availableUkrainianUasEwProfiles([
    'ua.uas-ew-cell',
    'ua.shared-target-network',
    'ua.spectrum-agility',
    'ua.layered-air-defense',
  ]), UKRAINIAN_UAS_EW_PROFILE_IDS);
});

test('legacy aliases resolve to canonical IDs without duplicating the contract', () => {
  assert.equal(getUkrainianUasEwProfile('ua.fpv-strike-team').id, 'ua.recon-drone.fpv-strike');
  const result = resolveUasEwTaskGroup(
    ['ua.recon-drone', 'ua.fpv-strike-team', 'ua.targeting-cell'],
    ['ua.uas-ew-cell', 'ua.shared-target-network', 'ua.spectrum-agility'],
  );
  assert.deepEqual(result.profileIds, ['ua.recon-drone', 'ua.recon-drone.fpv-strike', 'ua.ew-team.targeting']);
  assert.equal(result.doctrine.reconnaissanceStrikeChain, true);
  assert.deepEqual(result.cost, { metal: 230, fuel: 20, intel: 130 });
});

test('task-group doctrine reports actual capability chains, not an arbitrary average', () => {
  const result = resolveUasEwTaskGroup(
    UKRAINIAN_UAS_EW_PROFILE_IDS,
    ['ua.uas-ew-cell', 'ua.shared-target-network', 'ua.spectrum-agility', 'ua.layered-air-defense'],
  );
  assert.deepEqual(result.missingCapabilities, []);
  assert.equal(result.doctrine.reconnaissanceStrikeChain, true);
  assert.equal(result.doctrine.resilientRelay, true);
  assert.equal(result.doctrine.layeredCounterUas, true);
  assert.equal(result.doctrine.completeNetwork, true);
  assert.deepEqual(result.capabilities, [...UAS_EW_CAPABILITIES].sort());
  assert.equal(Object.isFrozen(result), true);
});

test('validator rejects tech-tree drift, invalid runtime fields, and broken links', () => {
  const invalid = clone(UKRAINIAN_UAS_EW);
  invalid.profiles[0].producer = 'ua.command-post';
  invalid.profiles[1].droneConfig.linkHardening = 2;
  invalid.profiles[2].variantRequires = ['ua.unknown'];
  invalid.profiles[3].supportLinks = ['ua.unknown'];
  invalid.profiles[4].airTargetPriority = ['strike-drone'];
  invalid.profiles[5].roleId = 'relay';
  const errors = validateUkrainianUasEw(invalid);
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('droneConfig.linkHardening')));
  assert.ok(errors.some((error) => error.includes('variantRequires contains an unknown')));
  assert.ok(errors.some((error) => error.includes('unknown support link')));
  assert.ok(errors.some((error) => error.includes('unknown UFR-039 class')));
  assert.ok(errors.some((error) => error.includes('duplicate roleId')));
  assert.ok(errors.some((error) => error.includes('missing capability targeting-support')));
});

test('input and lookup boundaries fail explicitly', () => {
  assert.throws(() => getUkrainianUasEwProfile('ua.unknown'), /Unknown Ukrainian UAS\/EW profile/);
  assert.throws(() => getUkrainianDroneRuntimeConfig('ua.ew-team'), /not an airborne UFR-038 profile/);
  assert.throws(() => getUkrainianAirDefenseRuntimeConfig('ua.recon-drone'), /not a UFR-039 counter-UAS profile/);
  assert.throws(() => availableUkrainianUasEwProfiles('ua.uas-ew-cell'), /must be an array/);
  assert.throws(() => resolveUasEwTaskGroup('ua.recon-drone'), /must be an array/);
  assert.throws(() => resolveUasEwTaskGroup(['ua.fpv-strike-team', 'ua.recon-drone.fpv-strike'], []), /duplicate profile id/);
});
