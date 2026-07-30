import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceIncomeTelemetryController, resourceIncomeRates } from '../../src/systems/resource-income-telemetry.js';

function gameFixture() {
  return {
    time: 0,
    player: { metal: 0, fuel: 0, intel: 0 },
    start() { this.time = 0; this.player = { metal: 0, fuel: 0, intel: 0 }; },
    updateWorker(unit) {
      if (unit.delivery) this.player[unit.delivery.resource] += unit.delivery.amount;
    },
  };
}

test('records only positive worker delivery deltas in the trailing minute', () => {
  const game = gameFixture();
  const dispose = createResourceIncomeTelemetryController(game);
  game.start();
  game.time = 10;
  game.updateWorker({ delivery: { resource: 'metal', amount: 40 } });
  game.time = 20;
  game.updateWorker({ delivery: { resource: 'fuel', amount: 15 } });
  assert.deepEqual(resourceIncomeRates(game), { metal: 40, fuel: 15, intel: 0 });
  game.time = 71;
  assert.deepEqual(resourceIncomeRates(game), { metal: 0, fuel: 15, intel: 0 });
  dispose();
});

test('resets telemetry on mission start and ignores spending', () => {
  const game = gameFixture();
  createResourceIncomeTelemetryController(game);
  game.start();
  game.time = 5;
  game.updateWorker({ delivery: { resource: 'intel', amount: 20 } });
  game.player.intel -= 10;
  assert.deepEqual(game.resourceIncomeRates(), { metal: 0, fuel: 0, intel: 20 });
  game.start();
  assert.deepEqual(game.resourceIncomeRates(), { metal: 0, fuel: 0, intel: 0 });
});
