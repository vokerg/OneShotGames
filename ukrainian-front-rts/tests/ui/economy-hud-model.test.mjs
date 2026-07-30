import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomyHudModel, economyHudSignature, productionQueueCommands } from '../../src/core/economy-hud-model.js';

function fixture() {
  return createEconomyHudModel({
    resources: { metal: 320, fuel: 90, intel: 40 },
    incomeRates: { metal: 80, fuel: 40, intel: 0 },
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
    research: [{ buildingId: 7, facilityId: 'building:7', items: [{ id: 'r', techId: 'thermal', progress: 0.25, percent: 25 }] }],
    prerequisites: [{ id: 'thermal', kind: 'research', label: 'Thermal', available: false, reasons: ['Needs intel'] }],
    capacity: { fielded: 8, reserved: 9, used: 17, capacity: 20, forecastLimit: 28 },
  });
}

test('normalizes and deeply freezes the complete economy overview', () => {
  const model = fixture();
  assert.deepEqual(model.resources.map(({ id, incomePerMinute }) => [id, incomePerMinute]), [['metal', 80], ['fuel', 40], ['intel', 0]]);
  assert.equal(model.production[0].queue[0].percent, 50);
  assert.equal(model.production[0].queue[1].canMoveUp, true);
  assert.equal(model.research[0].buildingId, '7');
  assert.equal(model.capacity.forecastAvailable, 11);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.production[0].queue[0]));
  assert.throws(() => { model.capacity.used = 0; }, TypeError);
});

test('emits facility-scoped queue and rally commands', () => {
  const commands = productionQueueCommands(fixture().production[0]);
  assert.ok(commands.some((command) => command.action === 'cancel-production' && command.index === 0));
  assert.ok(commands.some((command) => command.action === 'move-production' && command.fromIndex === 1 && command.toIndex === 0));
  assert.ok(commands.some((command) => command.action === 'set-production-repeat' && command.repeat === false));
  assert.ok(commands.some((command) => command.action === 'clear-production-rally'));
});

test('produces a stable render signature for equivalent snapshots', () => {
  assert.equal(economyHudSignature(fixture()), economyHudSignature(fixture()));
});
