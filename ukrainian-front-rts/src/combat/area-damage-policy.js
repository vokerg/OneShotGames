import { TARGET_DOMAINS } from './combat-schema.js';

export const AREA_DAMAGE_POLICY_VERSION = 1;

export const SPLASH_FALLOFF_CURVES = Object.freeze({
  CONSTANT: 'constant',
  LINEAR: 'linear',
  QUADRATIC: 'quadratic',
});

export const FRIENDLY_FIRE_MODES = Object.freeze({
  DISABLED: 'disabled',
  FULL: 'full',
  SCALED: 'scaled',
});

export const STRUCTURE_DAMAGE_MODES = Object.freeze({
  DISABLED: 'disabled',
  FULL: 'full',
  SCALED: 'scaled',
});

export const AREA_DAMAGE_OWNERSHIP = Object.freeze({
  damage: 'simulation',
  effect: 'presentation',
});

const FALLOFF_VALUES = new Set(Object.values(SPLASH_FALLOFF_CURVES));
const FRIENDLY_FIRE_VALUES = new Set(Object.values(FRIENDLY_FIRE_MODES));
const STRUCTURE_DAMAGE_VALUES = new Set(Object.values(STRUCTURE_DAMAGE_MODES));
const TARGET_DOMAIN_VALUES = new Set(Object.values(TARGET_DOMAINS));

const finiteNumber = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number`);
  return number;
};

const boundedRatio = (value, name) => {
  const number = finiteNumber(value, name);
  if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return number;
};

const freezePolicy = (policy) => Object.freeze({ ...policy });

export function createAreaDamagePolicy({
  falloffCurve = SPLASH_FALLOFF_CURVES.LINEAR,
  innerRadiusRatio = 0.25,
  minimumDamageRatio = 0.2,
  friendlyFireMode = FRIENDLY_FIRE_MODES.DISABLED,
  friendlyFireMultiplier = 0.5,
  structureDamageMode = STRUCTURE_DAMAGE_MODES.SCALED,
  structureDamageMultiplier = 0.75,
  effectKind = 'blast',
} = {}) {
  if (!FALLOFF_VALUES.has(falloffCurve)) throw new TypeError(`Unknown splash falloff curve: ${falloffCurve}`);
  if (!FRIENDLY_FIRE_VALUES.has(friendlyFireMode)) throw new TypeError(`Unknown friendly-fire mode: ${friendlyFireMode}`);
  if (!STRUCTURE_DAMAGE_VALUES.has(structureDamageMode)) throw new TypeError(`Unknown structure-damage mode: ${structureDamageMode}`);
  if (typeof effectKind !== 'string' || !effectKind.trim()) throw new TypeError('effectKind must be a non-empty string');

  return freezePolicy({
    schemaVersion: AREA_DAMAGE_POLICY_VERSION,
    falloffCurve,
    innerRadiusRatio: boundedRatio(innerRadiusRatio, 'innerRadiusRatio'),
    minimumDamageRatio: boundedRatio(minimumDamageRatio, 'minimumDamageRatio'),
    friendlyFireMode,
    friendlyFireMultiplier: boundedRatio(friendlyFireMultiplier, 'friendlyFireMultiplier'),
    structureDamageMode,
    structureDamageMultiplier: boundedRatio(structureDamageMultiplier, 'structureDamageMultiplier'),
    effectKind: effectKind.trim(),
  });
}

export const DEFAULT_AREA_DAMAGE_POLICY = createAreaDamagePolicy();

export function validateAreaDamagePolicy(policy) {
  if (!policy || typeof policy !== 'object') return ['area-damage policy must be an object'];

  const errors = [];
  if (policy.schemaVersion !== AREA_DAMAGE_POLICY_VERSION) errors.push(`schemaVersion must be ${AREA_DAMAGE_POLICY_VERSION}`);
  if (!FALLOFF_VALUES.has(policy.falloffCurve)) errors.push(`unknown falloffCurve: ${policy.falloffCurve}`);
  if (!Number.isFinite(policy.innerRadiusRatio) || policy.innerRadiusRatio < 0 || policy.innerRadiusRatio > 1) errors.push('innerRadiusRatio must be between 0 and 1');
  if (!Number.isFinite(policy.minimumDamageRatio) || policy.minimumDamageRatio < 0 || policy.minimumDamageRatio > 1) errors.push('minimumDamageRatio must be between 0 and 1');
  if (!FRIENDLY_FIRE_VALUES.has(policy.friendlyFireMode)) errors.push(`unknown friendlyFireMode: ${policy.friendlyFireMode}`);
  if (!Number.isFinite(policy.friendlyFireMultiplier) || policy.friendlyFireMultiplier < 0 || policy.friendlyFireMultiplier > 1) errors.push('friendlyFireMultiplier must be between 0 and 1');
  if (!STRUCTURE_DAMAGE_VALUES.has(policy.structureDamageMode)) errors.push(`unknown structureDamageMode: ${policy.structureDamageMode}`);
  if (!Number.isFinite(policy.structureDamageMultiplier) || policy.structureDamageMultiplier < 0 || policy.structureDamageMultiplier > 1) errors.push('structureDamageMultiplier must be between 0 and 1');
  if (typeof policy.effectKind !== 'string' || !policy.effectKind.trim()) errors.push('effectKind must be a non-empty string');
  return errors;
}

function resolveFalloffMultiplier(distance, radius, policy) {
  if (radius === 0) return distance === 0 ? 1 : 0;

  const innerRadius = radius * policy.innerRadiusRatio;
  if (distance <= innerRadius || innerRadius === radius) return 1;

  const progress = (distance - innerRadius) / (radius - innerRadius);
  const remaining = Math.max(0, 1 - progress);
  if (policy.falloffCurve === SPLASH_FALLOFF_CURVES.CONSTANT) return 1;
  if (policy.falloffCurve === SPLASH_FALLOFF_CURVES.QUADRATIC) return remaining * remaining;
  return remaining;
}

function relationshipMultiplier(source, target, policy) {
  const friendly = source?.side != null && target.side === source.side;
  if (!friendly) return { multiplier: 1, skippedReason: null };
  if (policy.friendlyFireMode === FRIENDLY_FIRE_MODES.DISABLED) return { multiplier: 0, skippedReason: 'friendly-fire-disabled' };
  if (policy.friendlyFireMode === FRIENDLY_FIRE_MODES.SCALED) return { multiplier: policy.friendlyFireMultiplier, skippedReason: null };
  return { multiplier: 1, skippedReason: null };
}

function domainMultiplier(target, policy) {
  if (target.domain !== TARGET_DOMAINS.STRUCTURE) return { multiplier: 1, skippedReason: null };
  if (policy.structureDamageMode === STRUCTURE_DAMAGE_MODES.DISABLED) return { multiplier: 0, skippedReason: 'structure-damage-disabled' };
  if (policy.structureDamageMode === STRUCTURE_DAMAGE_MODES.SCALED) return { multiplier: policy.structureDamageMultiplier, skippedReason: null };
  return { multiplier: 1, skippedReason: null };
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object') throw new TypeError('area-damage target must be an object');
  if (target.id == null || String(target.id).length === 0) throw new TypeError('area-damage target requires a stable id');
  if (!TARGET_DOMAIN_VALUES.has(target.domain)) throw new TypeError(`Unknown target domain for ${target.id}: ${target.domain}`);

  const collisionRadius = target.collisionRadius == null ? 0 : finiteNumber(target.collisionRadius, `collisionRadius for ${target.id}`);
  if (collisionRadius < 0) throw new RangeError(`collisionRadius for ${target.id} must be non-negative`);

  return {
    id: String(target.id),
    x: finiteNumber(target.x, `x for ${target.id}`),
    y: finiteNumber(target.y, `y for ${target.id}`),
    side: target.side ?? null,
    domain: target.domain,
    collisionRadius,
  };
}

const freezeEntry = (entry) => Object.freeze(entry);

export function resolveAreaDamage({
  impactX,
  impactY,
  radius,
  baseDamage,
  source = null,
  targets = [],
  policy = DEFAULT_AREA_DAMAGE_POLICY,
} = {}) {
  const x = finiteNumber(impactX, 'impactX');
  const y = finiteNumber(impactY, 'impactY');
  const outerRadius = finiteNumber(radius, 'radius');
  const damage = finiteNumber(baseDamage, 'baseDamage');
  if (outerRadius < 0) throw new RangeError('radius must be non-negative');
  if (damage < 0) throw new RangeError('baseDamage must be non-negative');
  if (!Array.isArray(targets)) throw new TypeError('targets must be an array');

  const policyErrors = validateAreaDamagePolicy(policy);
  if (policyErrors.length) throw new TypeError(policyErrors.join('; '));

  const normalizedTargets = targets.map(normalizeTarget).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const uniqueIds = new Set();
  const applications = [];
  const skipped = [];

  for (const target of normalizedTargets) {
    if (uniqueIds.has(target.id)) throw new TypeError(`Duplicate area-damage target id: ${target.id}`);
    uniqueIds.add(target.id);

    const centerDistance = Math.hypot(target.x - x, target.y - y);
    const distance = Math.max(0, centerDistance - target.collisionRadius);
    if (distance > outerRadius) {
      skipped.push(freezeEntry({ targetId: target.id, reason: 'outside-radius', distance }));
      continue;
    }

    const relationship = relationshipMultiplier(source, target, policy);
    if (relationship.skippedReason) {
      skipped.push(freezeEntry({ targetId: target.id, reason: relationship.skippedReason, distance }));
      continue;
    }

    const domain = domainMultiplier(target, policy);
    if (domain.skippedReason) {
      skipped.push(freezeEntry({ targetId: target.id, reason: domain.skippedReason, distance }));
      continue;
    }

    const falloffMultiplier = Math.max(
      policy.minimumDamageRatio,
      resolveFalloffMultiplier(distance, outerRadius, policy),
    );
    const resolvedDamage = damage * falloffMultiplier * relationship.multiplier * domain.multiplier;

    applications.push(freezeEntry({
      targetId: target.id,
      distance,
      falloffMultiplier,
      friendlyFireMultiplier: relationship.multiplier,
      structureDamageMultiplier: domain.multiplier,
      damage: resolvedDamage,
    }));
  }

  const affectedTargetIds = Object.freeze(applications.map((entry) => entry.targetId));
  const effect = Object.freeze({
    owner: AREA_DAMAGE_OWNERSHIP.effect,
    kind: policy.effectKind,
    x,
    y,
    radius: outerRadius,
    affectedTargetIds,
  });

  return Object.freeze({
    owner: AREA_DAMAGE_OWNERSHIP.damage,
    applications: Object.freeze(applications),
    skipped: Object.freeze(skipped),
    effect,
  });
}
