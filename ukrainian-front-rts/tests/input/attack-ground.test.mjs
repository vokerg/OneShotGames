import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACK_GROUND_ORDER,
  createAttackGroundController,
  issueAttackGround,
  isValidGroundPoint,
  updateAttackGroundUnit,
} from '../../src/input/attack-ground.js';

function unit(overrides = {}) {
  return { id: 1, type: 'gun', team: 'ua', x: 20, y: 20, cool: 0, order: null, target: null, orderQueue: [], ...overrides };
}

function gameWith(selectedUnit = unit()) {
  return {
    gameOver: false,
    mouse: { attackMove: false },
    pendingBuild: null,
    effects: [],
    selectedUnits: () => [selectedUnit],
    unitStats: () => ({ damage: 20, range: 100, rate: 1 }),
    move: (candidate, x, y) => { candidate.x = x; candidate.y = y; return true; },
    updateUnit: () => {},
  };
}

test('validates finite in-bounds battlefield points', () => {
  assert.equal(isValidGroundPoint(0, 0), true);
  assert.equal(isValidGroundPoint(2560, 1664), true);
  assert.equal(isValidGroundPoint(-1, 10), false);
  assert.equal(isValidGroundPoint(Number.NaN, 10), false);
});

test('replaces current orders by default', () => {
  const selected = unit({ order: { kind: 'move', x: 1, y: 1 }, orderQueue: [{ kind: 'move', x: 1, y: 1 }] });
  const game = gameWith(selected);
  const result = issueAttackGround(game, 50, 60);
  assert.equal(result.accepted, true);
  assert.equal(selected.order.kind, ATTACK_GROUND_ORDER);
  assert.deepEqual(selected.orderQueue, [{ kind: ATTACK_GROUND_ORDER, x: 50, y: 60 }]);
});

test('Shift append preserves the active order', () => {
  const move = { kind: 'move', x: 30, y: 40 };
  const selected = unit({ order: move, orderQueue: [move] });
  issueAttackGround(gameWith(selected), 70, 80, { append: true });
  assert.equal(selected.order.kind, 'move');
  assert.equal(selected.orderQueue[1].kind, ATTACK_GROUND_ORDER);
});

test('rejects unarmed selections and invalid points', () => {
  const game = gameWith();
  game.unitStats = () => ({ damage: 0, range: 0 });
  assert.equal(issueAttackGround(game, 50, 60).accepted, false);
  game.unitStats = () => ({ damage: 20, range: 100 });
  assert.equal(issueAttackGround(game, 9999, 60).accepted, false);
});

test('moves into range then fires exactly once', () => {
  const selected = unit({ x: 0, y: 0, order: { kind: ATTACK_GROUND_ORDER, x: 200, y: 0 } });
  const game = gameWith(selected);
  assert.equal(updateAttackGroundUnit(game, selected, 0.1), false);
  assert.equal(selected.x, 200);
  assert.equal(updateAttackGroundUnit(game, selected, 0.1), true);
  assert.equal(selected.order, null);
  assert.equal(game.effects.length, 1);
});

test('controller exposes arm, cancel, issue, and deterministic update hooks', () => {
  const selected = unit();
  const game = gameWith(selected);
  const dispose = createAttackGroundController(game);
  assert.equal(game.armAttackGround(), true);
  assert.equal(game.isAttackGroundArmed(), true);
  assert.equal(game.cancelAttackGround(), true);
  assert.equal(game.isAttackGroundArmed(), false);
  game.armAttackGround();
  assert.equal(game.issueAttackGround(40, 40).accepted, true);
  assert.equal(game.isAttackGroundArmed(), false);
  dispose();
  assert.equal(game.armAttackGround, undefined);
});
