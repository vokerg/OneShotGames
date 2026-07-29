import test from 'node:test';
import assert from 'node:assert/strict';

import { TEAM } from '../../src/config.js';
import {
  assignWorkerToResource,
  buildingAcceptsResource,
  createWorkerGatherController,
  findNearestDropOff,
  findNearestResourceNode,
  updateWorkerGather,
  WORKER_CARRY_CAPACITY,
} from '../../src/systems/worker-gather-system.js';

function worker(id, x = 0, y = 0, overrides = {}) {
  return {
    id,
    type: 'uaEngineer',
    team: TEAM.UA,
    x,
    y,
    hp: 78,
    carry: 0,
    carryKind: null,
    order: null,
    target: null,
    orderQueue: [],
    ...overrides,
  };
}

function node(kind, x, y, amount = 100, id = undefined) {
  return { ...(id === undefined ? {} : { id }), kind, x, y, amount };
}

function building(id, type, x, y, overrides = {}) {
  return {
    id,
    type,
    team: TEAM.UA,
    x,
    y,
    hp: 100,
    underConstruction: false,
    ...overrides,
  };
}

function gameFixture({ workers = [worker(1)], nodes = [], buildings = [building(10, 'hq', 100, 0)] } = {}) {
  const selectedIds = new Set(workers.map((unit) => unit.id));
  return {
    units: workers,
    nodes,
    buildings,
    selected: selectedIds,
    player: { metal: 0, fuel: 0, intel: 0, mined: 0 },
    gameOver: false,
    lastError: '',
    pendingBuild: null,
    unitStats: () => ({ worker: true }),
    selectedUnits() {
      return this.units.filter((unit) => this.selected.has(unit.id));
    },
    move(unit, x, y) {
      unit.x = x;
      unit.y = y;
      return true;
    },
    fail(message) {
      this.lastError = message;
      return false;
    },
    hit() {
      return null;
    },
    issue(x, y, target, options = {}) {
      this.lastIssued = { x, y, target, options };
      this.selectedUnits().forEach((unit) => {
        unit.order = { kind: 'move', x, y };
        unit.target = target || null;
      });
      return true;
    },
    stopSelected() {
      this.selectedUnits().forEach((unit) => {
        unit.order = null;
        unit.target = null;
      });
      return true;
    },
    updateWorker(unit) {
      this.legacyWorkerUpdates = (this.legacyWorkerUpdates || 0) + 1;
      if (!unit.order) unit.order = { kind: 'legacy-auto-gather' };
    },
    placeBuilding() {
      const selected = this.units.find((unit) => unit.id === this.pendingBuild?.workerId);
      if (selected) selected.order = { kind: 'construct' };
      this.pendingBuild = null;
      return true;
    },
  };
}

const workerStats = { worker: true };

test('selects resource sources deterministically by distance then identity', () => {
  const a = node('metal', 10, 0, 100, 9);
  const b = node('metal', -10, 0, 100, 3);
  const empty = node('metal', 1, 0, 0, 1);
  const fuel = node('fuel', 2, 0, 100, 2);
  const game = gameFixture({ nodes: [a, b, empty, fuel] });

  assert.equal(findNearestResourceNode(game, { x: 0, y: 0 }, 'metal'), b);
  assert.equal(findNearestResourceNode(game, { x: 0, y: 0 }, 'intel'), null);
});

test('selects the nearest valid completed friendly drop-off deterministically', () => {
  const farHq = building(8, 'hq', 50, 0);
  const closeDepot = building(4, 'depot', 10, 0, { dropOffKinds: ['metal'] });
  const enemy = building(1, 'hq', 1, 0, { team: TEAM.RU });
  const unfinished = building(2, 'depot', 2, 0, { dropOffKinds: ['metal'], underConstruction: true });
  const game = gameFixture({ buildings: [farHq, closeDepot, enemy, unfinished] });

  assert.equal(buildingAcceptsResource(game, farHq, 'fuel'), true);
  assert.equal(buildingAcceptsResource(game, closeDepot, 'fuel'), false);
  assert.equal(findNearestDropOff(game, { x: 0, y: 0 }, 'metal'), closeDepot);
  assert.equal(findNearestDropOff(game, { x: 0, y: 0 }, 'fuel'), farHq);
});

test('requires explicit assignment and gathers, returns, deposits, and resumes', () => {
  const engineer = worker(1, 0, 0);
  const source = node('metal', 0, 0, 100);
  const hq = building(10, 'hq', 5, 0);
  const game = gameFixture({ workers: [engineer], nodes: [source], buildings: [hq] });

  assert.equal(assignWorkerToResource(game, engineer, 'metal', source).ok, true);
  assert.equal(engineer.gatherKind, 'metal');
  updateWorkerGather(game, engineer, workerStats, 3);
  assert.equal(engineer.carry, WORKER_CARRY_CAPACITY);
  assert.equal(engineer.order.kind, 'return');

  updateWorkerGather(game, engineer, workerStats, 1 / 30);
  assert.equal(game.player.metal, WORKER_CARRY_CAPACITY);
  assert.equal(game.player.mined, WORKER_CARRY_CAPACITY);
  assert.equal(engineer.carry, 0);
  assert.equal(engineer.order.kind, 'gather');
  assert.equal(engineer.order.target, source);
});

test('retargets a depleted source to the nearest active source of the assigned kind', () => {
  const engineer = worker(1, 0, 0);
  const depleted = node('fuel', 0, 0, 0);
  const far = node('fuel', 20, 0, 100, 8);
  const near = node('fuel', 10, 0, 100, 3);
  const game = gameFixture({ workers: [engineer], nodes: [depleted, far, near] });
  engineer.gatherKind = 'fuel';
  engineer.order = { kind: 'gather', target: depleted, resourceKind: 'fuel' };

  updateWorkerGather(game, engineer, workerStats, 1 / 30);
  assert.equal(engineer.order.kind, 'gather');
  assert.equal(engineer.order.target, near);
});

test('delivers an old resource before applying a new player assignment', () => {
  const engineer = worker(1, 0, 0, { carry: 12, carryKind: 'fuel' });
  const source = node('metal', 30, 0, 100);
  const hq = building(10, 'hq', 5, 0);
  const game = gameFixture({ workers: [engineer], nodes: [source], buildings: [hq] });

  const result = assignWorkerToResource(game, engineer, 'metal', source);
  assert.equal(result.ok, true);
  assert.equal(engineer.gatherKind, 'metal');
  assert.equal(engineer.order.kind, 'return');
  assert.equal(engineer.order.resourceKind, 'fuel');
  assert.equal(engineer.order.resumeKind, 'metal');

  updateWorkerGather(game, engineer, workerStats, 1 / 30);
  assert.equal(game.player.fuel, 12);
  assert.equal(engineer.order.kind, 'gather');
  assert.equal(engineer.order.target, source);
});

test('controller exposes resource right-click assignment and suppresses idle auto-gather', () => {
  const engineer = worker(1, 0, 0);
  const source = node('intel', 10, 0, 100);
  const game = gameFixture({ workers: [engineer], nodes: [source] });
  const dispose = createWorkerGatherController(game);
  try {
    assert.equal(game.hit(source.x, source.y), source);
    assert.equal(game.issue(source.x, source.y, source), true);
    assert.equal(engineer.gatherKind, 'intel');
    assert.equal(engineer.order.kind, 'gather');

    engineer.order = null;
    engineer.target = null;
    game.updateWorker(engineer, workerStats, 1 / 30);
    assert.equal(engineer.order, null);
    assert.equal(game.legacyWorkerUpdates, undefined);
  } finally {
    dispose();
  }
});

test('normal orders, Stop, and construction cancel persistent gather assignment', () => {
  const engineer = worker(1, 0, 0);
  const source = node('metal', 10, 0, 100);
  const game = gameFixture({ workers: [engineer], nodes: [source] });
  const dispose = createWorkerGatherController(game);
  try {
    game.issue(source.x, source.y, source);
    game.issue(50, 60, null, { append: true });
    assert.equal(engineer.gatherKind, null);
    assert.deepEqual(engineer.order, { kind: 'move', x: 50, y: 60 });
    assert.equal(game.lastIssued.options.append, false);

    game.issue(source.x, source.y, source);
    game.stopSelected();
    assert.equal(engineer.gatherKind, null);
    assert.equal(engineer.order, null);

    game.issue(source.x, source.y, source);
    game.pendingBuild = { workerId: engineer.id };
    game.placeBuilding(100, 100);
    assert.equal(engineer.gatherKind, null);
    assert.deepEqual(engineer.order, { kind: 'construct' });
  } finally {
    dispose();
  }
});

test('multi-worker assignment preflights every worker before mutating any assignment', () => {
  const valid = worker(1, 0, 0);
  const blocked = worker(2, 0, 0, { carry: 10, carryKind: 'fuel' });
  const source = node('metal', 10, 0, 100);
  const game = gameFixture({ workers: [valid, blocked], nodes: [source], buildings: [] });
  const dispose = createWorkerGatherController(game);
  try {
    assert.equal(game.assignGather('metal', source), false);
    assert.match(game.lastError, /No valid drop-off/);
    assert.equal(valid.gatherKind, undefined);
    assert.equal(valid.order, null);
    assert.equal(blocked.gatherKind, undefined);
  } finally {
    dispose();
  }
});
