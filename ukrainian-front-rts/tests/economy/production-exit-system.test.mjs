import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  MAX_RALLY_WAYPOINTS,
  applyProductionRally,
  clearProductionRally,
  createProductionExitController,
  ensureProductionExitState,
  productionRallySnapshot,
  resolveProductionExit,
  setProductionRally,
  spawnProducedUnit,
} from '../../src/systems/production-exit-system.js';
import { updateProductionQueues } from '../../src/systems/production-queue-system.js';
import { installProductionRallyInput } from '../../src/input/production-rally-input.js';
import { installProductionExitFeedback } from '../../src/ui/production-exit-feedback.js';

function grid({ blocked = new Set(), width = 80, height = 52 } = {}) {
  return {
    width,
    height,
    tileSize: 32,
    isPassable(x, y, { footprint = { width: 1, height: 1 }, layer } = {}) {
      if (layer === 'air') {
        return x >= 0 && y >= 0 && x + footprint.width <= width && y + footprint.height <= height;
      }
      for (let yy = y; yy < y + footprint.height; yy += 1) {
        for (let xx = x; xx < x + footprint.width; xx += 1) {
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || blocked.has(`${xx},${yy}`)) return false;
        }
      }
      return true;
    },
  };
}

function gameFixture(options = {}) {
  const building = {
    id: 10,
    type: 'barracks',
    team: TEAM.UA,
    x: 320,
    y: 240,
    hp: 500,
    placement: { origin: { x: 8, y: 6 }, footprint: { width: 3, height: 2 } },
    queue: [],
  };
  const game = {
    buildings: [building],
    units: options.units ?? [],
    selected: [building],
    lastError: '',
    time: 12,
    nextId: 100,
    player: { metal: 1000, fuel: 1000, intel: 1000, pop: 0, cap: 100 },
    start() { this.units = []; this.buildings = []; },
    selectedEntities() { return this.selected; },
    selectedUnits() { return this.selected.filter((entity) => this.units.includes(entity)); },
    buildingCanProduce(target, type) { return target.type === 'barracks' && type === 'uaInfantry'; },
    heroAlreadyFieldedOrQueued() { return false; },
    addUnit(type, team, x, y) {
      const unit = { id: this.nextId++, type, team, x, y, hp: 100 };
      this.units.push(unit);
      if (team === TEAM.UA) this.player.pop += UNIT_TYPES[type]?.pop || 0;
      return unit;
    },
    addBuilding(type, team, x, y) {
      const created = { id: 20, type, team, x, y, hp: 500 };
      this.buildings.push(created);
      return created;
    },
    worldPos(x, y) { return { x, y }; },
  };
  return { game, building };
}

function eventTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, handler, capture) { handlers.set(`${type}:${capture}`, handler); },
    removeEventListener(type, handler, capture) {
      if (handlers.get(`${type}:${capture}`) === handler) handlers.delete(`${type}:${capture}`);
    },
  };
}

test('rally points replace, append, cap, snapshot, and clear deterministically', () => {
  const { game, building } = gameFixture();
  assert.equal(setProductionRally(game, 100, 120, { building }), true);
  assert.equal(setProductionRally(game, 140, 160, { building, append: true }), true);
  assert.deepEqual(productionRallySnapshot(building).waypoints, [{ x: 100, y: 120 }, { x: 140, y: 160 }]);
  for (let index = 2; index < MAX_RALLY_WAYPOINTS; index += 1) {
    assert.equal(setProductionRally(game, 160 + index, 180, { building, append: true }), true);
  }
  assert.equal(setProductionRally(game, 200, 200, { building, append: true }), false);
  assert.match(game.lastError, /limited/);
  assert.equal(clearProductionRally(game, building), true);
  assert.deepEqual(building.rallyWaypoints, []);
});

test('non-production structures cannot receive rally points', () => {
  const { game } = gameFixture();
  const depot = { id: 30, type: 'depot', team: TEAM.UA, hp: 500 };
  game.buildings.push(depot);
  assert.equal(setProductionRally(game, 100, 100, { building: depot }), false);
  assert.match(game.lastError, /production building/);
});

test('default spawn side preserves south-first legacy behavior', () => {
  const { game, building } = gameFixture();
  const exit = resolveProductionExit(game, building, 'uaInfantry', { navigationState: { grid: grid() } });
  assert.equal(exit.side, 'south');
  assert.equal(exit.ring, 1);
});

test('first rally point selects the closest valid spawn side', () => {
  const { game, building } = gameFixture();
  setProductionRally(game, 320, 10, { building });
  const exit = resolveProductionExit(game, building, 'uaInfantry', { navigationState: { grid: grid() } });
  assert.equal(exit.side, 'north');
});

test('blocked immediate exits use the first deterministic fallback ring', () => {
  const blocked = new Set();
  for (let x = 7; x <= 11; x += 1) {
    blocked.add(`${x},5`);
    blocked.add(`${x},8`);
  }
  for (let y = 5; y <= 8; y += 1) {
    blocked.add(`7,${y}`);
    blocked.add(`11,${y}`);
  }
  const { game, building } = gameFixture();
  const exit = resolveProductionExit(game, building, 'uaInfantry', {
    navigationState: { grid: grid({ blocked }) },
  });
  assert.equal(exit.ring, 2);
  assert.equal(exit.blockedFallback, true);
});

test('fully blocked exits return null instead of spawning inside the building', () => {
  const blocked = new Set();
  for (let y = 0; y < 52; y += 1) for (let x = 0; x < 80; x += 1) blocked.add(`${x},${y}`);
  const { game, building } = gameFixture();
  assert.equal(resolveProductionExit(game, building, 'uaInfantry', {
    navigationState: { grid: grid({ blocked }) },
    maxRings: 3,
  }), null);
});

test('live unit occupancy disqualifies an otherwise valid exit', () => {
  const occupying = { id: 1, type: 'uaIfv', team: TEAM.UA, x: 272, y: 288, hp: 100 };
  const { game, building } = gameFixture({ units: [occupying] });
  const exit = resolveProductionExit(game, building, 'uaInfantry', { navigationState: { grid: grid() } });
  assert.notDeepEqual({ x: exit.x, y: exit.y }, { x: occupying.x, y: occupying.y });
});

test('rally queues become FIFO move orders on produced units', () => {
  const { building } = gameFixture();
  ensureProductionExitState(building);
  building.rallyWaypoints = Object.freeze([{ x: 100, y: 100 }, { x: 200, y: 220 }]);
  const unit = { id: 1, type: 'uaInfantry' };
  const orders = applyProductionRally(unit, building);
  assert.equal(orders.length, 2);
  assert.deepEqual(unit.order, orders[0]);
  assert.equal(unit.order.rallyBuildingId, building.id);
});

test('spawn records immutable acknowledgement and rally inheritance', () => {
  const { game, building } = gameFixture();
  setProductionRally(game, 500, 400, { building });
  const unit = spawnProducedUnit(game, building, { type: 'uaInfantry' }, {
    synchronizeNavigation: () => ({ grid: grid() }),
  });
  assert.ok(unit);
  assert.equal(unit.order.x, 500);
  assert.equal(game.productionAcknowledgements.length, 1);
  assert.equal(game.productionAcknowledgements[0].unitId, unit.id);
  assert.equal(Object.isFrozen(game.productionAcknowledgements[0]), true);
  const workshop = { ...building, id: 11, type: 'workshop', rallyWaypoints: [] };
  game.buildings.push(workshop);
  const second = spawnProducedUnit(game, workshop, { type: 'uaDrone' }, {
    synchronizeNavigation: () => ({ grid: grid() }),
  });
  assert.ok(second);
  assert.deepEqual(game.productionAcknowledgements.map((entry) => entry.sequence), [1, 2]);
});

test('blocked queue completion keeps the item and reservation until a later retry succeeds', () => {
  const { game, building } = gameFixture();
  const item = {
    id: '10:1', type: 'uaInfantry', duration: 5, left: 0,
    cost: { metal: 85 }, pop: 2, reserved: true, started: true,
  };
  building.queue = [item];
  game.player.pop = 2;
  game.spawnProducedUnit = () => null;
  updateProductionQueues(game, 0.1);
  assert.equal(building.queue.length, 1);
  assert.equal(building.queue[0], item);
  assert.equal(item.left, 0);
  assert.equal(item.reserved, true);
  assert.equal(game.player.pop, 2);

  game.spawnProducedUnit = () => { game.player.pop += 2; return { id: 99, type: 'uaInfantry' }; };
  updateProductionQueues(game, 0.1);
  assert.equal(building.queue.length, 0);
  assert.equal(item.reserved, false);
  assert.equal(game.player.pop, 2);
});

test('repeat production is enqueued after a successful blocked-exit retry', () => {
  const { game, building } = gameFixture();
  building.queue = [{
    id: '10:1', type: 'uaInfantry', duration: 5, left: 0,
    cost: { metal: 85 }, pop: 2, reserved: true, started: true,
  }];
  building.productionRepeat = true;
  building.productionRepeatType = 'uaInfantry';
  game.player.pop = 2;
  game.spawnProducedUnit = () => { game.player.pop += 2; return { id: 99, type: 'uaInfantry' }; };
  updateProductionQueues(game, 0.1);
  assert.equal(building.queue.length, 1);
  assert.equal(building.queue[0].type, 'uaInfantry');
  assert.equal(building.queue[0].repeated, true);
  assert.equal(game.player.pop, 4);
  assert.equal(game.player.metal, 915);
});


test('legacy production completion remains compatible when no exit controller is installed', () => {
  const { game, building } = gameFixture();
  building.queue = [{
    id: '10:1', type: 'uaInfantry', duration: 5, left: 0,
    cost: { metal: 85 }, pop: 2, reserved: true, started: true,
  }];
  game.player.pop = 2;
  updateProductionQueues(game, 0.1);
  assert.equal(game.units.length, 1);
  assert.equal(building.queue.length, 0);
  assert.equal(game.player.pop, 2);
});

test('large deterministic steps preserve unused time after successful exits', () => {
  const { game, building } = gameFixture();
  building.queue = [
    { id: '10:1', type: 'uaInfantry', duration: 5, left: 2, cost: { metal: 85 }, pop: 2, reserved: true },
    { id: '10:2', type: 'uaInfantry', duration: 5, left: 5, cost: { metal: 85 }, pop: 2, reserved: true },
  ];
  game.player.pop = 4;
  updateProductionQueues(game, 4);
  assert.equal(game.units.length, 1);
  assert.equal(building.queue.length, 1);
  assert.equal(building.queue[0].left, 3);
  assert.equal(game.player.pop, 4);
});

test('controller installs spawn hooks and resets acknowledgement state at mission start', () => {
  const { game, building } = gameFixture();
  const dispose = createProductionExitController(game, {
    synchronizeNavigation: () => ({ grid: grid() }),
  });
  assert.equal(typeof game.spawnProducedUnit, 'function');
  assert.equal(typeof game.setProductionRally, 'function');
  game.productionAcknowledgements = [{ sequence: 1 }];
  game.start();
  assert.deepEqual(game.productionAcknowledgements, []);
  dispose();
  assert.equal(game.setProductionRally, undefined);
  assert.equal(game.spawnProducedUnit, undefined);
  assert.equal(building.team, TEAM.UA);
});

test('capture-phase rally input replaces or appends without reaching battlefield orders', () => {
  const { game, building } = gameFixture();
  game.setProductionRally = (x, y, options) => setProductionRally(game, x, y, options);
  const canvas = eventTarget();
  const messages = [];
  const ui = { toast: (message) => messages.push(message), refresh() {} };
  const dispose = installProductionRallyInput({ game, ui, canvas });
  const handler = canvas.handlers.get('contextmenu:true');
  const event = {
    clientX: 100, clientY: 120, shiftKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  handler(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(building.rallyWaypoints, [{ x: 100, y: 120 }]);
  event.clientX = 140;
  event.clientY = 160;
  event.shiftKey = true;
  handler(event);
  assert.deepEqual(building.rallyWaypoints, [{ x: 100, y: 120 }, { x: 140, y: 160 }]);
  assert.match(messages.at(-1), /waypoint 2/);
  dispose();
  assert.equal(canvas.handlers.size, 0);
});

test('feedback adapter emits one player acknowledgement per new deployment', () => {
  const { game, building } = gameFixture();
  const messages = [];
  const ui = {
    e: { stats: { textContent: 'Queue ready' } },
    refreshCount: 0,
    refresh() { this.refreshCount += 1; this.e.stats.textContent = 'Queue ready'; },
    toast(message) { messages.push(message); },
  };
  const dispose = installProductionExitFeedback({ game, ui });
  game.productionAcknowledgements = [Object.freeze({
    sequence: 1,
    buildingId: building.id,
    unitId: 100,
    type: 'uaInfantry',
    rallyWaypointCount: 1,
  })];
  ui.refresh();
  ui.refresh();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /deployed/);
  assert.match(messages[0], /Moving to rally point/);
  building.productionExitBlocked = 'All production exits are blocked.';
  ui.refresh();
  assert.match(ui.e.stats.textContent, /Exit blocked/);
  dispose();
});
