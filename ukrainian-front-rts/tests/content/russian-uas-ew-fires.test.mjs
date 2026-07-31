import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_TARGET_CLASSES } from '../../src/combat/air-defense-system.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  RUSSIAN_UAS_EW_FIRES_BRANCH,
  RUSSIAN_UAS_EW_FIRES_PROFILE_IDS,
  RUSSIAN_UAS_EW_FIRES_ROLE_IDS,
  availableRussianUasEwFiresProfiles,
  composeRussianReconStrikeGroup,
  getRussianAirDefenseRuntimeConfig,
  getRussianArtilleryRuntimeConfig,
  getRussianDroneRuntimeConfig,
  getRussianJammerRuntimeContext,
  getRussianUasEwFiresProfile,
  getRussianUasEwFiresVariants,
  validateRussianUasEwFiresBranch,
} from '../../src/content/russian-uas-ew-fires.js';

const fullUnlocks = [
  'ru.uas-ew-battalion',
  'ru.spectrum-denial',
  'ru.fires-regiment',
  'ru.prepared-fires',
  'ru.operational-mass',
  'ru.air-defense-battalion',
  'ru.layered-air-defense',
];

const clone = (value) => JSON.parse(JSON.stringify(value));

test('defines a complete immutable seven-role Russian reconnaissance-strike complex', () => {
  assert.deepEqual(validateRussianUasEwFiresBranch(), []);
  assert.deepEqual(RUSSIAN_UAS_EW_FIRES_BRANCH.profiles.map((record) => record.id), RUSSIAN_UAS_EW_FIRES_PROFILE_IDS);
  assert.deepEqual(RUSSIAN_UAS_EW_FIRES_BRANCH.profiles.map((record) => record.roleId), RUSSIAN_UAS_EW_FIRES_ROLE_IDS);
  assert.equal(Object.isFrozen(RUSSIAN_UAS_EW_FIRES_BRANCH), true);
  assert.equal(Object.isFrozen(RUSSIAN_UAS_EW_FIRES_BRANCH.profiles), true);
  assert.equal(Object.isFrozen(getRussianUasEwFiresProfile('ru.sam-battery').airDefenseConfig), true);
  assert.throws(() => { RUSSIAN_UAS_EW_FIRES_BRANCH.profiles.push({}); }, TypeError);
});

test('maps every profile exactly to its UFR-070 stable roster anchor', () => {
  const nodes = new Map(FACTION_TECH_TREES.factions.russia.nodes.map((node) => [node.id, node]));
  for (const record of RUSSIAN_UAS_EW_FIRES_BRANCH.profiles) {
    const roster = nodes.get(record.rosterNodeId);
    assert.equal(roster.kind, 'roster');
    assert.equal(record.tier, roster.tier);
    assert.equal(record.producer, roster.producer);
    assert.deepEqual(record.requires, roster.requires);
    assert.equal(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`), true);
  }
  assert.deepEqual(getRussianUasEwFiresVariants('ru.recon-uav').map((record) => record.id), ['ru.recon-uav', 'ru.recon-uav.strike']);
  assert.deepEqual(getRussianUasEwFiresVariants('ru.self-propelled-gun').map((record) => record.id), ['ru.self-propelled-gun', 'ru.self-propelled-gun.rocket']);
  assert.deepEqual(getRussianUasEwFiresVariants('ru.sam-battery').map((record) => record.id), ['ru.sam-battery.point-defense', 'ru.sam-battery']);
});

test('exposes UFR-038-compatible reusable reconnaissance and one-way strike configs', () => {
  const recon = getRussianDroneRuntimeConfig('ru.recon-uav');
  const strike = getRussianDroneRuntimeConfig('ru.recon-uav.strike');
  assert.equal(recon.payload, 0);
  assert.equal(recon.autonomousReturn, true);
  assert.equal(recon.consumedOnStrike, false);
  assert.equal(strike.payload, 1);
  assert.equal(strike.autonomousStrike, true);
  assert.equal(strike.requiresSpottedTarget, true);
  assert.equal(strike.consumedOnStrike, true);
  assert.ok(recon.linkRange > strike.linkRange);
  assert.ok(recon.linkHardening > strike.linkHardening);
});

test('derives deterministic jammer strength and preserves emission counterplay', () => {
  assert.deepEqual(getRussianJammerRuntimeContext('ru.jammer', 0), {
    jammerStrength: 0.76,
    linkDisruption: 0.532,
    radarDegradation: 0.441,
    sourceRange: 660,
    distance: 0,
    emissionSignature: 0.88,
  });
  assert.equal(getRussianJammerRuntimeContext('ru.jammer', 330).jammerStrength, 0.38);
  assert.equal(getRussianJammerRuntimeContext('ru.jammer', 660).jammerStrength, 0.08);
  assert.equal(getRussianJammerRuntimeContext('ru.jammer', 661).jammerStrength, 0);
});

test('adapts prepared and saturation artillery to the UFR-037 runtime contract', () => {
  const gunNear = getRussianArtilleryRuntimeConfig('ru.self-propelled-gun', 369);
  const gunFar = getRussianArtilleryRuntimeConfig('ru.self-propelled-gun', 370);
  const rockets = getRussianArtilleryRuntimeConfig('ru.self-propelled-gun.rocket', 800);
  assert.equal(gunNear.requiresSpotter, false);
  assert.equal(gunFar.requiresSpotter, true);
  assert.equal(gunFar.ammo, 30);
  assert.equal(gunFar.salvoSize, 5);
  assert.equal(rockets.requiresSpotter, true);
  assert.equal(rockets.salvoSize, 8);
  assert.ok(rockets.signaturePerShot > gunFar.signaturePerShot);
  assert.ok(rockets.scatterRadius > gunFar.scatterRadius);
  assert.ok(rockets.signaturePerShot <= 1);
});

test('uses canonical UFR-039 air-target classes with distinct layered envelopes', () => {
  const point = getRussianAirDefenseRuntimeConfig('ru.sam-battery.point-defense');
  const medium = getRussianAirDefenseRuntimeConfig('ru.sam-battery');
  const pointRecord = getRussianUasEwFiresProfile('ru.sam-battery.point-defense');
  const mediumRecord = getRussianUasEwFiresProfile('ru.sam-battery');
  const canonical = new Set(Object.values(AIR_TARGET_CLASSES));
  assert.equal(pointRecord.airTargetPriority.every((targetClass) => canonical.has(targetClass)), true);
  assert.equal(mediumRecord.airTargetPriority.every((targetClass) => canonical.has(targetClass)), true);
  assert.equal(pointRecord.airTargetPriority[0], AIR_TARGET_CLASSES.LOITERING_MUNITION);
  assert.equal(mediumRecord.airTargetPriority[0], AIR_TARGET_CLASSES.MISSILE);
  assert.ok(point.ammunition > medium.ammunition);
  assert.ok(medium.maximumRange > point.maximumRange);
  assert.ok(medium.radarHardening > point.radarHardening);
});

test('resolves unlocks and summarizes a complete Echeloned Pressure fires complex', () => {
  assert.deepEqual(availableRussianUasEwFiresProfiles(fullUnlocks), RUSSIAN_UAS_EW_FIRES_PROFILE_IDS);
  const summary = composeRussianReconStrikeGroup(RUSSIAN_UAS_EW_FIRES_PROFILE_IDS, fullUnlocks);
  assert.deepEqual(summary.rejected, []);
  assert.deepEqual(summary.cost, { metal: 1438, fuel: 508, intel: 332 });
  assert.equal(summary.totalCapacityCost, 34);
  assert.equal(summary.totalDronePayload, 1);
  assert.equal(summary.averageDroneLinkHardening, 0.17);
  assert.equal(summary.totalArtilleryAmmunition, 46);
  assert.equal(summary.totalAirDefenseAmmunition, 26);
  assert.deepEqual(summary.doctrine, {
    reconnaissanceStrikeChain: true,
    preparedFirePlan: true,
    saturationEchelon: true,
    layeredAirDefense: true,
    protectedFiresComplex: true,
    completeReconStrikeComplex: true,
  });
  assert.deepEqual(summary.missingRoles, []);
  assert.equal(Object.isFrozen(summary), true);
});

test('reports unknown and locked profiles without changing deterministic selection order', () => {
  const summary = composeRussianReconStrikeGroup(
    ['ru.recon-uav.strike', 'ru.recon-uav', 'ru.unknown'],
    ['ru.uas-ew-battalion'],
  );
  assert.deepEqual(summary.profileIds, ['ru.recon-uav']);
  assert.deepEqual(summary.rejected, [
    { id: 'ru.recon-uav.strike', reason: 'missing-requirements', missing: ['ru.spectrum-denial'] },
    { id: 'ru.unknown', reason: 'unknown-profile' },
  ]);
  assert.equal(summary.doctrine.reconnaissanceStrikeChain, false);
  assert.deepEqual(summary.missingRoles.includes('one-way-recon-strike'), true);
});

test('rejects schema drift and invalid public API inputs with actionable failures', () => {
  const drifted = clone(RUSSIAN_UAS_EW_FIRES_BRANCH);
  drifted.profiles[1].requires = ['ru.uas-ew-battalion', 'ru.spectrum-denial'];
  drifted.profiles[2].ewConfig.minimumEffect = 0.9;
  drifted.profiles[3].artilleryConfig.signaturePerShot = 1.2;
  drifted.profiles[5].airTargetPriority = ['rotorcraft'];
  drifted.profiles.push(clone(drifted.profiles[0]));
  const errors = validateRussianUasEwFiresBranch(drifted);
  assert.ok(errors.some((error) => error.includes('duplicate profile id')));
  assert.ok(errors.some((error) => error.includes('requires must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('minimumEffect cannot exceed jammerStrength')));
  assert.ok(errors.some((error) => error.includes('signaturePerShot must be within [0, 1]')));
  assert.ok(errors.some((error) => error.includes('unknown UFR-039 class')));
  assert.throws(() => getRussianUasEwFiresProfile('ru.missing'), RangeError);
  assert.throws(() => getRussianUasEwFiresVariants(''), TypeError);
  assert.throws(() => getRussianUasEwFiresVariants('ru.tank'), RangeError);
  assert.throws(() => getRussianDroneRuntimeConfig('ru.jammer'), TypeError);
  assert.throws(() => getRussianJammerRuntimeContext('ru.jammer', -1), TypeError);
  assert.throws(() => getRussianArtilleryRuntimeConfig('ru.recon-uav', 20), TypeError);
  assert.throws(() => getRussianAirDefenseRuntimeConfig('ru.self-propelled-gun'), TypeError);
  assert.throws(() => availableRussianUasEwFiresProfiles('not-an-array'), TypeError);
  assert.throws(() => composeRussianReconStrikeGroup(['ru.recon-uav', 'ru.recon-uav'], fullUnlocks), TypeError);
});
