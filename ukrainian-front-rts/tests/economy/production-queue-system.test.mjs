import test from 'node:test';
import assert from 'node:assert/strict';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  cancelProduction,
  ensureProductionQueueState,
  moveProduction,
  queueProduction,
  releaseProductionReservations,
  setProductionPaused,
  setProductionRepeat,
  updateProductionQueues,
} from '../../src/systems/production-queue-system.js';

function fixture({ metal = 1000, fuel = 1000, intel = 1000, pop = 0, cap = 30 } = {}) {
  const building = {
    id: 10,
    type: 'workshop',
    team: TEAM.UA,
    x: 300,
    y: 400,
    hp: 100,
    underConstruction: false,
    queue: [],
  };
  const game = {
    buildings: [building],
    units: [],
    player: { metal, fuel, intel, pop, cap },
    lastError: '',
    selectedEntities: () => [building],
    buildingCanProduce: (candidate, type) => candidate === building && ['uaDrone', 'uaTank'].includes(type),
    heroAlreadyFieldedOrQueued: () => false,
    addUnit(type, team, x, y) {
      const unit = { id: 100 + this.units.length, type, team, x, y };
      this.units.push(unit);
      if (team === TEAM.UA) this.player.pop += UNIT_TYPES[type].pop || 0;
      return unit;
    },
  };
  ensureProductionQueueState(building);
  return { game, building };
}

function queueTypes(building) {
  return building.queue.map((item) => item.type);
}

test('queueing pays costs and reserves capacity', () => {
  const { game, building } = fixture();
  assert.equal(queueProduction(game, 'uaDrone'), true);
  assert.deepEqual(queueTypes(building), ['uaDrone']);
  assert.equal(game.player.metal, 925);
  assert.equal(game.player.fuel, 958);
  assert.equal(game.player.pop, 2);
  assert.equal(building.queue[0].reserved, true);
  assert.equal(building.queue[0].duration, 7);
});

test('waiting cancellation refunds full cost and releases capacity', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  queueProduction(game, 'uaTank');
  assert.equal(cancelProduction(game, 1), true);
  assert.deepEqual(queueTypes(building), ['uaDrone']);
  assert.equal(game.player.metal, 925);
  assert.equal(game.player.fuel, 958);
  assert.equal(game.player.pop, 2);
  assert.deepEqual(game.lastProductionResult.refunded, { metal: 235, fuel: 135 });
  assert.equal(game.lastProductionResult.refundFraction, 1);
});

test('started cancellation refunds only deterministic remaining fraction', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaTank');
  updateProductionQueues(game, 3);
  assert.equal(building.queue[0].left, 6);
  assert.equal(cancelProduction(game, 0), true);
  assert.deepEqual(game.lastProductionResult.refunded, { metal: 156, fuel: 90 });
  assert.equal(game.lastProductionResult.refundFraction, 2 / 3);
  assert.equal(game.player.pop, 0);
});

test('reordering preserves item identity and partial progress', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  queueProduction(game, 'uaTank');
  updateProductionQueues(game, 2);
  const active = building.queue[0];
  assert.equal(moveProduction(game, 0, 1), true);
  assert.deepEqual(queueTypes(building), ['uaTank', 'uaDrone']);
  assert.equal(building.queue[1], active);
  assert.equal(building.queue[1].left, 5);
});

test('pause freezes progress and resume completes with reservation conversion', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  assert.equal(setProductionPaused(game, true), true);
  updateProductionQueues(game, 5);
  assert.equal(building.queue[0].left, 7);
  assert.equal(game.units.length, 0);
  assert.equal(setProductionPaused(game, false), true);
  updateProductionQueues(game, 7);
  assert.equal(building.queue.length, 0);
  assert.equal(game.units.length, 1);
  assert.equal(game.units[0].type, 'uaDrone');
  assert.equal(game.player.pop, 2);
});

test('large deterministic steps complete multiple queued items without losing time', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  queueProduction(game, 'uaTank');
  updateProductionQueues(game, 12);
  assert.deepEqual(game.units.map((unit) => unit.type), ['uaDrone']);
  assert.equal(building.queue[0].type, 'uaTank');
  assert.equal(building.queue[0].left, 4);
  updateProductionQueues(game, 4);
  assert.deepEqual(game.units.map((unit) => unit.type), ['uaDrone', 'uaTank']);
  assert.equal(game.player.pop, 7);
});

test('repeat requeues the selected type when resources and capacity permit', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  assert.equal(setProductionRepeat(game, true), true);
  updateProductionQueues(game, 7);
  assert.equal(game.units.length, 1);
  assert.deepEqual(queueTypes(building), ['uaDrone']);
  assert.equal(building.queue[0].repeated, true);
  assert.equal(game.player.metal, 850);
  assert.equal(game.player.fuel, 916);
  assert.equal(game.player.pop, 4);
});

test('repeat remains armed and reports a deterministic block reason when capacity is unavailable', () => {
  const { game, building } = fixture({ cap: 2 });
  queueProduction(game, 'uaDrone');
  setProductionRepeat(game, true);
  updateProductionQueues(game, 7);
  assert.equal(game.units.length, 1);
  assert.equal(building.queue.length, 0);
  assert.equal(building.productionRepeat, true);
  assert.match(building.productionRepeatBlocked, /capacity exceeded/i);
  game.player.cap = 4;
  updateProductionQueues(game, 1);
  assert.deepEqual(queueTypes(building), ['uaDrone']);
});

test('invalid queue operations do not mutate resources or queue state', () => {
  const { game, building } = fixture({ metal: 10, fuel: 0 });
  const before = { ...game.player };
  assert.equal(queueProduction(game, 'uaDrone'), false);
  assert.deepEqual(game.player, before);
  assert.deepEqual(building.queue, []);
  assert.equal(cancelProduction(game, 0), false);
  assert.equal(moveProduction(game, 0, 1), false);
});

test('destroyed-building cleanup releases every outstanding reservation exactly once', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  queueProduction(game, 'uaTank');
  assert.equal(game.player.pop, 7);
  assert.equal(releaseProductionReservations(game, building), 7);
  assert.equal(game.player.pop, 0);
  assert.equal(releaseProductionReservations(game, building), 0);
});

import { createProductionQueueController } from '../../src/systems/production-queue-system.js';

test('controller exposes public game commands and restores previous methods', () => {
  const { game, building } = fixture();
  const originalQueue = () => 'legacy';
  const originalUpdate = () => 'legacy-update';
  game.queue = originalQueue;
  game.updateProduction = originalUpdate;
  const dispose = createProductionQueueController(game);
  assert.equal(game.queue('uaDrone'), true);
  assert.equal(typeof game.cancelProduction, 'function');
  game.updateProduction(7);
  assert.equal(game.units.length, 1);
  dispose();
  assert.equal(game.queue(), 'legacy');
  assert.equal(game.updateProduction(), 'legacy-update');
  assert.equal(game.cancelProduction, undefined);
  assert.equal(building.queue.length, 0);
});

import { installProductionQueueControls } from '../../src/input/production-queue-controls.js';

test('selected-building controls expose pause, repeat, cancel, and reorder commands', () => {
  const { game, building } = fixture();
  queueProduction(game, 'uaDrone');
  queueProduction(game, 'uaTank');
  createProductionQueueController(game);
  const buttons = [];
  const ui = {
    appendProduction() {},
    buildingStatus() { return 'base status'; },
    commandButton(definition) { buttons.push(definition); },
    toast() {},
    refresh() {},
  };
  const dispose = installProductionQueueControls({ game, ui });
  ui.appendProduction(building);
  assert.deepEqual(
    buttons.map((button) => button.title),
    ['Pause Queue', 'Repeat: OFF', 'Cancel Current', 'Promote Next', 'Send Current Back'],
  );
  buttons[0].onClick();
  assert.equal(building.productionPaused, true);
  buttons[1].onClick();
  assert.equal(building.productionRepeat, true);
  buttons[3].onClick();
  assert.deepEqual(queueTypes(building), ['uaTank', 'uaDrone']);
  assert.match(ui.buildingStatus(building), /PAUSED/);
  assert.match(ui.buildingStatus(building), /REPEAT/);
  dispose();
  assert.equal(ui.buildingStatus(), 'base status');
});
