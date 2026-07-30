import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  RESOURCE_DROPOFF_BUILDING_CAPABILITIES,
  RESOURCE_DROPOFF_CAPABILITY_VERSION,
  applyResourceDropOffCapabilities,
  createResourceDropOffController,
  isOperationalResourceDropOff,
  measureResourceDropOffTravelCost,
  resourceDropOffApproachCells,
  resourceDropOffKindsForBuilding,
  selectResourceDropOff,
  validateResourceDropOffCapabilities,
} from '../../src/systems/resource-dropoff-system.js';

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

class TestGrid {
  constructor(width = 10, height = 10, tileSize = 32) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.blocked = new Set();
    this.costs = new Map();
  }

  key(x, y) {
    return `${x},${y}`;
  }

  worldToCell(x, y) {
    const cell = { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) };
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.width || cell.y >= this.height) {
      throw new RangeError('outside grid');
    }
    return cell;
  }

  cellToWorldCenter(x, y) {
    return { x: x * this.tileSize + this.tileSize / 2, y: y * this.tileSize + this.tileSize / 2 };
  }

  isPassable(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && !this.blocked.has(this.key(x, y));
  }

  movementCost(x, y) {
    return this.costs.get(this.key(x, y)) ?? 1;
  }
}

test('validates the versioned capability registry and canonicalizes resource kinds', () => {
  const validated = validateResourceDropOffCapabilities({
    depot: { version: RESOURCE_DROPOFF_CAPABILITY_VERSION, resourceKinds: ['intel', 'metal', 'metal'] },
  });
  assert.deepEqual(validated.depot.resourceKinds, ['metal', 'intel']);
  assert.throws(
    () => validateResourceDropOffCapabilities({ depot: { version: 2, resourceKinds: ['metal'] } }),
    /Unsupported drop-off capability version/,
  );
  assert.throws(
    () => validateResourceDropOffCapabilities({ depot: { version: 1, resourceKinds: ['water'] } }),
    /unknown resource kind/,
  );
});

test('materializes explicit HQ and depot capabilities while leaving other buildings ineligible', () => {
  const hq = building(1, 'hq', 64, 64);
  const depot = building(2, 'depot', 96, 64);
  const barracks = building(3, 'barracks', 128, 64);

  applyResourceDropOffCapabilities(hq);
  applyResourceDropOffCapabilities(depot);
  applyResourceDropOffCapabilities(barracks);

  assert.deepEqual(hq.dropOffKinds, ['metal', 'fuel', 'intel']);
  assert.deepEqual(depot.dropOffKinds, ['metal', 'fuel', 'intel']);
  assert.deepEqual(barracks.dropOffKinds, []);
  assert.equal(hq.dropOffCapabilityVersion, RESOURCE_DROPOFF_CAPABILITY_VERSION);
  assert.equal(Object.isFrozen(hq.dropOffKinds), true);
  assert.deepEqual(resourceDropOffKindsForBuilding(building(4, 'depot', 0, 0, { dropOffKinds: ['fuel'] })), ['fuel']);
  assert.ok(RESOURCE_DROPOFF_BUILDING_CAPABILITIES.depot);
});

test('requires an alive completed friendly building in the live game collection', () => {
  const valid = building(1, 'depot', 64, 64);
  applyResourceDropOffCapabilities(valid);
  const game = { buildings: [valid] };

  assert.equal(isOperationalResourceDropOff(game, valid, 'metal'), true);
  assert.equal(isOperationalResourceDropOff(game, { ...valid }, 'metal'), false);
  valid.underConstruction = true;
  assert.equal(isOperationalResourceDropOff(game, valid, 'metal'), false);
  valid.underConstruction = false;
  valid.team = TEAM.RU;
  assert.equal(isOperationalResourceDropOff(game, valid, 'metal'), false);
  valid.team = TEAM.UA;
  valid.hp = 0;
  assert.equal(isOperationalResourceDropOff(game, valid, 'metal'), false);
});

test('generates deterministic passable interaction-range approach cells', () => {
  const grid = new TestGrid();
  const depot = building(1, 'depot', 160, 160);
  grid.blocked.add('3,3');
  const approaches = resourceDropOffApproachCells(grid, depot);

  assert.ok(approaches.length > 0);
  assert.equal(approaches.some(({ cell }) => cell.x === 3 && cell.y === 3), false);
  const keys = approaches.map(({ cell }) => `${cell.x},${cell.y}`);
  assert.deepEqual(keys, [...keys].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  }));
  for (const approach of approaches) {
    assert.ok(Math.hypot(approach.point.x - depot.x, approach.point.y - depot.y) <= 70 + 1e-9);
  }
});

test('measures authoritative navigation cost to a reachable building perimeter', () => {
  const grid = new TestGrid();
  const depot = building(1, 'depot', 160, 160);
  grid.costs.set('1,0', 4);
  grid.costs.set('0,1', 2);

  const measurement = measureResourceDropOffTravelCost(
    { buildings: [depot] },
    { x: 16, y: 16 },
    depot,
    { navigationState: { grid, revision: 7 } },
  );

  assert.equal(measurement.reachable, true);
  assert.equal(measurement.method, 'navigation');
  assert.equal(measurement.revision, 7);
  assert.ok(Number.isFinite(measurement.cost));
  assert.notDeepEqual(measurement.approach, { x: depot.x, y: depot.y });
});

test('selects by travel cost rather than Euclidean distance', () => {
  const near = building(20, 'depot', 20, 0);
  const far = building(10, 'depot', 100, 0);
  [near, far].forEach((item) => applyResourceDropOffCapabilities(item));
  const game = { buildings: [near, far] };

  const selection = selectResourceDropOff(game, { x: 0, y: 0 }, 'metal', TEAM.UA, {
    travelCost: ({ building: candidate }) => candidate === near ? 50 : 12,
  });

  assert.equal(selection.building, far);
  assert.equal(selection.travelCost, 12);
  assert.equal(selection.method, 'injected');
});

test('excludes unreachable candidates and uses stable identity for equal costs', () => {
  const first = building(8, 'depot', 20, 0);
  const lowerId = building(3, 'depot', 100, 0);
  const unreachable = building(1, 'depot', 5, 0);
  [first, lowerId, unreachable].forEach((item) => applyResourceDropOffCapabilities(item));
  const game = { buildings: [first, lowerId, unreachable] };

  const selection = selectResourceDropOff(game, { x: 0, y: 0 }, 'fuel', TEAM.UA, {
    travelCost: ({ building: candidate }) => candidate === unreachable
      ? { reachable: false, cost: Infinity }
      : 10,
  });

  assert.equal(selection.building, lowerId);
});

test('retains deterministic distance fallback for isolated fixtures without navigation', () => {
  const near = building(9, 'hq', 10, 0);
  const far = building(1, 'depot', 50, 0);
  [near, far].forEach((item) => applyResourceDropOffCapabilities(item));
  const game = { buildings: [far, near] };

  const selection = selectResourceDropOff(game, { x: 0, y: 0 }, 'intel');
  assert.equal(selection.building, near);
  assert.equal(selection.method, 'distance-fallback');
});

function controllerFixture({ grid = new TestGrid(), buildings = [] } = {}) {
  const game = {
    buildings,
    lastError: '',
    start() {
      this.buildings = [building(11, 'hq', 256, 256)];
      return 'started';
    },
    addBuilding(type, team, x, y) {
      const created = building(this.buildings.length + 20, type, x, y, { team });
      this.buildings.push(created);
      return created;
    },
    updateWorker(unit) {
      this.workerUpdates = (this.workerUpdates ?? 0) + 1;
      if (unit.order?.kind === 'return') this.move(unit, unit.order.target.x, unit.order.target.y, 1 / 30);
    },
    move(unit, x, y) {
      this.lastMove = { unit, x, y };
      return true;
    },
  };
  const synchronizeNavigation = () => ({ grid, revision: 4 });
  return { game, synchronizeNavigation };
}

test('controller materializes lifecycle capabilities, retargets returns, and moves to the chosen approach', () => {
  const hq = building(10, 'hq', 256, 256);
  const depot = building(2, 'depot', 96, 96);
  const { game, synchronizeNavigation } = controllerFixture({ buildings: [hq, depot] });
  const originalUpdateWorker = game.updateWorker;
  const dispose = createResourceDropOffController(game, { synchronizeNavigation });

  try {
    assert.deepEqual(hq.dropOffKinds, ['metal', 'fuel', 'intel']);
    assert.deepEqual(depot.dropOffKinds, ['metal', 'fuel', 'intel']);

    const worker = {
      id: 1,
      team: TEAM.UA,
      x: 16,
      y: 16,
      carry: 20,
      carryKind: 'metal',
      order: { kind: 'return', target: hq },
      target: null,
    };
    game.updateWorker(worker, { worker: true }, 1 / 30);

    assert.equal(worker.order.target, depot);
    assert.equal(worker.order.dropOffNavigationRevision, 4);
    assert.ok(worker.order.dropOffApproach);
    assert.notDeepEqual(game.lastMove, { unit: worker, x: depot.x, y: depot.y });
    assert.deepEqual(
      { x: game.lastMove.x, y: game.lastMove.y },
      worker.order.dropOffApproach,
    );

    const added = game.addBuilding('depot', TEAM.UA, 160, 32);
    assert.deepEqual(added.dropOffKinds, ['metal', 'fuel', 'intel']);

    assert.equal(game.start(), 'started');
    assert.deepEqual(game.buildings[0].dropOffKinds, ['metal', 'fuel', 'intel']);
    assert.equal(typeof game.selectResourceDropOff, 'function');
  } finally {
    dispose();
  }

  assert.equal(game.updateWorker, originalUpdateWorker);
  assert.equal(game.selectResourceDropOff, undefined);
});

test('controller cancels a return safely when every valid drop-off is unreachable', () => {
  const grid = new TestGrid();
  const depot = building(2, 'depot', 96, 96);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) grid.blocked.add(`${x},${y}`);
  }
  grid.blocked.delete('0,0');
  const { game, synchronizeNavigation } = controllerFixture({ grid, buildings: [depot] });
  const dispose = createResourceDropOffController(game, { synchronizeNavigation });
  try {
    const worker = {
      id: 1,
      team: TEAM.UA,
      x: 16,
      y: 16,
      carry: 20,
      carryKind: 'metal',
      order: { kind: 'return', target: depot },
      target: null,
    };
    game.updateWorker(worker, { worker: true }, 1 / 30);
    assert.equal(worker.order, null);
    assert.match(game.lastError, /No reachable drop-off accepts metal/);
    assert.equal(game.workerUpdates, undefined);
  } finally {
    dispose();
  }
});
