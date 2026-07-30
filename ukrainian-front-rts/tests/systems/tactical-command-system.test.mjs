import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  TACTICAL_COMMAND_KINDS,
  TACTICAL_COMMAND_RESULTS,
  createTacticalCommandController,
  issueFollowCommand,
  issueGuardCommand,
  issueHoldPositionCommand,
  issuePatrolCommand,
  issueReturnForRepairCommand,
  prepareTacticalCommands,
  reconcileTacticalCommands,
  selectGuardThreat,
  tacticalCommandSnapshot,
} from '../../src/systems/tactical-command-system.js';

function unit(id, type, team, x, y, overrides = {}) {
  return {
    id,
    type,
    team,
    x,
    y,
    hp: 100,
    maxHp: 100,
    order: null,
    target: null,
    orderQueue: [],
    autoFire: true,
    ...overrides,
  };
}

function building(id, type, team, x, y, overrides = {}) {
  return { id, type, team, x, y, hp: 500, maxHp: 500, underConstruction: false, ...overrides };
}

function gameWith(units, buildings = []) {
  return {
    units,
    buildings,
    selected: new Set(),
    tacticalCommandSequence: 1,
    lastError: '',
    unitStats(type) { return UNIT_TYPES[type]; },
    selectedUnits() { return this.units.filter((candidate) => candidate.team === TEAM.UA && this.selected.has(candidate.id)); },
  };
}

test('patrol projects navigation-compatible attack-move legs and alternates deterministically', () => {
  const first = unit(2, 'uaInfantry', TEAM.UA, 100, 100);
  const game = gameWith([first]);

  const issued = issuePatrolCommand(game, [first], { x: 400, y: 300 });
  assert.equal(issued.ok, true);
  assert.equal(first.tacticalCommand.kind, TACTICAL_COMMAND_KINDS.PATROL);

  prepareTacticalCommands(game);
  assert.equal(first.order.kind, 'attackMove');
  assert.deepEqual({ x: first.order.x, y: first.order.y }, { x: 400, y: 300 });
  assert.equal(first.order.tacticalCommandId, first.tacticalCommand.id);

  first.x = 400;
  first.y = 300;
  first.order = null;
  reconcileTacticalCommands(game);
  assert.equal(first.tacticalCommand.leg, 'origin');
  prepareTacticalCommands(game);
  assert.deepEqual({ x: first.order.x, y: first.order.y }, { x: 100, y: 100 });
});


test('patrol consumes shared formation assignments for multi-unit outbound legs', () => {
  const first = unit(2, 'uaInfantry', TEAM.UA, 100, 100);
  const second = unit(1, 'uaInfantry', TEAM.UA, 120, 100);
  const game = gameWith([first, second]);

  assert.equal(issuePatrolCommand(game, [first, second], { x: 400, y: 300 }).ok, true);
  prepareTacticalCommands(game);
  assert.ok(first.order.formation);
  assert.ok(second.order.formation);
  assert.deepEqual(first.order.formation.anchorDestination, { x: 400, y: 300 });
  assert.notDeepEqual({ x: first.order.x, y: first.order.y }, { x: second.order.x, y: second.order.y });

  first.x = first.order.x;
  first.y = first.order.y;
  first.order = null;
  reconcileTacticalCommands(game);
  prepareTacticalCommands(game);
  assert.equal('formation' in first.order, false, 'return leg targets the unit-specific origin');
});

test('patrol rejects a no-op group destination without mutation', () => {
  const first = unit(1, 'uaInfantry', TEAM.UA, 100, 100);
  const game = gameWith([first]);
  const result = issuePatrolCommand(game, [first], { x: 105, y: 105 });
  assert.equal(result.status, TACTICAL_COMMAND_RESULTS.INVALID_POINT);
  assert.equal(first.tacticalCommand, undefined);
});

test('follow maintains a stable slot, refreshes a moving destination, and cancels missing targets', () => {
  const follower = unit(1, 'uaInfantry', TEAM.UA, 100, 100);
  const leader = unit(9, 'uaInfantry', TEAM.UA, 400, 300);
  const game = gameWith([follower, leader]);

  assert.equal(issueFollowCommand(game, [follower], leader).ok, true);
  prepareTacticalCommands(game);
  const firstOrder = follower.order;
  assert.equal(firstOrder.kind, 'move');

  leader.x += 100;
  prepareTacticalCommands(game);
  assert.notEqual(follower.order, firstOrder);
  assert.notEqual(follower.order.x, firstOrder.x);

  game.units = [follower];
  prepareTacticalCommands(game);
  assert.equal(follower.tacticalCommand, undefined);
  assert.equal(game.lastError, 'Follow target is no longer available.');
});

test('guard chooses threats by distance then stable ID and returns to the protected target', () => {
  const guard = unit(1, 'uaInfantry', TEAM.UA, 100, 100);
  const protectedUnit = unit(5, 'uaMedic', TEAM.UA, 200, 200);
  const fartherId = unit(8, 'ruInfantry', TEAM.RU, 220, 200);
  const lowerId = unit(3, 'ruInfantry', TEAM.RU, 180, 200);
  const game = gameWith([guard, protectedUnit, fartherId, lowerId]);

  assert.equal(selectGuardThreat(game, protectedUnit), lowerId);
  assert.equal(issueGuardCommand(game, [guard], protectedUnit).ok, true);
  prepareTacticalCommands(game);
  assert.equal(guard.order.kind, 'attack');
  assert.equal(guard.order.target, lowerId);

  game.units = [guard, protectedUnit];
  guard.x = 20;
  guard.y = 20;
  prepareTacticalCommands(game);
  assert.equal(guard.order.kind, 'move');
  assert.equal(guard.target, null);
});

test('hold position clears movement, target, gathering, and queued orders', () => {
  const engineer = unit(1, 'uaEngineer', TEAM.UA, 100, 100, {
    order: { kind: 'gather' },
    target: { id: 99 },
    gatherKind: 'metal',
    orderQueue: [{ kind: 'move', x: 300, y: 300 }],
  });
  const game = gameWith([engineer]);

  assert.equal(issueHoldPositionCommand(game, [engineer]).ok, true);
  prepareTacticalCommands(game);
  assert.equal(engineer.order, null);
  assert.equal(engineer.target, null);
  assert.equal(engineer.gatherKind, null);
  assert.deepEqual(engineer.orderQueue, []);
});

test('return for repair chooses nearest workshop, waits without healing, and clears when repaired', () => {
  const tank = unit(1, 'uaTank', TEAM.UA, 100, 100, { hp: 55, maxHp: 100 });
  const far = building(20, 'workshop', TEAM.UA, 700, 700);
  const near = building(10, 'workshop', TEAM.UA, 300, 100);
  const game = gameWith([tank], [far, near]);

  const issued = issueReturnForRepairCommand(game, [tank]);
  assert.equal(issued.ok, true);
  assert.equal(tank.tacticalCommand.facilityId, 10);
  prepareTacticalCommands(game);
  assert.equal(tank.order.kind, 'move');
  assert.equal(tank.hp, 55);

  tank.x = 260;
  tank.y = 100;
  prepareTacticalCommands(game);
  assert.equal(tank.tacticalCommand.status, 'waiting');
  assert.equal(tank.awaitingRepairAt, 10);
  assert.equal(tank.order, null);
  assert.equal(tank.hp, 55, 'UFR-027 does not implement repair healing');

  tank.hp = tank.maxHp;
  prepareTacticalCommands(game);
  assert.equal(tank.tacticalCommand, undefined);
  assert.equal(tank.awaitingRepairAt, undefined);
});

test('return for repair rejects without a facility and ignores healthy or non-vehicle units', () => {
  const damagedTank = unit(1, 'uaTank', TEAM.UA, 100, 100, { hp: 50, maxHp: 100 });
  const healthyIfv = unit(2, 'uaIfv', TEAM.UA, 100, 120);
  const infantry = unit(3, 'uaInfantry', TEAM.UA, 100, 140, { hp: 50, maxHp: 100 });
  const game = gameWith([damagedTank, healthyIfv, infantry]);

  const result = issueReturnForRepairCommand(game, [damagedTank, healthyIfv, infantry]);
  assert.equal(result.status, TACTICAL_COMMAND_RESULTS.NO_REPAIR_FACILITY);
  assert.equal(damagedTank.tacticalCommand, undefined);
});

test('controller projects tactical intent before the existing update boundary', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 100, 100);
  const game = gameWith([soldier]);
  game.mouse = { attackMove: false };
  game.gameOver = false;
  game.pendingBuild = null;
  game.selected = new Set([1]);
  game.fail = function fail(message) { this.lastError = message; return false; };
  game.issue = function issue() { return true; };
  game.stopSelected = function stopSelected() { return true; };
  game.start = function start() {};
  const seen = [];
  game.update = function update() {
    seen.push({ ...soldier.order });
    soldier.x = soldier.order.x;
    soldier.y = soldier.order.y;
    soldier.order = null;
  };

  const dispose = createTacticalCommandController(game);
  issuePatrolCommand(game, [soldier], { x: 300, y: 220 });
  game.update(1 / 30);

  assert.equal(seen[0].kind, 'attackMove');
  assert.deepEqual({ x: seen[0].x, y: seen[0].y }, { x: 300, y: 220 });
  assert.equal(soldier.tacticalCommand.leg, 'origin');
  dispose();
});

test('controller exposes targeting commands and ordinary issue, stop, and mission start clear tactical state', () => {
  const soldier = unit(1, 'uaInfantry', TEAM.UA, 100, 100);
  const leader = unit(2, 'uaInfantry', TEAM.UA, 200, 100);
  const game = gameWith([soldier, leader]);
  game.mouse = { attackMove: false };
  game.gameOver = false;
  game.pendingBuild = null;
  game.selected = new Set([1]);
  game.fail = function fail(message) { this.lastError = message; return false; };
  game.issue = function issue(x, y) { this.units.find((candidate) => candidate.id === 1).order = { kind: 'move', x, y }; return true; };
  game.stopSelected = function stopSelected() { for (const candidate of this.selectedUnits()) candidate.order = null; return true; };
  game.update = function update() {};
  game.start = function start() { this.units = [soldier, leader]; this.selected.clear(); };

  const dispose = createTacticalCommandController(game);
  assert.equal(game.armTacticalCommand(TACTICAL_COMMAND_KINDS.FOLLOW), true);
  assert.equal(game.issueTacticalTarget(leader.x, leader.y, leader), true);
  assert.equal(soldier.tacticalCommand.kind, TACTICAL_COMMAND_KINDS.FOLLOW);
  assert.deepEqual(tacticalCommandSnapshot(soldier), {
    id: 1,
    kind: 'follow',
    targetId: 2,
    facilityId: null,
    status: null,
    leg: null,
    origin: null,
    destination: null,
  });

  game.issue(500, 500, null);
  assert.equal(soldier.tacticalCommand, undefined);
  assert.equal(soldier.order.kind, 'move');

  game.holdSelected();
  assert.equal(soldier.tacticalCommand.kind, TACTICAL_COMMAND_KINDS.HOLD_POSITION);
  game.stopSelected();
  assert.equal(soldier.tacticalCommand, undefined);

  game.armTacticalCommand(TACTICAL_COMMAND_KINDS.PATROL);
  game.start();
  assert.equal(game.pendingTacticalCommand, null);
  assert.equal(game.tacticalCommandSequence, 1);

  dispose();
  assert.equal('armTacticalCommand' in game, false);
  assert.equal('pendingTacticalCommand' in game, false);
});
