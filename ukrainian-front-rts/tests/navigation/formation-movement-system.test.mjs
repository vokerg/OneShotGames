import test from 'node:test';
import assert from 'node:assert/strict';

import { createQueuedOrderController } from '../../src/input/queued-orders.js';
import {
  FORMATION_STATES,
  createFormationAssignments,
  formationRouteDestination,
  resolveFormationWaypoint,
} from '../../src/core/formation.js';

class FakeGrid {
  constructor({ width = 10, height = 10, tileSize = 10 } = {}) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.blocked = new Set();
  }

  block(x, y) {
    this.blocked.add(`${x},${y}`);
  }

  worldToCell(x, y) {
    const cell = { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) };
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.width || cell.y >= this.height) {
      throw new RangeError('outside grid');
    }
    return cell;
  }

  isPassable(x, y) {
    return !this.blocked.has(`${x},${y}`);
  }
}

const units = [
  { id: 3, x: 30, y: 30 },
  { id: 1, x: 10, y: 10 },
  { id: 4, x: 30, y: 10 },
  { id: 2, x: 10, y: 30 },
];

test('formation assignment is deterministic regardless of input order', () => {
  const forward = createFormationAssignments(units, { x: 100, y: 100 }, { spacing: 20 });
  const reversed = createFormationAssignments([...units].reverse(), { x: 100, y: 100 }, { spacing: 20 });
  assert.deepEqual(reversed, forward);
});

test('all assignments share one group anchor and receive unique slots', () => {
  const assignments = createFormationAssignments(units, { x: 100, y: 100 }, { spacing: 20 });
  assert.equal(new Set(assignments.map((entry) => entry.formation.groupId)).size, 1);
  assert.deepEqual(assignments[0].formation.anchorStart, { x: 20, y: 20 });
  assert.deepEqual(assignments[0].formation.anchorDestination, { x: 100, y: 100 });
  assert.equal(new Set(assignments.map((entry) => `${entry.destination.x},${entry.destination.y}`)).size, 4);
});

test('slot assignment preserves deterministic lateral ordering', () => {
  const line = [
    { id: 'left', x: 0, y: 10 },
    { id: 'right', x: 20, y: 10 },
  ];
  const assignments = createFormationAssignments(line, { x: 10, y: -100 }, { spacing: 20 });
  const left = assignments.find((entry) => entry.unitId === 'left');
  const right = assignments.find((entry) => entry.unitId === 'right');
  assert.ok(left.destination.x < right.destination.x);
});

test('formation routing uses the shared anchor destination', () => {
  const [assignment] = createFormationAssignments([{ id: 1, x: 5, y: 5 }], { x: 80, y: 90 });
  assert.deepEqual(formationRouteDestination({ x: 1, y: 2, formation: assignment.formation }), { x: 80, y: 90 });
  assert.deepEqual(formationRouteDestination({ x: 7, y: 8 }), { x: 7, y: 8 });
});

test('open terrain keeps the full formation offset', () => {
  const grid = new FakeGrid();
  const order = { formation: { slotOffset: { x: 20, y: 0 }, compressionSteps: [1, 0.5, 0] } };
  const result = resolveFormationWaypoint(grid, { x: 40, y: 40 }, order, { layer: 'ground' });
  assert.deepEqual(result, { x: 60, y: 40, compression: 1, state: FORMATION_STATES.FORMED });
});

test('blocked full-width slot compresses toward the route anchor', () => {
  const grid = new FakeGrid();
  grid.block(6, 4);
  const order = { formation: { slotOffset: { x: 20, y: 0 }, compressionSteps: [1, 0.5, 0] } };
  const result = resolveFormationWaypoint(grid, { x: 40, y: 40 }, order, { layer: 'ground' });
  assert.deepEqual(result, { x: 50, y: 40, compression: 0.5, state: FORMATION_STATES.COMPRESSED });
});

test('a one-cell choke can collapse a slot completely', () => {
  const grid = new FakeGrid();
  grid.block(6, 4);
  grid.block(5, 4);
  const order = { formation: { slotOffset: { x: 20, y: 0 }, compressionSteps: [1, 0.5, 0] } };
  const result = resolveFormationWaypoint(grid, { x: 40, y: 40 }, order, { layer: 'ground' });
  assert.deepEqual(result, { x: 40, y: 40, compression: 0, state: FORMATION_STATES.COMPRESSED });
});

test('formation automatically reforms after leaving an obstacle', () => {
  const grid = new FakeGrid({ width: 12, height: 12 });
  grid.block(6, 4);
  const order = { formation: { slotOffset: { x: 20, y: 0 }, compressionSteps: [1, 0.5, 0] } };
  const compressed = resolveFormationWaypoint(grid, { x: 40, y: 40 }, order);
  const reformed = resolveFormationWaypoint(grid, { x: 40, y: 80 }, order);
  assert.equal(compressed.state, FORMATION_STATES.COMPRESSED);
  assert.equal(reformed.state, FORMATION_STATES.FORMED);
  assert.equal(reformed.compression, 1);
});

test('out-of-bounds slots compress instead of throwing', () => {
  const grid = new FakeGrid({ width: 5, height: 5 });
  const order = { formation: { slotOffset: { x: 20, y: 0 }, compressionSteps: [1, 0.5, 0] } };
  const result = resolveFormationWaypoint(grid, { x: 45, y: 25 }, order);
  assert.equal(result.compression, 0);
  assert.equal(result.x, 45);
});

function fakeEventTarget() {
  return {
    addEventListener() {},
    removeEventListener() {},
  };
}

function formationGame() {
  const selected = [
    { id: 11, type: 'uaInfantry', x: 20, y: 20, order: null, target: null },
    { id: 12, type: 'uaTank', x: 50, y: 20, order: null, target: null },
    { id: 13, type: 'uaInfantry', x: 20, y: 50, order: null, target: null },
  ];
  return {
    selected,
    game: {
      gameOver: false,
      selectedUnits: () => selected,
      issue(x, y, target) {
        if (target) return false;
        for (const unit of selected) unit.order = { kind: 'move', x, y };
        return true;
      },
      stopSelected() {
        for (const unit of selected) unit.order = null;
        return true;
      },
      updateUnit() {},
    },
  };
}

test('queued-order integration assigns one anchor and distinct final slots', () => {
  const { game, selected } = formationGame();
  const dispose = createQueuedOrderController(game, fakeEventTarget());
  assert.equal(game.issue(200, 150), true);
  assert.equal(new Set(selected.map((unit) => unit.order.formation.groupId)).size, 1);
  assert.equal(new Set(selected.map((unit) => `${unit.order.x},${unit.order.y}`)).size, 3);
  assert.ok(selected.every((unit) => unit.orderQueue.length === 1));
  dispose();
});

test('shift-style appended orders retain independent formation anchors', () => {
  const { game, selected } = formationGame();
  const dispose = createQueuedOrderController(game, fakeEventTarget());
  game.issue(200, 150);
  game.issue(400, 350, null, { append: true });
  for (const unit of selected) {
    assert.equal(unit.orderQueue.length, 2);
    assert.deepEqual(unit.orderQueue[0].formation.anchorDestination, { x: 200, y: 150 });
    assert.deepEqual(unit.orderQueue[1].formation.anchorDestination, { x: 400, y: 350 });
  }
  dispose();
});
