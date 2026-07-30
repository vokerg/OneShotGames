import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTILLERY_STATES,
  beginSetup,
  canFire,
  createArtilleryState,
  fireSalvoRound,
  tickArtillery,
} from '../../src/combat/artillery-system.js';
import {
  AIR_TARGET_CLASSES,
  createAirDefenseState,
  evaluateEngagementEnvelope,
} from '../../src/combat/air-defense-system.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  UKRAINIAN_FIRES_BRANCH,
  UKRAINIAN_FIRES_PROFILE_IDS,
  UKRAINIAN_FIRES_ROLE_IDS,
  availableUkrainianFiresProfiles,
  composeUkrainianFiresGroup,
  getAirDefenseRuntimeConfig,
  getArtilleryRuntimeConfig,
  getUkrainianFiresProfile,
  validateUkrainianFiresBranch,
} from '../../src/content/ukrainian-fires.js';

const clone = (value) => structuredClone(value);

function rosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.ukraine.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines exactly five deeply immutable fires and air-defense profiles', () => {
  assert.deepEqual(UKRAINIAN_FIRES_BRANCH.profiles.map((record) => record.id), UKRAINIAN_FIRES_PROFILE_IDS);
  assert.deepEqual(UKRAINIAN_FIRES_BRANCH.profiles.map((record) => record.roleId), UKRAINIAN_FIRES_ROLE_IDS);
  assert.deepEqual(validateUkrainianFiresBranch(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_FIRES_BRANCH), true);
  assert.equal(Object.isFrozen(UKRAINIAN_FIRES_BRANCH.profiles[0].artilleryConfig), true);
  assert.equal(Object.isFrozen(UKRAINIAN_FIRES_BRANCH.profiles[3].airDefenseConfig), true);
});

test('maps all variants to exact UFR-070 roster ownership', () => {
  const nodes = rosterNodes();
  for (const record of UKRAINIAN_FIRES_BRANCH.profiles) {
    const node = nodes.get(record.rosterNodeId);
    assert.ok(node, `${record.id} needs a roster node`);
    assert.equal(record.tier, node.tier);
    assert.equal(record.producer, node.producer);
    assert.deepEqual(record.requires, node.requires);
    assert.ok(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`));
  }
  assert.equal(UKRAINIAN_FIRES_BRANCH.profiles.some((record) => record.id === 'ua.mobile-sam'), false);
});

test('builds UFR-037 runtime configs with distance-sensitive spotting', () => {
  const nearConfig = getArtilleryRuntimeConfig('ua.self-propelled-artillery', 300);
  const farConfig = getArtilleryRuntimeConfig('ua.self-propelled-artillery', 600);
  assert.equal(nearConfig.requiresSpotter, false);
  assert.equal(farConfig.requiresSpotter, true);

  let state = createArtilleryState(farConfig);
  assert.equal(state.ammo, 24);
  state = beginSetup(state, farConfig);
  state = tickArtillery(state, farConfig.setupTime, farConfig);
  assert.equal(state.state, ARTILLERY_STATES.READY);
  assert.equal(canFire(state, { distance: 600, spotted: false }, farConfig).reason, 'spotting-required');
  assert.equal(canFire(state, { distance: 600, spotted: true }, farConfig).ok, true);
});

test('keeps counter-battery signature values meaningful inside the UFR-037 clamp', () => {
  const mortar = getArtilleryRuntimeConfig('ua.self-propelled-artillery.mortar', 200);
  const gun = getArtilleryRuntimeConfig('ua.self-propelled-artillery', 300);
  const rocket = getArtilleryRuntimeConfig('ua.self-propelled-artillery.rocket', 400);
  assert.ok(mortar.signaturePerShot < gun.signaturePerShot);
  assert.ok(gun.signaturePerShot < rocket.signaturePerShot);
  assert.ok(rocket.signaturePerShot <= 1);
  const fired = fireSalvoRound({ ...createArtilleryState(rocket), state: ARTILLERY_STATES.READY, salvoRemaining: 1 }, rocket);
  assert.equal(fired.signature, 0.35);
});

test('builds UFR-039 configs with canonical target-class values', () => {
  const point = getUkrainianFiresProfile('ua.mobile-sam.point-defense');
  const medium = getUkrainianFiresProfile('ua.mobile-sam.medium-range');
  assert.deepEqual(point.airTargetPriority.slice(0, 3), [
    AIR_TARGET_CLASSES.LOITERING_MUNITION,
    AIR_TARGET_CLASSES.STRIKE_DRONE,
    AIR_TARGET_CLASSES.RECON_DRONE,
  ]);
  assert.equal(medium.airTargetPriority[0], AIR_TARGET_CLASSES.MISSILE);

  const config = getAirDefenseRuntimeConfig(medium.id);
  const state = createAirDefenseState(config);
  assert.equal(state.ammunition, 8);
  assert.equal(evaluateEngagementEnvelope({ x: 0, y: 0 }, { x: 300, y: 0, altitude: 80 }, config).ok, true);
  assert.equal(evaluateEngagementEnvelope({ x: 0, y: 0 }, { x: 20, y: 0, altitude: 80 }, config).reason, 'inside-minimum-range');
});

test('availability respects exact roster prerequisites plus variant technologies', () => {
  const base = ['ua.fires-center', 'ua.shared-target-network'];
  assert.deepEqual(availableUkrainianFiresProfiles(base), [
    'ua.self-propelled-artillery.mortar',
    'ua.self-propelled-artillery',
  ]);
  assert.deepEqual(availableUkrainianFiresProfiles([
    ...base,
    'ua.precision-fires',
    'ua.air-defense-site',
    'ua.layered-air-defense',
  ]), UKRAINIAN_FIRES_PROFILE_IDS);
});

test('composition reports actual fires and layered-air-defense doctrine', () => {
  const result = composeUkrainianFiresGroup(
    UKRAINIAN_FIRES_PROFILE_IDS,
    ['ua.fires-center', 'ua.shared-target-network', 'ua.precision-fires', 'ua.air-defense-site', 'ua.layered-air-defense'],
  );
  assert.deepEqual(result.missingRoles, []);
  assert.equal(result.doctrine.responsiveFires, true);
  assert.equal(result.doctrine.deepFires, true);
  assert.equal(result.doctrine.layeredAirDefense, true);
  assert.equal(result.doctrine.completeFiresNetwork, true);
  assert.deepEqual(result.cost, { metal: 1135, fuel: 395, intel: 270 });
  assert.equal(result.totalCapacityCost, 24);
  assert.equal(Object.isFrozen(result), true);
});

test('validator rejects overlap, runtime mismatches, and tech-tree drift', () => {
  const invalid = clone(UKRAINIAN_FIRES_BRANCH);
  invalid.profiles[0].producer = 'ua.infantry-center';
  invalid.profiles[1].artilleryConfig.signaturePerShot = 2;
  invalid.profiles[2].spotting.requiredBeyondRange = 2000;
  invalid.profiles[3].id = 'ua.mobile-sam';
  invalid.profiles[3].airTargetPriority = ['strike-drone'];
  invalid.profiles[4].airDefenseConfig.maximumRange = 20;
  const errors = validateUkrainianFiresBranch(invalid);
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('signaturePerShot')));
  assert.ok(errors.some((error) => error.includes('invalid spotting range distinction')));
  assert.ok(errors.some((error) => error.includes('exact ua.mobile-sam identity belongs to UFR-071')));
  assert.ok(errors.some((error) => error.includes('unknown UFR-039 class')));
  assert.ok(errors.some((error) => error.includes('maximumRange must exceed minimumRange')));
});

test('input and lookup boundaries fail explicitly', () => {
  assert.throws(() => getUkrainianFiresProfile('ua.unknown'), /Unknown Ukrainian fires profile/);
  assert.throws(() => getArtilleryRuntimeConfig('ua.mobile-sam.point-defense', 100), /not a UFR-037 artillery profile/);
  assert.throws(() => getAirDefenseRuntimeConfig('ua.self-propelled-artillery'), /not a UFR-039 air-defense profile/);
  assert.throws(() => getArtilleryRuntimeConfig('ua.self-propelled-artillery', Infinity), /shotDistance must be/);
  assert.throws(() => availableUkrainianFiresProfiles('ua.fires-center'), /must be an array/);
  assert.throws(() => composeUkrainianFiresGroup('ua.self-propelled-artillery', []), /must be an array/);
  assert.throws(() => composeUkrainianFiresGroup(['ua.self-propelled-artillery', 'ua.self-propelled-artillery'], []), /duplicate profile id/);
});
