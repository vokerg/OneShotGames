import { prepareProjectile } from '../combat/projectile-accuracy.js';
import { randomBetween } from '../core/math.js';

export const rollImpactDamage = (baseDamage) => baseDamage * randomBetween(0.95, 1.05);

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
      prepareProjectile(projectile, game.nextProjectileSeed++);
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
      });
      continue;
    }

    projectile.x += (dx / remainingDistance) * projectile.speed * dt;
    projectile.y += (dy / remainingDistance) * projectile.speed * dt;
  }

  game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);
}
