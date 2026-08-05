import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomyHudModel, economyHudSignature, productionQueueCommands } from '../../src/core/economy-hud-model.js';

function fixture() {
  return createEconomyHudModel({
    resources: { metal: 320, fuel: 90, intel: 40 },
    incomeRates: { metal: 80, fuel: 40, intel: 0 },
    workers: {
      total: 5,
      taskCounts: { idle: 1, gathering: 2, returning: 1, building: 1, other: 0 },
      resourceCounts: { metal: 2, fuel: 1, intel: 0 },
      carried: { metal: 28, fuel: 10, intel: 0 },
    },
    production: [{
      buildingId: 7,
      name: 'Workshop',
      paused: false,
      repeat: true,
      queue: [
        { id: 'a', type: 'uaIfv', name: 'Bradley', duration: 10, left: 5, pop: 4 },
        { id: 'b', type: 'uaTank', name: 'T-64BV', duration: 8, left: 8, pop: 5 },
      ],
      rally: { waypoints: [{ x: 100, y: 200 }] },
    }],
    research: [{
      buildingId: 7,
      facilityId: 'building:7',
      name: 'Workshop',
      items: [{ id: 'r', techId: 'thermal', name: 'Thermal', status: 'active', progress: 0.25, percent: 25, remaining: 12 }],
    }],
    researchTree: { screenId: 'techTree', label: 'Open research tree' },
    completions: [{ id: 'done:1', kind: 'production', sourceId: 7, buildingId: 7, sourceName: 'Workshop', name: 'Engineers', sequence: 1 }],
    prerequisites: [{ id: 'thermal', kind: 'research', label: 'Thermal', available: false, reasons: ['Needs intel'] }],
    capacity: { fielded: 8, reserved: 9, used: 17, capacity: 20, forecastLimit: 28 },
  });
}

test('normalizes and deeply freezes the complete economy and production panel', () => {
  const model = fixture();
  assert.deepEqual(model.resources.map(({ id, incomePerMinute }) => [id, incomePerMinute]), [['metal', 80], ['fuel', 40], ['intel', 0]]);
  assert.equal(model.workers.total, 5);
  assert.equal(model.workers.tasks.find(({ id }) => id === 'idle').count, 1);
  assert.equal(model.workers.resources.find(({ id }) => id === 'metal').carried, 28);
  assert.equal(model.production[0].queue[0].percent, 50);
  assert.equal(model.production[0].queue[1].canMoveUp, true);
  assert.equal(model.research[0].buildingId, '7');
  assert.equal(model.capacity.forecastAvailable, 11);
  assert.equal(model.researchTree.screenId, 'techTree');
  assert.equal(model.completions[0].buildingId, '7');
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.workers.tasks[0]));
  assert.ok(Object.isFrozen(model.globalQueue[0]));
  assert.throws(() => { model.capacity.used = 0; }, TypeError);
});

test('builds one deterministic global queue across production and research', () => {
  const model = fixture();
  assert.deepEqual(model.globalQueue.map(({ kind, name, status }) => [kind, name, status]), [
    ['production', 'Bradley', 'active'],
    ['research', 'Thermal', 'active'],
    ['production', 'T-64BV', 'queued'],
  ]);
  assert.equal(model.globalQueue[0].id, 'production:7:a');
  assert.equal(model.globalQueue[1].id, 'research:building:7:r');
});

test('emits facility-scoped queue, rally, and navigation commands', () => {
  const commands = productionQueueCommands(fixture().production[0]);
  assert.ok(commands.some((command) => command.action === 'cancel-production' && command.index === 0));
  assert.ok(commands.some((command) => command.action === 'move-production' && command.fromIndex === 1 && command.toIndex === 0));
  assert.ok(commands.some((command) => command.action === 'set-production-repeat' && command.repeat === false));
  assert.ok(commands.some((command) => command.action === 'set-production-rally-view' && command.append === false));
  assert.ok(commands.some((command) => command.action === 'set-production-rally-view' && command.append === true));
  assert.ok(commands.some((command) => command.action === 'focus-production-rally'));
  assert.ok(commands.some((command) => command.action === 'clear-production-rally'));
});

test('produces a stable render signature for equivalent snapshots', () => {
  assert.equal(economyHudSignature(fixture()), economyHudSignature(fixture()));
});
