export function updateProjectiles(game, dt) {
  for (const projectile of game.projectiles) {
    projectile.life -= dt;
    const target = projectile.target;

    if (!target || target.hp <= 0) {
      projectile.life = 0;
      continue;
    }

    const dx = target.x - projectile.x;
    const dy = target.y - projectile.y;
    const remainingDistance = Math.hypot(dx, dy);

    if (remainingDistance < projectile.speed * dt + 7) {
      target.hp -= projectile.damage;
      projectile.life = 0;
      game.effects.push({
        kind: 'blast',
        x: target.x,
        y: target.y,
        radius: 45,
        life: 0.45,
        max: 0.45,
      });
      continue;
    }

    projectile.x += (dx / remainingDistance) * projectile.speed * dt;
    projectile.y += (dy / remainingDistance) * projectile.speed * dt;
  }

  game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);
}
