import assert from 'node:assert/strict';
import { TEAM, UNIT_TYPES } from '../src/config.js';
import { ProductionGame } from '../src/production-game.js';

const game = new ProductionGame();
game.player = {
  metal: 0,
  fuel: 0,
  intel: 0,
  pop: 0,
  cap: 20,
  mined: 0,
  objectives: [false, false, false],
  upgrades: new Set(),
};
game.mission = { trainableHeroes: [] };

const barracks = game.addBuilding('barracks', TEAM.UA, 400, 400);
game.select(barracks);
assert.equal(game.armRallyPoint(), true, 'production building should arm rally placement');
assert.equal(game.placeRallyPoint(720, 510), true, 'rally point should be placeable on the battlefield');
assert.deepEqual(barracks.rallyPoint, { x: 720, y: 510 });

const reservedPop = UNIT_TYPES.uaInfantry.pop;
game.player.pop = reservedPop;
barracks.queue.push({ type: 'uaInfantry', left: 0, duration: 5, reserved: true });
game.updateProduction(0.1);

const produced = game.units.at(-1);
assert.equal(produced.type, 'uaInfantry', 'completed queue item should create the requested unit');
assert.deepEqual(
  produced.order,
  { kind: 'move', x: 720, y: 510 },
  'new units should automatically move to the building rally point',
);
assert.ok(
  Math.hypot(produced.x - barracks.x, produced.y - barracks.y) > 50,
  'new units should spawn outside the building footprint',
);
assert.equal(game.player.pop, reservedPop, 'reserved command capacity should remain stable after spawning');

barracks.queue.push({ type: 'uaInfantry', left: 5, duration: 5, reserved: true });
game.player.pop += reservedPop;
const metalBeforeRefund = game.player.metal;
assert.equal(game.cancelQueueItem(barracks.id, 0), true, 'queued units should be cancellable');
assert.equal(game.player.metal, metalBeforeRefund + UNIT_TYPES.uaInfantry.cost.metal, 'cancel should refund cost');
assert.equal(game.player.pop, reservedPop, 'cancel should release reserved command capacity');

assert.equal(game.issue(830, 620, null), true, 'right-clicking with a production building should set rally');
assert.deepEqual(barracks.rallyPoint, { x: 830, y: 620 });

console.log('Production rally and queue checks passed.');
