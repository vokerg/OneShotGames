import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../../src/game.js';

function gameWithResources(resources) {
  const game = new Game();
  game.player = {
    metal: 0,
    fuel: 0,
    intel: 0,
    upgrades: new Set(),
    ...resources,
  };
  game.units = [];
  return game;
}

test('canAfford accepts empty and fully funded costs', () => {
  const game = gameWithResources({ metal: 100, fuel: 50, intel: 25 });
  assert.equal(game.canAfford(), true);
  assert.equal(game.canAfford({}), true);
  assert.equal(game.canAfford({ metal: 100, fuel: 50, intel: 25 }), true);
});

test('canAfford rejects a cost when any resource is short', () => {
  const game = gameWithResources({ metal: 100, fuel: 50, intel: 25 });
  assert.equal(game.canAfford({ metal: 101 }), false);
  assert.equal(game.canAfford({ fuel: 51 }), false);
  assert.equal(game.canAfford({ intel: 26 }), false);
  assert.equal(game.canAfford({ metal: 90, fuel: 60 }), false);
});

test('pay subtracts only the resources named by the cost', () => {
  const game = gameWithResources({ metal: 100, fuel: 50, intel: 25 });
  game.pay({ metal: 40, intel: 5 });
  assert.deepEqual(
    { metal: game.player.metal, fuel: game.player.fuel, intel: game.player.intel },
    { metal: 60, fuel: 50, intel: 20 },
  );
});
