import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTILE_PROFILES, deterministicUnit, prepareProjectile, resolveProjectileAim } from '../../src/combat/projectile-accuracy.js';
import { updateProjectiles } from '../../src/systems/projectile-system.js';

test('deterministicUnit is reproducible and bounded', () => {
  assert.equal(deterministicUnit(42, 3), deterministicUnit(42, 3));
  assert.ok(deterministicUnit(42, 3) >= 0 && deterministicUnit(42, 3) < 1);
});

test('same seed resolves the same aim', () => {
  const target = { x: 100, y: 200 };
  assert.deepEqual(resolveProjectileAim({ seed: 17, target, kind: 'bullet' }), resolveProjectileAim({ seed: 17, target, kind: 'bullet' }));
});

test('projectile profiles are immutable', () => {
  assert.ok(Object.isFrozen(PROJECTILE_PROFILES));
  assert.ok(Object.isFrozen(PROJECTILE_PROFILES.shell));
});

test('prepareProjectile attaches deterministic metadata', () => {
  const projectile = { kind: 'shell', target: { x: 50, y: 60 } };
  prepareProjectile(projectile, 9);
  assert.equal(projectile.seed, 9);
  assert.equal(projectile.speed, PROJECTILE_PROFILES.shell.speed);
  assert.equal(projectile.impact, 'armorPiercing');
});

test('projectile update initializes a stable seed sequence', () => {
  const target = { x: 10, y: 0, hp: 100 };
  const game = { projectiles: [{ x: 0, y: 0, target, speed: 330, damage: 10, life: 2, kind: 'bullet' }], effects: [] };
  updateProjectiles(game, 0.001);
  assert.equal(game.nextProjectileSeed, 2);
  assert.equal(game.projectiles[0].seed, 1);
});

test('miss impacts do not damage the target', () => {
  const target = { x: 0, y: 0, hp: 100 };
  const projectile = { x: 0, y: 0, target, damage: 50, life: 2, kind: 'bullet', hit: false, aimX: 0, aimY: 0, speed: 330, impactRadius: 10 };
  const game = { projectiles: [projectile], effects: [], nextProjectileSeed: 1 };
  updateProjectiles(game, 1);
  assert.equal(target.hp, 100);
  assert.equal(game.effects[0].hit, false);
});

test('projectile update consumes the existing smoke-launcher effect', () => {
  const target = { x: 100, y: 0, hp: 100, buffs: { smoke: 8 } };
  const game = {
    projectiles: [{ x: 0, y: 0, target, damage: 5.5, life: 2, kind: 'bullet' }],
    effects: [{ kind: 'smoke', x: 50, y: 0, radius: 60, life: 8, max: 8 }],
    nextProjectileSeed: 6,
  };
  updateProjectiles(game, 0.001);
  assert.ok(game.projectiles[0].smokeDensity > 0.65);
  assert.equal(game.projectiles[0].hit, false);
  assert.equal(game.projectiles[0].damage, 10);
  assert.equal(game.projectiles[0].legacySmokeDamageNormalized, true);
});
