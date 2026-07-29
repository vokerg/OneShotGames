import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../../src/game.js';

function researchGame() {
  const game = new Game();
  game.player = {
    metal: 1000,
    fuel: 1000,
    intel: 1000,
    upgrades: new Set(),
  };
  game.units = [];
  return game;
}

function resourceSnapshot(game) {
  return {
    metal: game.player.metal,
    fuel: game.player.fuel,
    intel: game.player.intel,
  };
}

test('research rejects unknown and already completed upgrades', () => {
  const game = researchGame();
  assert.equal(game.research('notAnUpgrade'), false);
  assert.equal(game.lastError, 'Unknown modernization project.');

  game.player.upgrades.add('thermal');
  assert.equal(game.research('thermal'), false);
  assert.equal(game.lastError, 'That modernization is already complete.');
});

test('research preserves resources when a prerequisite is missing', () => {
  const game = researchGame();
  const before = resourceSnapshot(game);

  assert.equal(game.research('activeProtection'), false);
  assert.equal(game.lastError, 'Complete the prerequisite modernization first.');
  assert.deepEqual(resourceSnapshot(game), before);
  assert.equal(game.player.upgrades.has('activeProtection'), false);
});

test('research succeeds after its prerequisite and deducts the declared cost', () => {
  const game = researchGame();
  game.player.upgrades.add('cageArmor');

  assert.equal(game.research('activeProtection'), true);
  assert.equal(game.player.upgrades.has('activeProtection'), true);
  assert.deepEqual(resourceSnapshot(game), { metal: 780, fuel: 910, intel: 910 });
});

test('research rejects an affordable prerequisite chain when funds are insufficient', () => {
  const game = researchGame();
  game.player.upgrades.add('thermal');
  game.player.intel = 119;
  const before = resourceSnapshot(game);

  assert.equal(game.research('digitalC2'), false);
  assert.equal(game.lastError, 'Insufficient resources for this modernization.');
  assert.deepEqual(resourceSnapshot(game), before);
});
