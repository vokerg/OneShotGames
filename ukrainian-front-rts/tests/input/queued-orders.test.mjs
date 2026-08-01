import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceOrderQueue,
  appendOrder,
  clearOrders,
  createQueuedOrderController,
  queuedWaypoints,
  replaceOrders,
} from '../../src/input/queued-orders.js';

test('replaceOrders deterministically replaces the active queue', () => {
  const unit = { order: { kind: 'move', x: 1, y: 1 }, target: null };
  replaceOrders(unit, { kind: 'move', x: 10, y: 20 });
  assert.deepEqual(unit.orderQueue, [{ kind: 'move', x: 10, y: 20 }]);
  assert.deepEqual(unit.order, { kind: 'move', x: 10, y: 20 });
});

test('appendOrder preserves the current order before later waypoints', () => {
  const unit = { order: { kind: 'move', x: 10, y: 20 }, target: null };
  appendOrder(unit, { kind: 'attackMove', x: 30, y: 40 });
  assert.deepEqual(unit.orderQueue, [
    { kind: 'move', x: 10, y: 20 },
    { kind: 'attackMove', x: 30, y: 40 },
  ]);
  assert.deepEqual(unit.order, { kind: 'move', x: 10, y: 20 });
});

test('advanceOrderQueue promotes the next command in insertion order', () => {
  const first = { kind: 'move', x: 10, y: 20 };
  const unit = { order: first, target: null, orderQueue: [first, { kind: 'move', x: 50, y: 60 }] };
  assert.deepEqual(advanceOrderQueue(unit, first), { kind: 'move', x: 50, y: 60 });
  assert.equal(unit.orderQueue.length, 1);
});

test('queuedWaypoints exposes stable visualization data and live attack positions', () => {
  const target = { id: 9, x: 80, y: 90, hp: 10 };
  const unit = {
    orderQueue: [
      { kind: 'move', x: 10, y: 20 },
      { kind: 'attack', target },
    ],
  };
  assert.deepEqual(queuedWaypoints(unit), [
    { index: 0, kind: 'move', x: 10, y: 20 },
    { index: 1, kind: 'attack', x: 80, y: 90, targetId: 9 },
  ]);
  target.hp = 0;
  assert.equal(queuedWaypoints(unit).length, 1);
});

test('controller uses Shift state for append and Stop clears pending commands', () => {
  const listeners = new Map();
  const keyTarget = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const unit = { id: 1, x: 0, y: 0, order: null, orderQueue: [], target: null };
  const game = {
    gameOver: false,
    mouse: { attackMove: false },
    selectedUnits: () => [unit],
    issue(x, y) { unit.order = { kind: 'move', x, y }; return true; },
    stopSelected() { unit.order = null; unit.target = null; return true; },
    updateUnit() {},
  };
  const dispose = createQueuedOrderController(game, keyTarget);
  game.issue(10, 20);
  listeners.get('keydown')({ key: 'Shift' });
  game.issue(30, 40);
  assert.deepEqual(unit.orderQueue.map(({ x, y }) => [x, y]), [[10, 20], [30, 40]]);
  game.stopSelected();
  assert.equal(unit.orderQueue.length, 0);
  dispose();
});

test('clearOrders removes active target and all pending commands', () => {
  const unit = { order: { kind: 'attack' }, target: { id: 4 }, orderQueue: [{ kind: 'attack' }] };
  clearOrders(unit);
  assert.equal(unit.order, null);
  assert.equal(unit.target, null);
  assert.deepEqual(unit.orderQueue, []);
});
