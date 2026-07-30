import test from 'node:test';
import assert from 'node:assert/strict';

import { TEAM } from '../../src/config.js';
import {
  COMMAND_CAPACITY_AI_ACTIONS,
  COMMAND_CAPACITY_EVENT_LIMIT,
  COMMAND_CAPACITY_STATES,
  canReserveCommandCapacity,
  commandCapacityFielded,
  commandCapacityReservations,
  commandCapacitySources,
  createCommandCapacityController,
  createCommandCapacitySnapshot,
  inferCommandCapacityBase,
  reconcileCommandCapacity,
} from '../../src/systems/command-capacity-system.js';
import { installCommandCapacityFeedback } from '../../src/ui/command-capacity-feedback.js';

function fixture({ base = 14 } = {}) {
  const depot = {
    id: 20,
    type: 'depot',
    team: TEAM.UA,
    hp: 680,
    underConstruction: false,
    capacityGranted: true,
    queue: [],
  };
  const hq = {
    id: 10,
    type: 'hq',
    team: TEAM.UA,
    hp: 1500,
    underConstruction: false,
    capacityGranted: true,
    queue: [],
  };
  const game = {
    units: [],
    buildings: [depot, hq],
    player: { pop: 0, cap: base + 8 },
    time: 0,
  };
  return { game, depot, hq, base };
}

function addUnit(game, { id, type = 'uaInfantry', cost, passengers = [], hp = 100 } = {}) {
  const unit = { id, type, team: TEAM.UA, hp, passengers };
  if (cost != null) unit.commandCapacityCost = cost;
  game.units.push(unit);
  return unit;
}

function fakeClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    has(name) { return values.has(name); },
  };
}

test('derives active sources while excluding unavailable capacity providers', () => {
  const { game } = fixture();
  game.buildings.push(
    { id: 30, type: 'depot', team: TEAM.UA, hp: 680, underConstruction: true, capacityGranted: false, queue: [] },
    { id: 40, type: 'depot', team: TEAM.UA, hp: 0, underConstruction: false, capacityGranted: true, queue: [] },
    { id: 50, type: 'depot', team: TEAM.RU, hp: 680, underConstruction: false, capacityGranted: true, queue: [] },
  );
  assert.deepEqual(commandCapacitySources(game), [
    { buildingId: 20, type: 'depot', capacity: 8 },
  ]);
  assert.equal(inferCommandCapacityBase(game), 14);
});

test('separates fielded units, embarked passengers, and queued reservations', () => {
  const { game } = fixture();
  const passenger = { id: 4, type: 'uaInfantry', team: TEAM.UA, hp: 100, embarkedIn: 2 };
  addUnit(game, { id: 3, type: 'uaEngineer' });
  addUnit(game, { id: 2, type: 'uaIfv', passengers: [passenger] });
  game.buildings[0].queue.push({ id: '20:1', type: 'uaDrone', pop: 2, reserved: true });

  const snapshot = createCommandCapacitySnapshot(game);
  assert.equal(snapshot.baseCapacity, 14);
  assert.equal(snapshot.sourceCapacity, 8);
  assert.equal(snapshot.capacity, 22);
  assert.equal(snapshot.fielded, 7);
  assert.equal(snapshot.reserved, 2);
  assert.equal(snapshot.used, 9);
  assert.equal(snapshot.available, 13);
  assert.deepEqual(commandCapacityFielded(game).map((entry) => entry.unitId), [2, 3, 4]);
  assert.deepEqual(commandCapacityReservations(game), [
    { buildingId: 20, itemId: '20:1', type: 'uaDrone', cost: 2 },
  ]);
});

test('orders source and reservation records deterministically', () => {
  const { game, depot } = fixture();
  game.buildings.unshift({ id: 5, type: 'depot', team: TEAM.UA, hp: 1, queue: [] });
  depot.queue.push(
    { id: 'z', type: 'uaDrone', pop: 2, reserved: true },
    { id: 'a', type: 'uaEngineer', pop: 1, reserved: true },
  );
  assert.deepEqual(commandCapacitySources(game).map((entry) => entry.buildingId), [5, 20]);
  assert.deepEqual(commandCapacityReservations(game).map((entry) => entry.itemId), ['a', 'z']);
});

test('emits normal, near, full, and over-cap states with immutable warnings and AI directives', () => {
  const { game } = fixture({ base: 10 });
  game.buildings = [];
  addUnit(game, { id: 1, cost: 4 });
  let snapshot = createCommandCapacitySnapshot(game, { baseCapacity: 10 });
  assert.equal(snapshot.state, COMMAND_CAPACITY_STATES.NORMAL);
  assert.equal(snapshot.ai.action, COMMAND_CAPACITY_AI_ACTIONS.MAINTAIN);

  addUnit(game, { id: 2, cost: 5 });
  snapshot = createCommandCapacitySnapshot(game, { baseCapacity: 10 });
  assert.equal(snapshot.state, COMMAND_CAPACITY_STATES.NEAR);
  assert.equal(snapshot.warning.id, 'command-capacity-near');
  assert.equal(snapshot.ai.action, COMMAND_CAPACITY_AI_ACTIONS.PREPARE);

  addUnit(game, { id: 3, cost: 1 });
  snapshot = createCommandCapacitySnapshot(game, { baseCapacity: 10 });
  assert.equal(snapshot.state, COMMAND_CAPACITY_STATES.FULL);
  assert.equal(snapshot.ai.haltNewReservations, true);

  addUnit(game, { id: 4, cost: 3 });
  snapshot = createCommandCapacitySnapshot(game, { baseCapacity: 10 });
  assert.equal(snapshot.state, COMMAND_CAPACITY_STATES.OVER);
  assert.equal(snapshot.overBy, 3);
  assert.equal(snapshot.ai.action, COMMAND_CAPACITY_AI_ACTIONS.RESTORE);
  assert.equal(snapshot.ai.preserveExistingQueues, true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.warning), true);
  assert.equal(Object.isFrozen(snapshot.ai), true);
});

test('blocks only new reservations while preserving existing forces and queues after source loss', () => {
  const { game, depot, hq } = fixture();
  addUnit(game, { id: 1, cost: 14 });
  hq.queue.push({ id: 'queued', type: 'uaTank', pop: 5, reserved: true });
  let snapshot = createCommandCapacitySnapshot(game);
  assert.equal(snapshot.used, 19);
  assert.equal(snapshot.capacity, 22);
  assert.equal(canReserveCommandCapacity(game, 3).ok, true);

  depot.hp = 0;
  snapshot = createCommandCapacitySnapshot(game, { baseCapacity: 14 });
  assert.equal(snapshot.state, COMMAND_CAPACITY_STATES.OVER);
  assert.equal(snapshot.used, 19);
  assert.equal(snapshot.capacity, 14);
  assert.equal(snapshot.overBy, 5);
  assert.equal(snapshot.preservesExistingForces, true);
  assert.equal(snapshot.preservesExistingReservations, true);
  assert.equal(game.units.length, 1);
  assert.equal(hq.queue.length, 1);
  assert.equal(canReserveCommandCapacity(game, 1, { baseCapacity: 14 }).ok, false);
});

test('ignores reservations owned by destroyed buildings and released queue items', () => {
  const { game, depot } = fixture();
  depot.queue.push(
    { id: 'active', type: 'uaTank', pop: 5, reserved: true },
    { id: 'released', type: 'uaDrone', pop: 2, reserved: false },
  );
  assert.equal(commandCapacityReservations(game).length, 1);
  depot.hp = 0;
  assert.equal(commandCapacityReservations(game).length, 0);
});

test('reservation checks report deterministic availability and over-cap reasons', () => {
  const { game } = fixture({ base: 5 });
  game.buildings = [];
  addUnit(game, { id: 1, cost: 4 });
  assert.deepEqual(canReserveCommandCapacity(game, 1, { baseCapacity: 5 }), {
    ok: true,
    requested: 1,
    used: 4,
    capacity: 5,
    available: 1,
    overBy: 0,
    reason: '',
  });
  assert.match(canReserveCommandCapacity(game, 2, { baseCapacity: 5 }).reason, /2 requested, 1 available/);
  addUnit(game, { id: 2, cost: 3 });
  assert.match(canReserveCommandCapacity(game, 1, { baseCapacity: 5 }).reason, /exceeded by 2/);
  assert.throws(() => canReserveCommandCapacity(game, -1), /non-negative/);
});

test('reconciliation updates compatibility projections without mutating entities', () => {
  const { game, depot } = fixture();
  const unit = addUnit(game, { id: 1, type: 'uaTank' });
  depot.queue.push({ id: 'q', type: 'uaDrone', pop: 2, reserved: true });
  game.player.pop = 999;
  game.player.cap = 999;
  const snapshot = reconcileCommandCapacity(game, { baseCapacity: 14 });
  assert.equal(game.player.fieldedPop, 5);
  assert.equal(game.player.reservedPop, 2);
  assert.equal(game.player.pop, 7);
  assert.equal(game.player.cap, 22);
  assert.equal(game.commandCapacityState, snapshot);
  assert.equal(unit.hp, 100);
  assert.equal(depot.queue[0].reserved, true);
});

test('controller infers mission base, reconciles fixed-step changes, and records transitions', () => {
  const game = {
    units: [],
    buildings: [],
    player: null,
    time: 0,
    start() {
      this.player = { pop: 999, cap: 22 };
      this.units = [{ id: 1, type: 'uaInfantry', team: TEAM.UA, hp: 100 }];
      this.buildings = [{ id: 2, type: 'depot', team: TEAM.UA, hp: 680, capacityGranted: true, queue: [] }];
      return 'started';
    },
    update(step) {
      this.time += step;
      return 'updated';
    },
  };
  const dispose = createCommandCapacityController(game);
  assert.equal(game.start(), 'started');
  assert.equal(game.commandCapacityBase, 14);
  assert.equal(game.player.pop, 2);
  assert.equal(game.player.cap, 22);
  assert.equal(game.commandCapacityEvents.length, 1);
  game.buildings[0].hp = 0;
  assert.equal(game.update(0.05), 'updated');
  assert.equal(game.player.cap, 14);
  assert.equal(game.commandCapacityEvents.at(-1).reason, 'simulation-step');
  assert.equal(game.commandCapacityAiDirective().action, COMMAND_CAPACITY_AI_ACTIONS.MAINTAIN);
  dispose();
  assert.equal(game.commandCapacitySnapshot, undefined);
});

test('controller bounds transition history', () => {
  const { game } = fixture({ base: 100 });
  game.start = () => true;
  game.update = () => true;
  const dispose = createCommandCapacityController(game, { baseCapacity: 100 });
  for (let index = 0; index < COMMAND_CAPACITY_EVENT_LIMIT + 5; index += 1) {
    if (index % 2 === 0) addUnit(game, { id: 1000 + index, cost: 1 });
    else game.units.pop();
    game.reconcileCommandCapacity('test-change');
  }
  assert.equal(game.commandCapacityEvents.length, COMMAND_CAPACITY_EVENT_LIMIT);
  assert.ok(game.commandCapacityEvents[0].sequence > 1);
  dispose();
});

test('UI feedback exposes fielded/reserved detail and warns on over-cap transitions', () => {
  const snapshots = [
    Object.freeze({ used: 9, capacity: 10, fielded: 7, reserved: 2, available: 1, state: 'near', warning: { message: 'near' } }),
    Object.freeze({ used: 12, capacity: 10, fielded: 10, reserved: 2, available: 0, state: 'over', warning: { message: 'over warning' } }),
    Object.freeze({ used: 8, capacity: 10, fielded: 8, reserved: 0, available: 2, state: 'normal', warning: null }),
  ];
  let index = 0;
  const element = {
    textContent: '',
    title: '',
    attrs: {},
    classList: fakeClassList(),
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const game = { commandCapacitySnapshot: () => snapshots[index] };
  const messages = [];
  const ui = {
    e: { pop: element },
    refresh() { return 'base'; },
    toast(message) { messages.push(message); },
  };
  const dispose = installCommandCapacityFeedback({ game, ui });
  assert.equal(ui.refresh(), 'base');
  assert.equal(element.textContent, '9/10');
  assert.match(element.title, /Fielded 7; reserved 2/);
  assert.equal(element.classList.has('capacity-warning'), true);
  index = 1;
  ui.refresh();
  assert.deepEqual(messages, ['over warning']);
  assert.equal(element.textContent, '12/10 ⚠');
  assert.equal(element.classList.has('over-cap'), true);
  index = 2;
  ui.refresh();
  assert.deepEqual(messages, ['over warning', 'Command capacity restored. New unit reservations are available again.']);
  dispose();
});

test('snapshots are JSON-compatible and reject invalid base capacity', () => {
  const { game } = fixture();
  addUnit(game, { id: 1, type: 'uaEngineer' });
  const snapshot = createCommandCapacitySnapshot(game);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).used, 1);
  assert.throws(() => createCommandCapacitySnapshot(game, { baseCapacity: -1 }), /non-negative/);
});
