export const PROJECTILE_PROFILES = Object.freeze({
  bullet: Object.freeze({ accuracy: 0.72, dispersion: 18, speed: 330, impact: 'kinetic', radius: 10 }),
  shell: Object.freeze({ accuracy: 0.84, dispersion: 14, speed: 250, impact: 'armorPiercing', radius: 30 }),
});

function hash32(value) {
  let x = Number(value) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function deterministicUnit(seed, salt = 0) {
  return hash32((Number(seed) || 0) ^ Math.imul(Number(salt) || 0, 0x9e3779b1)) / 0x100000000;
}

export function resolveProjectileAim({ seed, target, kind = 'bullet' }) {
  const profile = PROJECTILE_PROFILES[kind] || PROJECTILE_PROFILES.bullet;
  if (!target) throw new TypeError('target is required');
  const hit = deterministicUnit(seed, 1) < profile.accuracy;
  if (hit) return Object.freeze({ hit: true, x: target.x, y: target.y, profile });
  const angle = deterministicUnit(seed, 2) * Math.PI * 2;
  const radius = Math.sqrt(deterministicUnit(seed, 3)) * profile.dispersion;
  return Object.freeze({ hit: false, x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius, profile });
}

export function prepareProjectile(projectile, seed) {
  const aim = resolveProjectileAim({ seed, target: projectile.target, kind: projectile.kind });
  projectile.seed = seed;
  projectile.hit = aim.hit;
  projectile.aimX = aim.x;
  projectile.aimY = aim.y;
  projectile.speed = aim.profile.speed;
  projectile.impact = aim.profile.impact;
  projectile.impactRadius = aim.profile.radius;
  return projectile;
}
