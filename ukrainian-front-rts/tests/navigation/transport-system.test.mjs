import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  TRANSPORT_RESULTS,
  createTransportController,
  disembarkUnits,
  embarkUnits,
  initializeTransport,
  resolveDestroyedTransportPassengers,
  transportCapacity,
  transportSnapshot,
} from '../../src/systems/transport-system.js';

function unit(id, type, team, x, y, overrides = {}) {
  const stats = UNIT_TYPES[type];
  return {
    id,
    type,
    team,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    selected: false,
    order: null,
    target: null,
    ...overrides,
  };
}

function openGrid(blocked = () => false) {
  return {
    worldToCell(x, y) {
      if (x < 0 || y < 0 || x >= 2560 || y >= 1664) throw new RangeError('outside');
      return { x: Math.floor(x / 32), y: Math.floor(y / 32) };
    },
    isPassable(x, y) {
      return !blocked(x, y);
    },
  };
}

function gameWith(units, { buildings = [], nodes = [], pop = 0 } = {}) {
  return {
    units,
    buildings,
    nodes,
    selected: new Set(),
    player: { pop, upgrades: new Set() },
    unitStats(type) { return UNIT_TYPES[type]; },
  };
}

test('gives existing IFV roster entries deterministic compatibility capacity', () => {
  const game = gameWith([]);
  const transport = unit(1, 'uaIfv', TEAM.UA, 100, 100);
  initializeTransport(game, transport);
  assert.equal(transportCapacity(game, transport), 4);
  assert.deepEqual(transportSnapshot(game, transport), {
    transportId: 1,
    capacity: 4,
    used: 0,
    available: 4,
    passengerIds: [],
  });
});

test('embarks nearby friendly squads atomically and removes them from active simulation', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 100, 100);
  const second = unit(2, 'uaMedic', TEAM.UA, 118, 100, { order: { kind: 'move' }, selected: true });
  const first = unit(1, 'uaInfantry', TEAM.UA, 110, 100, { target: { id: 99 }, selected: true });
  const hunter = unit(20, 'ruInfantry', TEAM.RU, 180, 100, {
    target: first,
    order: { kind: 'attack', target: first },
    orderQueue: [{ kind: 'attack', target: first }],
  });
  const game = gameWith([transport, second, first, hunter], { pop: 8 });
  game.projectiles = [{ target: first }, { target: transport }];
  game.selected = new Set([1, 2]);

  const result = embarkUnits(game, transport, [second, first]);

  assert.equal(result.ok, true);
  assert.equal(result.status, TRANSPORT_RESULTS.EMBARKED);
  assert.deepEqual(game.units.map((candidate) => candidate.id), [10, 20]);
  assert.deepEqual(transport.passengers.map((candidate) => candidate.id), [1, 2]);
  assert.equal(first.embarkedIn, 10);
  assert.equal(first.target, null);
  assert.equal(second.order, null);
  assert.deepEqual([...game.selected], []);
  assert.equal(game.player.pop, 8);
  assert.equal(hunter.target, null);
  assert.equal(hunter.order, null);
  assert.deepEqual(hunter.orderQueue, []);
  assert.deepEqual(game.projectiles, [{ target: transport }]);
});

test('rejects an invalid passenger set without partially embarking', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 100, 100);
  const friendly = unit(1, 'uaInfantry', TEAM.UA, 110, 100);
  const enemy = unit(2, 'ruInfantry', TEAM.RU, 112, 100);
  const game = gameWith([transport, friendly, enemy]);

  const result = embarkUnits(game, transport, [friendly, enemy]);

  assert.equal(result.ok, false);
  assert.equal(result.status, TRANSPORT_RESULTS.WRONG_TEAM);
  assert.deepEqual(game.units.map((candidate) => candidate.id), [10, 1, 2]);
  assert.deepEqual(transport.passengers, []);
});

test('enforces range, infantry eligibility, and transport capacity', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 100, 100);
  const tank = unit(1, 'uaTank', TEAM.UA, 110, 100);
  const far = unit(2, 'uaInfantry', TEAM.UA, 400, 100);
  const squads = [3, 4, 5, 6, 7].map((id) => unit(id, 'uaInfantry', TEAM.UA, 110 + id, 100));
  const game = gameWith([transport, tank, far, ...squads]);

  assert.equal(embarkUnits(game, transport, [tank]).status, TRANSPORT_RESULTS.INELIGIBLE_PASSENGER);
  assert.equal(embarkUnits(game, transport, [far]).status, TRANSPORT_RESULTS.OUT_OF_RANGE);
  assert.equal(embarkUnits(game, transport, squads).status, TRANSPORT_RESULTS.CAPACITY_EXCEEDED);
  assert.equal(game.units.length, 8);
});

test('plans and performs deterministic disembark while preserving passenger state', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 320, 320);
  const second = unit(2, 'uaMedic', TEAM.UA, 320, 320, { hp: 41, embarkedIn: 10 });
  const first = unit(1, 'uaInfantry', TEAM.UA, 320, 320, { hp: 66, embarkedIn: 10 });
  transport.passengers = [second, first];
  const game = gameWith([transport]);

  const result = disembarkUnits(game, transport, transport.passengers, { grid: openGrid() });

  assert.equal(result.ok, true);
  assert.deepEqual(result.passengerIds, [1, 2]);
  assert.deepEqual(game.units.map((candidate) => candidate.id), [1, 2, 10]);
  assert.equal(first.hp, 66);
  assert.equal(second.hp, 41);
  assert.equal('embarkedIn' in first, false);
  assert.notDeepEqual({ x: first.x, y: first.y }, { x: second.x, y: second.y });
  assert.deepEqual(transport.passengers, []);
});

test('blocked disembark is atomic and leaves cargo aboard', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 320, 320);
  const passenger = unit(1, 'uaInfantry', TEAM.UA, 320, 320, { embarkedIn: 10 });
  transport.passengers = [passenger];
  const game = gameWith([transport]);

  const result = disembarkUnits(game, transport, transport.passengers, { grid: openGrid(() => true) });

  assert.equal(result.ok, false);
  assert.equal(result.status, TRANSPORT_RESULTS.EXIT_BLOCKED);
  assert.deepEqual(game.units.map((candidate) => candidate.id), [10]);
  assert.deepEqual(transport.passengers.map((candidate) => candidate.id), [1]);
  assert.equal(passenger.embarkedIn, 10);
});

test('disembark placement avoids active units, buildings, nodes, and prior passengers', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 320, 320);
  const passenger = unit(1, 'uaInfantry', TEAM.UA, 320, 320, { embarkedIn: 10 });
  transport.passengers = [passenger];
  const blocker = unit(20, 'uaTank', TEAM.UA, 367, 320);
  const game = gameWith([transport, blocker], {
    buildings: [{ id: 30, type: 'hq', team: TEAM.UA, x: 353, y: 353, hp: 100 }],
    nodes: [{ x: 320, y: 367 }],
  });

  const result = disembarkUnits(game, transport, transport.passengers, { grid: openGrid() });

  assert.equal(result.ok, true);
  assert.notDeepEqual({ x: passenger.x, y: passenger.y }, { x: 367, y: 320 });
});

test('catastrophic transport destruction loses all cargo and releases Ukrainian population once', () => {
  const transport = unit(10, 'uaIfv', TEAM.UA, 100, 100, { hp: 0 });
  const infantry = unit(1, 'uaInfantry', TEAM.UA, 100, 100, { embarkedIn: 10, selected: true });
  const medic = unit(2, 'uaMedic', TEAM.UA, 100, 100, { embarkedIn: 10 });
  transport.passengers = [medic, infantry];
  const game = gameWith([transport], { pop: 8 });
  game.selected = new Set([1]);

  const result = resolveDestroyedTransportPassengers(game);

  assert.equal(result.policy, 'catastrophic-loss');
  assert.deepEqual(result.casualties, [
    { passengerId: 1, transportId: 10 },
    { passengerId: 2, transportId: 10 },
  ]);
  assert.equal(game.player.pop, 4);
  assert.equal(infantry.hp, 0);
  assert.equal(medic.hp, 0);
  assert.deepEqual(transport.passengers, []);
  assert.deepEqual([...game.selected], []);
  assert.equal(resolveDestroyedTransportPassengers(game).casualties.length, 0);
  assert.equal(game.player.pop, 4);
});

test('controller installs command-boundary embark, disembark, add-unit, and cleanup behavior', () => {
  let nextId = 20;
  const transport = unit(10, 'uaIfv', TEAM.UA, 320, 320);
  const passenger = unit(1, 'uaInfantry', TEAM.UA, 330, 320, { selected: true });
  const game = gameWith([transport, passenger], { pop: 6 });
  game.selected = new Set([1]);
  game.unitStats = (type) => UNIT_TYPES[type];
  game.selectedUnits = function selectedUnits() {
    return this.units.filter((candidate) => candidate.team === TEAM.UA && this.selected.has(candidate.id));
  };
  game.select = function select(entity) {
    this.selected.clear();
    this.units.forEach((candidate) => { candidate.selected = false; });
    if (entity) {
      this.selected.add(entity.id);
      entity.selected = true;
    }
  };
  game.addUnit = function addUnit(type, team, x, y) {
    const created = unit(nextId++, type, team, x, y);
    this.units.push(created);
    return created;
  };
  game.issue = function originalIssue() { this.originalIssueCalled = true; return true; };
  game.removeDestroyedEntities = function originalCleanup() {
    this.units = this.units.filter((candidate) => candidate.hp > 0);
  };

  const dispose = createTransportController(game, { synchronizeNavigation: () => ({ grid: openGrid() }) });
  const createdIfv = game.addUnit('uaIfv', TEAM.UA, 500, 500);
  assert.deepEqual(createdIfv.passengers, []);

  assert.equal(game.issue(320, 320, transport), true);
  assert.deepEqual(transport.passengers.map((candidate) => candidate.id), [1]);
  assert.deepEqual([...game.selected], [10]);
  assert.equal(game.lastCommandMessage, '1 squad embarked.');

  assert.equal(game.disembarkSelected(), true);
  assert.deepEqual(transport.passengers, []);
  assert.equal(game.units.some((candidate) => candidate.id === 1), true);
  assert.equal(game.lastCommandMessage, '1 squad disembarked.');

  transport.passengers = [passenger];
  passenger.embarkedIn = 10;
  game.units = game.units.filter((candidate) => candidate !== passenger);
  transport.hp = 0;
  game.removeDestroyedEntities();
  assert.equal(game.units.includes(transport), false);
  assert.equal(game.player.pop, 4);

  dispose();
  assert.equal('disembarkSelected' in game, false);
});
