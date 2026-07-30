import { prepareProjectile } from '../combat/projectile-accuracy.js';
import { randomBetween } from '../core/math.js';
import { sampleSmokeLineDensity } from './smoke-system.js';

export const rollImpactDamage = (baseDamage) => baseDamage * randomBetween(0.95, 1.05);

function activeSmokeClouds(game) {
  return [
    ...(game.smokeState?.clouds || []),
    ...(game.smokeClouds || []),
    ...(game.effects || []).filter((effect) => effect.kind === 'smoke'),
  ];
}

export function updateProjectiles(game, dt) {
  if (!Number.isInteger(game.nextProjectileSeed)) game.nextProjectileSeed = 1;

  for (const projectile of game.projectiles) {
    projectile.life -= dt;
    const target = projectile.target;

    if (!target || target.hp <= 0) {
      projectile.life = 0;
      continue;
    }

    if (!Number.isFinite(projectile.aimX) || !Number.isFinite(projectile.aimY)) {
      const smokeDensity = sampleSmokeLineDensity(activeSmokeClouds(game), projectile, target);
      if (target.buffs?.smoke && !projectile.legacySmokeDamageNormalized) {
        projectile.damage /= 0.55;
        projectile.legacySmokeDamageNormalized = true;
      }
      prepareProjectile(projectile, game.nextProjectileSeed++, { smokeDensity });
    }

    const dx = projectile.aimX - projectile.x;
    const dy = projectile.aimY - projectile.y;
    const remainingDistance = Math.hypot(dx, dy);

    if (remainingDistance < projectile.speed * dt + 7) {
      if (projectile.hit && target.hp > 0) target.hp -= rollImpactDamage(projectile.damage);
      projectile.life = 0;
      game.effects.push({
        kind: 'blast',
        x: projectile.aimX,
        y: projectile.aimY,
        radius: projectile.impactRadius || 45,
        life: 0.45,
        max: 0.45,
        impact: projectile.impact || 'kinetic',
        hit: projectile.hit,
        smokeDensity: projectile.smokeDensity || 0,
        adjustedAccuracy: projectile.adjustedAccuracy,
      });
      continue;
    }

    projectile.x += (dx / remainingDistance) * projectile.speed * dt;
    projectile.y += (dy / remainingDistance) * projectile.speed * dt;
  }

  game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);
}
