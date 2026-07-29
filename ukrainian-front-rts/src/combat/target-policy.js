export const TARGET_PROFILES = Object.freeze({
  balanced: Object.freeze({ infantry: 1, vehicle: 1, armor: 1.1, structure: 0.7, air: 0.8 }),
  antiArmor: Object.freeze({ infantry: 0.4, vehicle: 1.2, armor: 2, structure: 0.8, air: 0 }),
  antiInfantry: Object.freeze({ infantry: 2, vehicle: 0.7, armor: 0.3, structure: 0.5, air: 0 }),
  antiAir: Object.freeze({ infantry: 0, vehicle: 0.3, armor: 0.2, structure: 0, air: 2 }),
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function scoreTarget(candidate, context = {}) {
  const profile = TARGET_PROFILES[context.profile ?? 'balanced'];
  if (!profile) throw new Error(`Unknown target profile: ${context.profile}`);
  if (!candidate || typeof candidate !== 'object') throw new TypeError('Target candidate is required.');
  if (!candidate.visible || candidate.destroyed || candidate.friendly) return Number.NEGATIVE_INFINITY;
  const typeWeight = profile[candidate.domain] ?? 0;
  if (typeWeight <= 0) return Number.NEGATIVE_INFINITY;
  const distance = Math.max(0, candidate.distance ?? 0);
  const maxRange = Math.max(1, context.maxRange ?? 1);
  const distanceFactor = 1 - clamp01(distance / maxRange) * 0.5;
  const threat = Math.max(0, candidate.threat ?? 0);
  const damagePotential = Math.max(0, candidate.damagePotential ?? 0);
  const healthPressure = 1 + (1 - clamp01((candidate.health ?? 1) / Math.max(1, candidate.maxHealth ?? 1))) * 0.25;
  const retaliation = context.lastAttackerId && candidate.id === context.lastAttackerId ? (context.retaliationBonus ?? 0.5) : 0;
  return typeWeight * (1 + threat + damagePotential) * distanceFactor * healthPressure + retaliation;
}

export function selectTarget(candidates, context = {}) {
  return [...candidates]
    .map((candidate) => ({ candidate, score: scoreTarget(candidate, context) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id)))[0]?.candidate ?? null;
}

export function resolveChasePolicy({ stance = 'defensive', originDistance = 0, leashDistance = 0, targetInRange = false } = {}) {
  if (targetInRange) return Object.freeze({ acquire: true, chase: false, reason: 'in-range' });
  if (stance === 'hold-position' || stance === 'no-chase') return Object.freeze({ acquire: true, chase: false, reason: 'stance' });
  if (originDistance > leashDistance) return Object.freeze({ acquire: false, chase: false, reason: 'leash-exceeded' });
  return Object.freeze({ acquire: true, chase: true, reason: 'pursue' });
}
