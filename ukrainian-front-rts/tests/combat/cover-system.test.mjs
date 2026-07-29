import test from 'node:test';
import assert from 'node:assert/strict';
import { COVER_LEVELS, applyCoverState, resolveCoverState } from '../../src/systems/cover-system.js';
import { resolveProjectileAim } from '../../src/combat/projectile-accuracy.js';
import { updateProjectiles } from '../../src/systems/projectile-system.js';

test('terrain values resolve deterministic cover levels', () => {
  const terrain = Array.from({ length: 80 * 2 }, () => 0);
  terrain[1] = 1;
  terrain[2] = 2;
  const game = { terrain, world: { w: 2560 } };
  assert.equal(resolveCoverState(game, { x: 8, y: 8 }).id, 'exposed');
  assert.equal(resolveCoverState(game, { x: 40, y: 8 }).id, 'concealed');
  assert.equal(resolveCoverState(game, { x: 72, y: 8 }).id, 'light');
});

test('fortification cover overrides terrain and exposes readable state', () => {
  const target = { x: 8, y: 8, fortificationCover: 'heavy' };
  assert.equal(applyCoverState({ terrain: [0] }, target), COVER_LEVELS.heavy);
  assert.equal(target.coverState, 'heavy');
});

test('cover accuracy multiplier deterministically converts marginal hits to misses', () => {
  const target = { x: 100, y: 100 };
  const exposed = resolveProjectileAim({ seed: 6, target, kind: 'bullet' });
  const heavy = resolveProjectileAim({ seed: 6, target, kind: 'bullet', accuracyMultiplier: COVER_LEVELS.heavy.accuracyMultiplier });
  assert.equal(exposed.adjustedAccuracy, 0.72);
  assert.equal(heavy.adjustedAccuracy, 0.504);
  assert.equal(exposed.hit, true);
  assert.equal(heavy.hit, false);
});

test('cover damage mitigation is applied once and included in impact feedback', () => {
  const target = { x: 0, y: 0, hp: 100, fortificationCover: 'heavy' };
  const projectile = { x: 0, y: 0, target, damage: 50, life: 2, kind: 'bullet' };
  const game = { projectiles: [projectile], effects: [], terrain: [0], nextProjectileSeed: 3 };
  updateProjectiles(game, 1);
  assert.equal(game.effects[0].coverState, 'heavy');
  assert.ok(target.hp >= 62.2 && target.hp <= 65.8);
});
