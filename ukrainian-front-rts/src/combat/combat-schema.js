export const COMBAT_SCHEMA_VERSION = 1;

export const DAMAGE_CLASSES = Object.freeze({
  SMALL_ARMS: 'smallArms',
  HEAVY_MACHINE_GUN: 'heavyMachineGun',
  AUTOCANNON: 'autocannon',
  SHAPED_CHARGE: 'shapedCharge',
  KINETIC: 'kinetic',
  HIGH_EXPLOSIVE: 'highExplosive',
  DRONE_STRIKE: 'droneStrike',
});

export const ARMOR_CLASSES = Object.freeze({
  SOFT: 'soft',
  LIGHT: 'light',
  MEDIUM: 'medium',
  HEAVY: 'heavy',
  STRUCTURE: 'structure',
});

export const TARGET_DOMAINS = Object.freeze({
  GROUND: 'ground',
  AIR: 'air',
  STRUCTURE: 'structure',
});

export const SPLASH_CLASSES = Object.freeze({
  NONE: 'none',
  POINT: 'point',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
});

export const RESISTANCE_CLASSES = Object.freeze({
  NONE: 'none',
  INFANTRY: 'infantry',
  VEHICLE: 'vehicle',
  FORTIFIED: 'fortified',
  AIRFRAME: 'airframe',
});

const values = (record) => new Set(Object.values(record));
const DAMAGE_VALUES = values(DAMAGE_CLASSES);
const ARMOR_VALUES = values(ARMOR_CLASSES);
const DOMAIN_VALUES = values(TARGET_DOMAINS);
const SPLASH_VALUES = values(SPLASH_CLASSES);
const RESISTANCE_VALUES = values(RESISTANCE_CLASSES);

export const PENETRATION_MATRIX = Object.freeze({
  [DAMAGE_CLASSES.SMALL_ARMS]: Object.freeze({ soft: 1, light: 0.35, medium: 0.08, heavy: 0.02, structure: 0.2 }),
  [DAMAGE_CLASSES.HEAVY_MACHINE_GUN]: Object.freeze({ soft: 1, light: 0.7, medium: 0.22, heavy: 0.08, structure: 0.3 }),
  [DAMAGE_CLASSES.AUTOCANNON]: Object.freeze({ soft: 1.1, light: 1, medium: 0.65, heavy: 0.3, structure: 0.55 }),
  [DAMAGE_CLASSES.SHAPED_CHARGE]: Object.freeze({ soft: 0.8, light: 1.15, medium: 1.1, heavy: 1, structure: 0.75 }),
  [DAMAGE_CLASSES.KINETIC]: Object.freeze({ soft: 0.65, light: 1, medium: 1.1, heavy: 1.15, structure: 0.65 }),
  [DAMAGE_CLASSES.HIGH_EXPLOSIVE]: Object.freeze({ soft: 1.25, light: 0.8, medium: 0.5, heavy: 0.28, structure: 1 }),
  [DAMAGE_CLASSES.DRONE_STRIKE]: Object.freeze({ soft: 0.9, light: 1.1, medium: 1, heavy: 0.8, structure: 0.75 }),
});

export const RESISTANCE_MULTIPLIERS = Object.freeze({
  [RESISTANCE_CLASSES.NONE]: 1,
  [RESISTANCE_CLASSES.INFANTRY]: 1,
  [RESISTANCE_CLASSES.VEHICLE]: 0.95,
  [RESISTANCE_CLASSES.FORTIFIED]: 0.8,
  [RESISTANCE_CLASSES.AIRFRAME]: 0.9,
});

export function createWeaponProfile({
  damageClass,
  targetDomains = [TARGET_DOMAINS.GROUND],
  splashClass = SPLASH_CLASSES.NONE,
  penetration = null,
} = {}) {
  const profile = {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    damageClass,
    targetDomains: [...targetDomains],
    splashClass,
    penetration: penetration == null ? null : Number(penetration),
  };
  const errors = validateWeaponProfile(profile);
  if (errors.length) throw new TypeError(errors.join('; '));
  return Object.freeze(profile);
}

export function createDefenseProfile({ armorClass, resistanceClass = RESISTANCE_CLASSES.NONE } = {}) {
  const profile = {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    armorClass,
    resistanceClass,
  };
  const errors = validateDefenseProfile(profile);
  if (errors.length) throw new TypeError(errors.join('; '));
  return Object.freeze(profile);
}

export function validateWeaponProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') return ['weapon profile must be an object'];
  if (profile.schemaVersion !== COMBAT_SCHEMA_VERSION) errors.push(`weapon schemaVersion must be ${COMBAT_SCHEMA_VERSION}`);
  if (!DAMAGE_VALUES.has(profile.damageClass)) errors.push(`unknown damageClass: ${profile.damageClass}`);
  if (!Array.isArray(profile.targetDomains) || !profile.targetDomains.length) errors.push('targetDomains must be a non-empty array');
  else if (profile.targetDomains.some((domain) => !DOMAIN_VALUES.has(domain))) errors.push('targetDomains contains an unknown domain');
  if (!SPLASH_VALUES.has(profile.splashClass)) errors.push(`unknown splashClass: ${profile.splashClass}`);
  if (profile.penetration != null && (!Number.isFinite(profile.penetration) || profile.penetration < 0)) errors.push('penetration must be null or a non-negative finite number');
  return errors;
}

export function validateDefenseProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') return ['defense profile must be an object'];
  if (profile.schemaVersion !== COMBAT_SCHEMA_VERSION) errors.push(`defense schemaVersion must be ${COMBAT_SCHEMA_VERSION}`);
  if (!ARMOR_VALUES.has(profile.armorClass)) errors.push(`unknown armorClass: ${profile.armorClass}`);
  if (!RESISTANCE_VALUES.has(profile.resistanceClass)) errors.push(`unknown resistanceClass: ${profile.resistanceClass}`);
  return errors;
}

export function canTargetDomain(weaponProfile, domain) {
  return validateWeaponProfile(weaponProfile).length === 0 && DOMAIN_VALUES.has(domain) && weaponProfile.targetDomains.includes(domain);
}

export function resolveDamageMultiplier(weaponProfile, defenseProfile, targetDomain = TARGET_DOMAINS.GROUND) {
  if (validateWeaponProfile(weaponProfile).length) return 0;
  if (validateDefenseProfile(defenseProfile).length) return 0;
  if (!canTargetDomain(weaponProfile, targetDomain)) return 0;
  const matrixMultiplier = PENETRATION_MATRIX[weaponProfile.damageClass][defenseProfile.armorClass];
  const resistanceMultiplier = RESISTANCE_MULTIPLIERS[defenseProfile.resistanceClass];
  const penetrationMultiplier = weaponProfile.penetration == null
    ? 1
    : Math.max(0.1, Math.min(1.5, weaponProfile.penetration));
  return matrixMultiplier * resistanceMultiplier * penetrationMultiplier;
}
