import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomyHudModel, createEconomyHudCommands } from '../../src/core/economy-hud-model.js';

test('builds stable economy overview and commands', () => {
  const model = createEconomyHudModel({ productionQueues: [{ id: 'q', items: [{ id: 'a', progress: 2 }, { id: 'b', progress: -1 }], paused: false }], researchQueues: [{ id: 'r', researchId: 'tech', progress: 0.5 }], incomeRates: { metal: 3, energy: 2 }, capacity: { used: 8, reserved: 2, limit: 10, forecast: 12 } });
  assert.deepEqual(Object.keys(model.income), ['energy', 'metal']);
  assert.equal(model.queues[0].items[0].progress, 1);
  assert.equal(model.queues[0].items[1].progress, 0);
  assert.equal(model.capacity.forecast, 12);
  assert.ok(createEconomyHudCommands(model).some((command) => command.type === 'move-production'));
  assert.ok(Object.isFrozen(model));
});
