import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE_CLASSES } from '../../src/combat/combat-schema.js';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  RUSSIAN_VEHICLE_BRANCH,
  RUSSIAN_VEHICLE_IDS,
  RUSSIAN_VEHICLE_ROLE_IDS,
  availableRussianVehicles,
  getRussianVehicle,
  getRussianVehicleVariants,
  summarizeRussianVehicleTaskGroup,
  validateRussianVehicleBranch,
} from '../../src/content/russian-vehicles.js';

const clone = (value) => structuredClone(value);

function techRosterNodes() {
  return new Map(FACTION_TECH_TREES.factions.russia.nodes
    .filter((node) => node.kind === 'roster')
    .map((node) => [node.id, node]));
}

test('defines exactly the four required Russian vehicle roles', () => {
  assert.deepEqual(RUSSIAN_VEHICLE_BRANCH.vehicles.map((vehicle) => vehicle.id), RUSSIAN_VEHICLE_IDS);
  assert.deepEqual(RUSSIAN_VEHICLE_BRANCH.vehicles.map((vehicle) => vehicle.roleId), RUSSIAN_VEHICLE_ROLE_IDS);
  assert.deepEqual(validateRussianVehicleBranch(), []);
  assert.equal(Object.isFrozen(RUSSIAN_VEHICLE_BRANCH), true);
  assert.equal(Object.isFrozen(RUSSIAN_VEHICLE_BRANCH.vehicles[0].capabilities[0].parameters), true);
});

test('matches UFR-070 roster ownership and exposes APC variants', () => {
  const techNodes = techRosterNodes();
  for (const vehicle of RUSSIAN_VEHICLE_BRANCH.vehicles) {
    const node = techNodes.get(vehicle.rosterNodeId);
    assert.ok(node, `${vehicle.rosterNodeId} must exist in UFR-070`);
    assert.equal(vehicle.tier, node.tier);
    assert.equal(vehicle.producer, node.producer);
    assert.deepEqual(vehicle.requires, node.requires);
  }
  assert.deepEqual(getRussianVehicleVariants('ru.apc').map((vehicle) => vehicle.id), ['ru.apc-carrier', 'ru.apc-ifv']);
  assert.deepEqual(getRussianVehicleVariants('ru.tank').map((vehicle) => vehicle.id), ['ru.tank-breakthrough']);
});

test('keeps cost, protection, firepower, repair, and massing tradeoffs distinct', () => {
  const carrier = getRussianVehicle('ru.apc-carrier');
  const ifv = getRussianVehicle('ru.apc-ifv');
  const tank = getRussianVehicle('ru.tank-breakthrough');
  const recovery = getRussianVehicle('ru.repair-tractor');
  assert.ok(carrier.cost.metal < ifv.cost.metal);
  assert.ok(carrier.transport.capacity > ifv.transport.capacity);
  assert.ok(ifv.weapons.some((weapon) => weapon.damageClass === DAMAGE_CLASSES.AUTOCANNON));
  assert.ok(tank.durability.hitPoints > ifv.durability.hitPoints);
  assert.ok(tank.massing.fuelBurden > carrier.massing.fuelBurden);
  assert.equal(recovery.repair.canRepairOthers, true);
  assert.equal(recovery.repair.recoveryTowCapacity, 1);
  assert.equal(carrier.massing.batchSize, 2);
});

test('preserves UFR-026 transport and UFR-043 repair boundaries', () => {
  for (const vehicle of RUSSIAN_VEHICLE_BRANCH.vehicles.filter((record) => record.transport)) {
    assert.equal(vehicle.transport.blockedExitPolicy, 'retain-cargo');
    assert.equal(vehicle.transport.destructionPolicy, 'catastrophic-loss');
  }
  assert.equal(getRussianVehicle('ru.tank-breakthrough').repair.fieldRepairCap, 0.5);
  assert.equal(getRussianVehicle('ru.repair-tractor').repair.fieldRepairCap, 0.72);
  assert.equal(getRussianVehicle('ru.repair-tractor').capabilities[0].id, 'formation-repair');
});

test('resolves available vehicles from completed UFR-070 nodes deterministically', () => {
  assert.deepEqual(availableRussianVehicles([]), []);
  assert.deepEqual(
    availableRussianVehicles(['ru.armored-park']),
    ['ru.apc-carrier', 'ru.apc-ifv', 'ru.tank-breakthrough'],
  );
  assert.deepEqual(
    availableRussianVehicles(['ru.armored-park', 'ru.replacement-depth']),
    RUSSIAN_VEHICLE_IDS,
  );
});

test('summarizes echelon doctrine without hidden faction-wide bonuses', () => {
  const incomplete = summarizeRussianVehicleTaskGroup(['ru.apc-carrier', 'ru.apc-ifv']);
  assert.equal(incomplete.doctrine.mountedEchelonReady, true);
  assert.equal(incomplete.doctrine.breakthroughReady, false);
  assert.deepEqual(incomplete.missingCoreRoles, ['breakthrough-tank', 'armored-recovery']);
  assert.equal(incomplete.protectedSeats, 14);
  assert.equal(incomplete.productionBatchSize, 3);

  const complete = summarizeRussianVehicleTaskGroup(RUSSIAN_VEHICLE_IDS);
  assert.equal(complete.doctrine.operationalMassReady, true);
  assert.equal(complete.doctrine.recoveryContinuity, true);
  assert.ok(complete.doctrine.supportLinkPairs >= 5);
  assert.ok(complete.directFireIndex > 50);
  assert.deepEqual(complete.missingCoreRoles, []);
  assert.equal(Object.isFrozen(complete), true);
});

test('rejects drift from vehicle and tech-tree contracts', () => {
  const invalid = clone(RUSSIAN_VEHICLE_BRANCH);
  invalid.vehicles[0].roleId = 'infantry-fighting-vehicle';
  invalid.vehicles[1].producer = 'ru.regimental-command';
  invalid.vehicles[1].transport.blockedExitPolicy = 'teleport-cargo';
  invalid.vehicles[2].weapons[0].minimumRange = 999;
  invalid.vehicles[2].massing.echelonRole = 'unknown';
  invalid.vehicles[3].supportLinks = ['ru.unknown'];
  invalid.vehicles[3].capabilities.push(clone(invalid.vehicles[3].capabilities[0]));
  invalid.vehicles.pop();
  const errors = validateRussianVehicleBranch(invalid);
  assert.ok(errors.some((error) => error.includes('duplicate roleId')));
  assert.ok(errors.some((error) => error.includes('producer must match UFR-070')));
  assert.ok(errors.some((error) => error.includes('invalid blockedExitPolicy')));
  assert.ok(errors.some((error) => error.includes('minimumRange exceeds range')));
  assert.ok(errors.some((error) => error.includes('invalid echelonRole')));
  assert.ok(errors.some((error) => error.includes('missing required vehicle: ru.repair-tractor')));
  assert.ok(errors.some((error) => error.includes('missing required role: armored-recovery')));
});

test('lookup and input boundaries fail explicitly', () => {
  assert.throws(() => getRussianVehicle('ru.unknown'), /Unknown Russian vehicle/);
  assert.throws(() => getRussianVehicleVariants('ru.unknown'), /Unknown Russian vehicle roster node/);
  assert.throws(() => getRussianVehicleVariants(''), /must be a non-empty string/);
  assert.throws(() => availableRussianVehicles('ru.armored-park'), /must be an array/);
  assert.throws(() => summarizeRussianVehicleTaskGroup('ru.apc-carrier'), /must be an array/);
  assert.throws(() => summarizeRussianVehicleTaskGroup(['ru.unknown']), /Unknown Russian vehicle/);
  assert.throws(() => summarizeRussianVehicleTaskGroup(['ru.apc-carrier', 'ru.apc-carrier']), /duplicate vehicle id/);
});
