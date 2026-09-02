import assert from 'node:assert/strict';
import test from 'node:test';

import { DOMAIN_EVENT_TYPES, createDomainEventStream } from '../../src/core/events.js';
import { updateProjectiles } from '../../src/systems/projectile-system.js';

function gameWith(projectile) {
  return {
    projectiles: [projectile],
    effects: [],
    events: createDomainEventStream(),
    time: 4,
    nextProjectileSeed: 1,
  };
}

test('emits a miss only after authoritative impact resolution', () => {
  const target = { id: 2, team: 'ukraine', x: 5, y: 6, hp: 100 };
  const game = gameWith({
    x: 5,
    y: 6,
    aimX: 5,
    aimY: 6,
    speed: 100,
    life: 1,
    target,
    source: { id: 1, team: 'russia' },
    kind: 'shell',
    damage: 20,
    hit: false,
  });
  updateProjectiles(game, 0.1);
  const [event] = game.events.drain();
  assert.equal(event.type, DOMAIN_EVENT_TYPES.IMPACT);
  assert.equal(event.payload.outcome, 'miss');
  assert.equal(event.payload.damage, 0);
  assert.equal(target.hp, 100);
});

test('reports actual bounded damage after applying a hit', () => {
  const target = { id: 2, team: 'ukraine', x: 5, y: 6, hp: 8 };
  const game = gameWith({
    x: 5,
    y: 6,
    aimX: 5,
    aimY: 6,
    speed: 100,
    life: 1,
    target,
    source: { id: 1, team: 'russia' },
    kind: 'shell',
    damage: 20,
    hit: true,
    penetrated: true,
  });
  updateProjectiles(game, 0.1);
  const [event] = game.events.drain();
  assert.equal(event.payload.outcome, 'penetrate');
  assert.equal(event.payload.damage, 8);
  assert.equal(target.hp, 0);
});
