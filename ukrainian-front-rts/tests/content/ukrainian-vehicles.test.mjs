import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE_CLASSES } from '../../src/combat/combat-schema.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  UKRAINIAN_VEHICLE_BRANCH,
  UKRAINIAN_VEHICLE_IDS,
  UKRAINIAN_VEHICLE_ROLE_IDS,
  availableUkrainianVehicles,
  getUkrainianVehicle,
  getUkrainianVehicleVariants,
  summarizeUkrainianVehicleTaskGroup,
  validateUkrainianVehicleBranch,
} from '../../src/content/ukrainian-vehicles.js';

const clone = (value) => structuredClone(value);

function techRosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.ukraine.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines the complete five-role Ukrainian mobility and armor branch', () => {
  assert.deepEqual(UKRAINIAN_VEHICLE_BRANCH.vehicles.map((vehicle) => vehicle.id), UKRAINIAN_VEHICLE_IDS);
  assert.deepEqual(UKRAINIAN_VEHICLE_BRANCH.vehicles.map((vehicle) => vehicle.roleId), UKRAINIAN_VEHICLE_ROLE_IDS);
  assert.deepEqual(validateUkrainianVehicleBranch(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_VEHICLE_BRANCH), true);
  assert.equal(Object.isFrozen(UKRAINIAN_VEHICLE_BRANCH.vehicles[0].transport), true);
  assert.equal(Object.isFrozen(UKRAINIAN_VEHICLE_BRANCH.vehicles[0].capabilities[0].parameters), true);
});

test('maps every platform variant to stable UFR-070 roster ownership', () => {
  const techNodes = techRosterNodes();
  for (const vehicle of UKRAINIAN_VEHICLE_BRANCH.vehicles) {
    const node = techNodes.get(vehicle.rosterNodeId);
    assert.ok(node, `${vehicle.id} must map to a UFR-070 roster node`);
    assert.equal(vehicle.tier, node.tier);
    assert.equal(vehicle.producer, node.producer);
    assert.deepEqual(vehicle.requires, node.requires);
  }
  assert.deepEqual(getUkrainianVehicleVariants('ua.protected-mobility'), [
    'ua.protected-mobility.apc',
    'ua.protected-mobility.ifv',
  ]);
});

test('separates protected transport, IFV, tank, recovery, and breaching counterplay', () => {
  const apc = getUkrainianVehicle('ua.protected-mobility.apc');
  const ifv = getUkrainianVehicle('ua.protected-mobility.ifv');
  const tank = getUkrainianVehicle('ua.tank.main-battle');
  const recovery = getUkrainianVehicle('ua.recovery-vehicle.armored-recovery');
  const engineer = getUkrainianVehicle('ua.breaching-section.engineering-vehicle');

  assert.equal(apc.transport.capacity, 8);
  assert.equal(ifv.transport.capacity, 6);
  assert.equal(ifv.weapons[0].damageClass, DAMAGE_CLASSES.AUTOCANNON);
  assert.deepEqual(tank.counters, ['armor', 'fortifications']);
  assert.equal(recovery.capabilities[0].id, 'armored-recovery');
  assert.deepEqual(engineer.counters, ['mines-obstacles', 'fortifications']);
  assert.equal(new Set(UKRAINIAN_VEHICLE_BRANCH.vehicles.map((vehicle) => vehicle.capabilities.map((entry) => entry.id).sort().join('|'))).size, 5);
});

test('makes UFR-026 transport and UFR-043 repair boundaries explicit', () => {
  for (const vehicle of UKRAINIAN_VEHICLE_BRANCH.vehicles) {
    assert.equal(vehicle.repair.repairable, true);
    assert.ok(vehicle.repair.fieldRepairCap > 0 && vehicle.repair.fieldRepairCap <= 1);
    assert.equal(vehicle.repair.recoveryEligible, true);
    if (vehicle.transport) {
      assert.equal(vehicle.transport.blockedExitPolicy, 'retain-cargo');
      assert.equal(vehicle.transport.destructionPolicy, 'catastrophic-loss');
      assert.ok(vehicle.transport.passengerDomains.includes('infantry'));
    }
  }
  assert.equal(getUkrainianVehicle('ua.recovery-vehicle.armored-recovery').repair.fieldRepairCap, 0.75);
});

test('resolves available platforms deterministically from completed UFR-070 nodes', () => {
  assert.deepEqual(availableUkrainianVehicles([]), []);
  assert.deepEqual(availableUkrainianVehicles(['ua.motor-pool']), [
    'ua.protected-mobility.apc',
    'ua.protected-mobility.ifv',
    'ua.tank.main-battle',
  ]);
  assert.deepEqual(availableUkrainianVehicles(['ua.motor-pool', 'ua.mobile-recovery']), [
    'ua.protected-mobility.apc',
    'ua.protected-mobility.ifv',
    'ua.tank.main-battle',
    'ua.recovery-vehicle.armored-recovery',
  ]);
  assert.deepEqual(availableUkrainianVehicles(['ua.motor-pool', 'ua.mobile-recovery', 'ua.engineer-park']), UKRAINIAN_VEHICLE_IDS);
});

test('summarizes the Networked Maneuver preservation and breach loop without hidden bonuses', () => {
  const incomplete = summarizeUkrainianVehicleTaskGroup([
    'ua.protected-mobility.ifv',
    'ua.tank.main-battle',
  ]);
  assert.equal(incomplete.doctrine.directFireScreen, true);
  assert.equal(incomplete.doctrine.preservationLoop, false);
  assert.equal(incomplete.doctrine.combinedArmsReady, false);
  assert.deepEqual(incomplete.missingCoreRoles, ['protected-transport', 'armored-recovery', 'combat-engineering-vehicle']);

  const complete = summarizeUkrainianVehicleTaskGroup([
    'ua.protected-mobility.apc',
    'ua.protected-mobility.ifv',
    'ua.tank.main-battle',
    'ua.recovery-vehicle.armored-recovery',
    'ua.breaching-section.engineering-vehicle',
  ]);
  assert.equal(complete.doctrine.protectedLift, true);
  assert.equal(complete.doctrine.preservationLoop, true);
  assert.equal(complete.doctrine.breachSupport, true);
  assert.equal(complete.doctrine.combinedArmsReady, true);
  assert.equal(complete.totalTransportCapacity, 14);
  assert.ok(complete.doctrine.supportLinkPairs >= 6);
  assert.deepEqual(complete.missingCoreRoles, []);
  assert.equal(Object.isFrozen(complete), true);
});

test('rejects branch drift, invalid transport policy, and broken cross-links', () => {
  const invalid = clone(UKRAINIAN_VEHICLE_BRANCH);
  invalid.vehicles[0].roleId = 'infantry-fighting-vehicle';
  invalid.vehicles[1].rosterNodeId = 'ua.unknown';
  invalid.vehicles[2].weapons[0].minimumRange = 999;
  invalid.vehicles[3].supportLinks = ['ua.unknown'];
  invalid.vehicles[3].capabilities.push(clone(invalid.vehicles[3].capabilities[0]));
  invalid.vehicles[0].transport.blockedExitPolicy = 'scatter-cargo';
  invalid.vehicles[1].counters = ['unknown-domain'];
  invalid.vehicles.pop();
  const errors = validateUkrainianVehicleBranch(invalid);
  assert.ok(errors.some((error) => error.includes('duplicate roleId')));
  assert.ok(errors.some((error) => error.includes('invalid rosterNodeId')));
  assert.ok(errors.some((error) => error.includes('minimumRange exceeds range')));
  assert.ok(errors.some((error) => error.includes('supportLinks contain an unknown vehicle')));
  assert.ok(errors.some((error) => error.includes('duplicate capability')));
  assert.ok(errors.some((error) => error.includes('blockedExitPolicy must preserve cargo')));
  assert.ok(errors.some((error) => error.includes('counters are invalid')));
  assert.ok(errors.some((error) => error.includes('missing required vehicle: ua.breaching-section.engineering-vehicle')));
  assert.ok(errors.some((error) => error.includes('missing required role: combat-engineering-vehicle')));
});

test('lookup and input boundaries fail explicitly', () => {
  assert.throws(() => getUkrainianVehicle('ua.unknown'), /Unknown Ukrainian vehicle/);
  assert.throws(() => getUkrainianVehicleVariants('ua.unknown'), /Unknown Ukrainian vehicle roster node/);
  assert.throws(() => availableUkrainianVehicles('ua.motor-pool'), /must be an array/);
  assert.throws(() => summarizeUkrainianVehicleTaskGroup('ua.tank.main-battle'), /must be an array/);
  assert.throws(() => summarizeUkrainianVehicleTaskGroup(['ua.unknown']), /Unknown Ukrainian vehicle/);
  assert.throws(() => summarizeUkrainianVehicleTaskGroup(['ua.tank.main-battle', 'ua.tank.main-battle']), /duplicate vehicle id/);
});
