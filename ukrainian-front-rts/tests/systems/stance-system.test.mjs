import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  COMBAT_STANCES,
  STANCE_POLICY,
  activeRetaliationTargetId,
  createStanceController,
  ensureCombatStance,
  prepareStanceOrders,
  reconcileStanceOrders,
  recordStanceRetaliation,
  resolveStanceTarget,
  setCombatStance,
  stanceSnapshot,
} from '../../src/systems/stance-system.js';

function unit(id, type, team, x, y, overrides = {}) {
  const stats = UNIT_TYPES[type];
  return {
    id, type, team, x, y,
    hp: stats?.armor ? 300 : 100,
    maxHp: stats?.armor ? 300 : 100,
    order: null,
    target: null,
    orderQueue: [],
    autoFire: true,
    ...overrides,
  };
}

function gameWith(units, buildings = []) {
  return {
    units,
    buildings,
    time: 0,
    gameOver: false,
    selected: new Set(),
    lastError: '',
    lastCommandMessage: '',
    unitStats(type) { return UNIT_TYPES[type]; },
    selectedUnits() { return this.units.filter((candidate) => candidate.team === TEAM.UA && this.selected.has(candidate.id)); },
  };
}

test('hold-fire blocks automatic acquisition while explicit orders remain untouched', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const enemy = unit(2, 'ruInfantry', TEAM.RU, 50, 0);
  const game = gameWith([soldier, enemy]);
  setCombatStance(soldier, COMBAT_STANCES.HOLD_FIRE);
  assert.equal(resolveStanceTarget(game, soldier), null);
  soldier.order = { kind: 'attack', target: enemy };
  assert.equal(prepareStanceOrders(game), 0);
  assert.equal(soldier.order.target, enemy);
});

test('return-fire remembers only the recent attacker and expires deterministically', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const attacker = unit(9, 'ruInfantry', TEAM.RU, 80, 0);
  const other = unit(2, 'ruInfantry', TEAM.RU, 40, 0);
  const game = gameWith([soldier, attacker, other]);
  setCombatStance(soldier, COMBAT_STANCES.RETURN_FIRE);
  assert.equal(recordStanceRetaliation(soldier, attacker, 3), true);
  assert.equal(activeRetaliationTargetId(soldier, 3 + STANCE_POLICY.retaliationMemorySeconds), 9);
  assert.equal(resolveStanceTarget(game, soldier, 4).target, attacker);
  assert.equal(resolveStanceTarget(game, soldier, 12), null);
});

test('fire-at-will and hold-position acquire only targets already in weapon range', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const close = unit(3, 'ruInfantry', TEAM.RU, 90, 0);
  const far = unit(2, 'ruInfantry', TEAM.RU, 150, 0);
  const game = gameWith([soldier, far, close]);
  setCombatStance(soldier, COMBAT_STANCES.FIRE_AT_WILL);
  const fire = resolveStanceTarget(game, soldier);
  assert.equal(fire.target, close);
  assert.equal(fire.chase, false);
  setCombatStance(soldier, COMBAT_STANCES.HOLD_POSITION);
  const hold = resolveStanceTarget(game, soldier);
  assert.equal(hold.target, close);
  assert.equal(hold.chase, false);
});

test('defensive stance chases inside its leash but rejects targets beyond it', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const inside = unit(2, 'ruInfantry', TEAM.RU, 180, 0);
  const game = gameWith([soldier, inside]);
  setCombatStance(soldier, COMBAT_STANCES.DEFENSIVE);
  const decision = resolveStanceTarget(game, soldier);
  assert.equal(decision.target, inside);
  assert.equal(decision.chase, true);
  inside.x = 300;
  assert.equal(resolveStanceTarget(game, soldier), null);
});

test('aggressive stance acquires beyond normal sight fraction and uses a wider leash', () => {
  const tank = unit(1, 'uaTank', TEAM.UA, 0, 0);
  const enemy = unit(2, 'ruTank', TEAM.RU, 340, 0);
  const game = gameWith([tank, enemy]);
  setCombatStance(tank, COMBAT_STANCES.AGGRESSIVE);
  const decision = resolveStanceTarget(game, tank);
  assert.equal(decision.target, enemy);
  assert.equal(decision.chase, true);
});

test('target selection is deterministic and uses retaliation as a bonus', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const highId = unit(8, 'ruInfantry', TEAM.RU, 80, 0);
  const lowId = unit(3, 'ruInfantry', TEAM.RU, 80, 0);
  const game = gameWith([soldier, highId, lowId]);
  setCombatStance(soldier, COMBAT_STANCES.FIRE_AT_WILL);
  assert.equal(resolveStanceTarget(game, soldier).target, lowId);
  recordStanceRetaliation(soldier, highId, 0);
  assert.equal(resolveStanceTarget(game, soldier).target, highId);
});

test('prepare and reconcile project transient attack intent only for idle units', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const enemy = unit(2, 'ruInfantry', TEAM.RU, 80, 0);
  const game = gameWith([soldier, enemy]);
  setCombatStance(soldier, COMBAT_STANCES.FIRE_AT_WILL);
  assert.equal(prepareStanceOrders(game), 1);
  assert.equal(soldier.order.kind, 'attack');
  assert.equal(soldier.order.stanceProjection, true);
  assert.equal(reconcileStanceOrders(game), 1);
  assert.equal(soldier.order, null);
  assert.equal(soldier.target, enemy);
});

test('stance snapshots are immutable and reference-free', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 12, 34);
  ensureCombatStance(soldier, 2);
  const snapshot = stanceSnapshot(soldier);
  assert.deepEqual(snapshot, {
    stance: 'fireAtWill',
    origin: { x: 12, y: 34 },
    lastAttackerId: null,
    lastAttackedAt: null,
    targetId: null,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.origin), true);
});

test('controller maps legacy auto-fire, hold-position, lifecycle, and teardown', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 0, 0);
  const enemy = unit(2, 'ruInfantry', TEAM.RU, 80, 0);
  const game = gameWith([soldier, enemy]);
  game.selected.add(1);
  game.fail = function fail(message) { this.lastError = message; return false; };
  game.addUnit = function addUnit(type, team, x, y) {
    const added = unit(10, type, team, x, y);
    this.units.push(added);
    return added;
  };
  game.toggleAutoFire = function toggleAutoFire() { return false; };
  game.update = function update() {
    assert.equal(soldier.order?.stanceProjection, true);
    return 'updated';
  };
  game.start = function start() { this.units = [soldier, enemy]; };
  let held = 0;
  game.holdSelected = function holdSelected() {
    held += 1;
    soldier.tacticalCommand = { id: 5, kind: 'holdPosition' };
    soldier.order = null;
    return true;
  };

  const dispose = createStanceController(game);
  assert.equal(game.setSelectedCombatStance(COMBAT_STANCES.HOLD_POSITION), true);
  assert.equal(held, 1);
  assert.equal(soldier.combatStance, COMBAT_STANCES.HOLD_POSITION);
  assert.equal(game.setSelectedCombatStance(COMBAT_STANCES.DEFENSIVE), true);
  assert.equal(soldier.tacticalCommand, undefined);
  assert.equal(game.update(1 / 30), 'updated');
  assert.equal(soldier.order, null);
  game.setSelectedCombatStance(COMBAT_STANCES.HOLD_FIRE);
  assert.equal(game.toggleAutoFire(), true);
  assert.equal(soldier.combatStance, COMBAT_STANCES.FIRE_AT_WILL);
  const added = game.addUnit('uaInfantry', TEAM.UA, 5, 5);
  assert.equal(added.combatStance, COMBAT_STANCES.FIRE_AT_WILL);
  dispose();
  assert.equal('setSelectedCombatStance' in game, false);
  assert.equal('combatStanceSnapshot' in game, false);
});
