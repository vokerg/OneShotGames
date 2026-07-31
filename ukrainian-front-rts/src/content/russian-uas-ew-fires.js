import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import { AIR_TARGET_CLASSES, DEFAULT_AIR_DEFENSE_CONFIG } from '../combat/air-defense-system.js';
import { DAMAGE_CLASSES, TARGET_DOMAINS, SPLASH_CLASSES } from '../combat/combat-schema.js';

export const RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION = 1;
export const RUSSIAN_UAS_EW_FIRES_DOCTRINE = 'echeloned-pressure';

export const RUSSIAN_UAS_EW_FIRES_ROLE_IDS = Object.freeze([
  'broad-area-reconnaissance',
  'one-way-recon-strike',
  'persistent-spectrum-denial',
  'prepared-self-propelled-artillery',
  'saturation-rocket-artillery',
  'short-range-air-defense',
  'medium-range-air-defense',
]);

export const RUSSIAN_UAS_EW_FIRES_PROFILE_IDS = Object.freeze([
  'ru.recon-uav',
  'ru.recon-uav.strike',
  'ru.jammer',
  'ru.self-propelled-gun',
  'ru.self-propelled-gun.rocket',
  'ru.sam-battery.point-defense',
  'ru.sam-battery',
]);

export const RUSSIAN_UAS_EW_FIRES_COUNTER_DOMAINS = Object.freeze([
  'air-defense',
  'anti-radiation',
  'armor',
  'counter-battery',
  'dispersion',
  'drones',
  'electronic-warfare',
  'fires',
  'fortifications',
  'ground-assault',
  'infantry',
  'logistics',
  'missiles',
  'reconnaissance',
  'saturation',
  'supply',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const capability = (id, parameters = {}) => ({ id, parameters });
const RUSSIAN_TREE = FACTION_TECH_TREES.factions.russia;
const TECH_NODES_BY_ID = new Map(RUSSIAN_TREE.nodes.map((node) => [node.id, node]));

function profile({
  id,
  rosterNodeId,
  roleId,
  displayName,
  shortName,
  variantRequires = [],
  capacityCost,
  cost,
  deployment,
  resupplyPriority,
  droneConfig = null,
  strikeWeapon = null,
  ewConfig = null,
  weapon = null,
  artilleryConfig = null,
  spotting = null,
  airDefenseConfig = null,
  airTargetPriority = null,
  capabilities,
  counters,
  vulnerabilities,
  supportLinks,
  playerUse,
}) {
  const rosterNode = TECH_NODES_BY_ID.get(rosterNodeId);
  const family = rosterNodeId === 'ru.recon-uav'
    ? 'uas'
    : rosterNodeId === 'ru.jammer'
      ? 'electronic-warfare'
      : rosterNodeId === 'ru.self-propelled-gun'
        ? 'indirect-fire'
        : 'air-defense';
  return {
    schemaVersion: RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION,
    faction: 'russia',
    doctrine: RUSSIAN_UAS_EW_FIRES_DOCTRINE,
    family,
    id,
    rosterNodeId,
    roleId,
    displayName,
    shortName,
    tier: rosterNode?.tier,
    producer: rosterNode?.producer,
    requires: rosterNode ? [...rosterNode.requires] : [],
    variantRequires,
    capacityCost,
    cost,
    deployment,
    resupplyPriority,
    droneConfig,
    strikeWeapon,
    ewConfig,
    weapon,
    artilleryConfig,
    spotting,
    airDefenseConfig,
    airTargetPriority,
    capabilities,
    counters,
    vulnerabilities,
    supportLinks,
    playerUse,
  };
}

const PROFILES = [
  profile({
    id: 'ru.recon-uav',
    rosterNodeId: 'ru.recon-uav',
    roleId: 'broad-area-reconnaissance',
    displayName: 'Russian Broad-Area Reconnaissance UAV Section',
    shortName: 'Recon UAV',
    capacityCost: 2,
    cost: { metal: 78, fuel: 18, intel: 28 },
    deployment: { setupTime: 1.4, packTime: 1.1, posture: 'mobile-launch' },
    resupplyPriority: 'medium',
    droneConfig: {
      payload: 0,
      launchTime: 1.4,
      loiterDuration: 128,
      returnTime: 4.8,
      recoveryTime: 1.5,
      linkRange: 760,
      linkHardening: 0.22,
      jamRangePenalty: 410,
      minimumEffectiveRange: 110,
      qualityJamPenalty: 0.28,
      linkLossGrace: 3.2,
      autonomousReturn: true,
      autonomousStrike: false,
      requiresSpottedTarget: false,
      consumedOnStrike: false,
      strikeCooldown: 0,
      signaturePerStrike: 0,
      signatureDecay: 0.1,
      signatureInterceptionBonus: 0.18,
      evasionBonus: 0.18,
    },
    capabilities: [
      capability('broad-area-search', { scanRadius: 310, contactRefreshSeconds: 2.5 }),
      capability('artillery-spotting', { minimumContactQuality: 0.38, maximumSupportRange: 820 }),
      capability('successive-contact', { handoffDelaySeconds: 1.2, reserveCueing: true }),
    ],
    counters: ['reconnaissance', 'fires', 'logistics'],
    vulnerabilities: ['air-defense', 'electronic-warfare', 'drones'],
    supportLinks: ['ru.recon-uav.strike', 'ru.jammer', 'ru.self-propelled-gun'],
    playerUse: 'Maintain broad contact over the prepared sector and hand stable target tracks to artillery; avoid dense air-defense and strong jamming instead of treating the UAV as expendable vision.',
  }),
  profile({
    id: 'ru.recon-uav.strike',
    rosterNodeId: 'ru.recon-uav',
    roleId: 'one-way-recon-strike',
    displayName: 'Russian One-Way Reconnaissance-Strike UAV Detachment',
    shortName: 'Recon-Strike UAV',
    variantRequires: ['ru.spectrum-denial'],
    capacityCost: 3,
    cost: { metal: 92, fuel: 14, intel: 42 },
    deployment: { setupTime: 1.8, packTime: 1.2, posture: 'massed-launch' },
    resupplyPriority: 'high',
    droneConfig: {
      payload: 1,
      launchTime: 1.8,
      loiterDuration: 62,
      returnTime: 0,
      recoveryTime: 0,
      linkRange: 590,
      linkHardening: 0.12,
      jamRangePenalty: 430,
      minimumEffectiveRange: 70,
      qualityJamPenalty: 0.34,
      linkLossGrace: 1.5,
      autonomousReturn: false,
      autonomousStrike: true,
      requiresSpottedTarget: true,
      consumedOnStrike: true,
      strikeCooldown: 0,
      signaturePerStrike: 0.74,
      signatureDecay: 0.04,
      signatureInterceptionBonus: 0.32,
      evasionBonus: 0.08,
    },
    strikeWeapon: {
      damageClass: DAMAGE_CLASSES.DRONE_STRIKE,
      targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
      splashClass: SPLASH_CLASSES.POINT,
      damage: 82,
    },
    capabilities: [
      capability('one-way-strike', { payload: 1, consumedOnStrike: true }),
      capability('reconnaissance-strike-chain', { requiredContactQuality: 0.5, launchWindowSeconds: 9 }),
      capability('massed-launch', { preferredWaveSize: 4, saturationBonus: 0.16 }),
    ],
    counters: ['armor', 'fires', 'logistics'],
    vulnerabilities: ['air-defense', 'electronic-warfare', 'dispersion'],
    supportLinks: ['ru.recon-uav', 'ru.jammer', 'ru.self-propelled-gun.rocket'],
    playerUse: 'Commit one-way aircraft only after reconnaissance fixes a valuable target and spectrum denial creates a launch window; piecemeal attacks are vulnerable to interception and jamming.',
  }),
  profile({
    id: 'ru.jammer',
    rosterNodeId: 'ru.jammer',
    roleId: 'persistent-spectrum-denial',
    displayName: 'Russian Persistent Spectrum-Denial Company',
    shortName: 'Jammer',
    capacityCost: 4,
    cost: { metal: 165, fuel: 58, intel: 52 },
    deployment: { setupTime: 4.2, packTime: 3.4, posture: 'prepared-emission-site' },
    resupplyPriority: 'high',
    ewConfig: {
      emissionRange: 660,
      jammerStrength: 0.76,
      linkDisruption: 0.7,
      radarDegradation: 0.58,
      minimumEffect: 0.08,
      ownLinkHardening: 0.42,
      emissionSignature: 0.88,
      setupTime: 4.2,
      packTime: 3.4,
    },
    capabilities: [
      capability('persistent-link-denial', { emissionRange: 660, jammerStrength: 0.76 }),
      capability('radar-degradation', { radarDegradation: 0.58, affectsDetectionRange: true }),
      capability('prepared-spectrum-sector', { setupTime: 4.2, relocationPenaltySeconds: 3.4 }),
    ],
    counters: ['electronic-warfare', 'drones', 'air-defense'],
    vulnerabilities: ['anti-radiation', 'counter-battery', 'ground-assault'],
    supportLinks: ['ru.recon-uav', 'ru.recon-uav.strike', 'ru.sam-battery'],
    playerUse: 'Anchor a prepared sector by degrading hostile links and radar performance, then relocate when emissions are detected because the jammer is a high-signature target for artillery and ground raids.',
  }),
  profile({
    id: 'ru.self-propelled-gun',
    rosterNodeId: 'ru.self-propelled-gun',
    roleId: 'prepared-self-propelled-artillery',
    displayName: 'Russian Prepared Self-Propelled Artillery Battalion',
    shortName: 'Prepared SPG',
    capacityCost: 6,
    cost: { metal: 248, fuel: 102, intel: 32 },
    deployment: { setupTime: 5.4, packTime: 4.1, posture: 'prepared-battery' },
    resupplyPriority: 'critical',
    weapon: {
      damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE,
      targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
      splashClass: SPLASH_CLASSES.MEDIUM,
      minimumRange: 145,
      maximumRange: 790,
      damage: 76,
    },
    artilleryConfig: {
      ammo: 30,
      setupTime: 5.4,
      packTime: 4.1,
      minimumRange: 145,
      salvoSize: 5,
      shotCadence: 1.05,
      signaturePerShot: 0.24,
      signatureDecay: 0.045,
      scatterRadius: 30,
    },
    spotting: { requiredBeyondRange: 370, minimumContactQuality: 0.4 },
    capabilities: [
      capability('prepared-fire-plan', { registeredSectors: 3, responseDelaySeconds: 4.2 }),
      capability('sustained-salvo', { ammunition: 30, salvoSize: 5 }),
      capability('counter-battery-watch', { signatureThreshold: 0.32, reserveSalvo: 5 }),
    ],
    counters: ['infantry', 'fires', 'fortifications'],
    vulnerabilities: ['counter-battery', 'drones', 'supply'],
    supportLinks: ['ru.recon-uav', 'ru.jammer', 'ru.self-propelled-gun.rocket'],
    playerUse: 'Register sectors and sustain repeated fire from a protected supply route, but displace after signatures accumulate or hostile reconnaissance begins cueing counter-battery attacks.',
  }),
  profile({
    id: 'ru.self-propelled-gun.rocket',
    rosterNodeId: 'ru.self-propelled-gun',
    roleId: 'saturation-rocket-artillery',
    displayName: 'Russian Saturation Rocket-Artillery Battalion',
    shortName: 'Rocket Artillery',
    variantRequires: ['ru.operational-mass'],
    capacityCost: 8,
    cost: { metal: 355, fuel: 142, intel: 52 },
    deployment: { setupTime: 7.2, packTime: 5.8, posture: 'deep-saturation-battery' },
    resupplyPriority: 'critical',
    weapon: {
      damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE,
      targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
      splashClass: SPLASH_CLASSES.LARGE,
      minimumRange: 245,
      maximumRange: 1020,
      damage: 64,
    },
    artilleryConfig: {
      ammo: 16,
      setupTime: 7.2,
      packTime: 5.8,
      minimumRange: 245,
      salvoSize: 8,
      shotCadence: 0.42,
      signaturePerShot: 0.42,
      signatureDecay: 0.03,
      scatterRadius: 68,
    },
    spotting: { requiredBeyondRange: 500, minimumContactQuality: 0.56 },
    capabilities: [
      capability('saturation-fire', { salvoSize: 8, areaRadius: 92 }),
      capability('successive-echelon-interdiction', { targets: ['logistics', 'fires', 'fortifications'] }),
      capability('ammunition-intensive', { reloadBurden: 1.6, displacementRequired: true }),
    ],
    counters: ['fires', 'fortifications', 'logistics'],
    vulnerabilities: ['counter-battery', 'drones', 'supply'],
    supportLinks: ['ru.recon-uav.strike', 'ru.jammer', 'ru.self-propelled-gun'],
    playerUse: 'Use a full rocket salvo to disrupt a defended sector or rear-area support network, then relocate and resupply; the battery is inefficient against dispersed low-value targets.',
  }),
  profile({
    id: 'ru.sam-battery.point-defense',
    rosterNodeId: 'ru.sam-battery',
    roleId: 'short-range-air-defense',
    displayName: 'Russian Short-Range Air-Defense Detachment',
    shortName: 'Short-Range AD',
    capacityCost: 4,
    cost: { metal: 190, fuel: 62, intel: 48 },
    deployment: { setupTime: 2.1, packTime: 1.8, posture: 'close-protection' },
    resupplyPriority: 'high',
    airDefenseConfig: {
      ...DEFAULT_AIR_DEFENSE_CONFIG,
      detectionRange: 305,
      opticalRange: 195,
      minimumRadarRange: 30,
      jammerRangePenalty: 0.52,
      radarHardening: 0.32,
      minimumRange: 12,
      maximumRange: 215,
      minimumAltitude: 0,
      maximumAltitude: 300,
      reloadTime: 1.15,
      ammunition: 16,
      maxInFlight: 2,
      maxMissilesPerTarget: 1,
      missileSpeed: 345,
      missileDamage: 48,
      missileLife: 3,
      seekerRange: 340,
      impactRadius: 4,
      hitChance: 0.69,
      overkillThreshold: 0.9,
    },
    airTargetPriority: [
      AIR_TARGET_CLASSES.LOITERING_MUNITION,
      AIR_TARGET_CLASSES.STRIKE_DRONE,
      AIR_TARGET_CLASSES.RECON_DRONE,
      AIR_TARGET_CLASSES.MISSILE,
    ],
    capabilities: [
      capability('close-counter-uas', { ammunition: 16, maxInFlight: 2 }),
      capability('fires-point-defense', { protectedRadius: 190, preferredTargets: ['loiteringMunition', 'strikeDrone'] }),
      capability('optical-ambush', { opticalRange: 195, radarOffUntilContact: true }),
    ],
    counters: ['drones', 'missiles', 'reconnaissance'],
    vulnerabilities: ['ground-assault', 'fires', 'saturation'],
    supportLinks: ['ru.jammer', 'ru.self-propelled-gun', 'ru.sam-battery'],
    playerUse: 'Protect artillery and jammers from low-altitude drones and loitering munitions, conserving missiles for close threats while the medium-range battery handles larger targets.',
  }),
  profile({
    id: 'ru.sam-battery',
    rosterNodeId: 'ru.sam-battery',
    roleId: 'medium-range-air-defense',
    displayName: 'Russian Prepared Medium-Range Air-Defense Battery',
    shortName: 'Medium-Range SAM',
    capacityCost: 7,
    cost: { metal: 310, fuel: 112, intel: 78 },
    deployment: { setupTime: 4.6, packTime: 3.8, posture: 'prepared-sector-defense' },
    resupplyPriority: 'critical',
    airDefenseConfig: {
      ...DEFAULT_AIR_DEFENSE_CONFIG,
      detectionRange: 525,
      opticalRange: 160,
      minimumRadarRange: 65,
      jammerRangePenalty: 0.46,
      radarHardening: 0.58,
      minimumRange: 42,
      maximumRange: 455,
      minimumAltitude: 7,
      maximumAltitude: 720,
      reloadTime: 3.4,
      ammunition: 10,
      maxInFlight: 4,
      maxMissilesPerTarget: 2,
      missileSpeed: 405,
      missileDamage: 96,
      missileLife: 5.5,
      seekerRange: 720,
      impactRadius: 8,
      hitChance: 0.77,
      overkillThreshold: 0.9,
    },
    airTargetPriority: [
      AIR_TARGET_CLASSES.MISSILE,
      AIR_TARGET_CLASSES.LOITERING_MUNITION,
      AIR_TARGET_CLASSES.STRIKE_DRONE,
      AIR_TARGET_CLASSES.RECON_DRONE,
      AIR_TARGET_CLASSES.AIRCRAFT,
    ],
    capabilities: [
      capability('prepared-sector-umbrella', { engagementRange: 455, sharedTrackRange: 560 }),
      capability('missile-reservation', { maxInFlight: 4, overkillPrevention: true }),
      capability('layered-defense-command', { subordinatePointDefense: true, radarHardening: 0.58 }),
    ],
    counters: ['air-defense', 'missiles', 'drones'],
    vulnerabilities: ['anti-radiation', 'ground-assault', 'saturation'],
    supportLinks: ['ru.jammer', 'ru.sam-battery.point-defense', 'ru.recon-uav'],
    playerUse: 'Establish a prepared medium-range umbrella over the fires echelon and reserve missiles by target priority; protect the radar from anti-radiation attack and ground penetration.',
  }),
];

export const RUSSIAN_UAS_EW_FIRES_BRANCH = deepFreeze({
  schemaVersion: RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION,
  faction: 'russia',
  doctrine: RUSSIAN_UAS_EW_FIRES_DOCTRINE,
  profiles: PROFILES,
});

const ROLE_IDS = new Set(RUSSIAN_UAS_EW_FIRES_ROLE_IDS);
const PROFILE_IDS = new Set(RUSSIAN_UAS_EW_FIRES_PROFILE_IDS);
const COUNTER_DOMAINS = new Set(RUSSIAN_UAS_EW_FIRES_COUNTER_DOMAINS);
const ROSTER_NODE_IDS = new Set(['ru.recon-uav', 'ru.jammer', 'ru.self-propelled-gun', 'ru.sam-battery']);
const AIR_TARGET_VALUES = new Set(Object.values(AIR_TARGET_CLASSES));
const DAMAGE_VALUES = new Set(Object.values(DAMAGE_CLASSES));
const TARGET_VALUES = new Set(Object.values(TARGET_DOMAINS));
const SPLASH_VALUES = new Set(Object.values(SPLASH_CLASSES));
const PROFILES_BY_ID = new Map(RUSSIAN_UAS_EW_FIRES_BRANCH.profiles.map((record) => [record.id, record]));

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function finiteInRange(value, minimum, maximum = Infinity) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateDrone(errors, path, record) {
  const config = record.droneConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: UAS profile requires droneConfig`);
    return;
  }
  if (!Number.isInteger(config.payload) || config.payload < 0) errors.push(`${path}: droneConfig.payload must be a non-negative integer`);
  for (const field of ['launchTime', 'loiterDuration', 'returnTime', 'recoveryTime', 'linkRange', 'jamRangePenalty', 'minimumEffectiveRange', 'linkLossGrace', 'strikeCooldown', 'signatureDecay']) {
    if (!finiteInRange(config[field], 0)) errors.push(`${path}: droneConfig.${field} must be non-negative`);
  }
  if (config.loiterDuration <= 0 || config.linkRange <= 0) errors.push(`${path}: droneConfig loiterDuration and linkRange must be positive`);
  for (const field of ['linkHardening', 'qualityJamPenalty', 'signaturePerStrike', 'signatureInterceptionBonus', 'evasionBonus']) {
    if (!finiteInRange(config[field], 0, 1)) errors.push(`${path}: droneConfig.${field} must be within [0, 1]`);
  }
  for (const field of ['autonomousReturn', 'autonomousStrike', 'requiresSpottedTarget', 'consumedOnStrike']) {
    if (typeof config[field] !== 'boolean') errors.push(`${path}: droneConfig.${field} must be boolean`);
  }
  if (record.roleId === 'broad-area-reconnaissance' && (config.payload !== 0 || record.strikeWeapon !== null || config.consumedOnStrike)) errors.push(`${path}: reconnaissance profile cannot own a strike payload`);
  if (record.roleId === 'one-way-recon-strike') {
    if (config.payload !== 1 || !config.consumedOnStrike || !config.requiresSpottedTarget) errors.push(`${path}: one-way strike profile requires one consumed payload and a spotted target`);
    if (!record.strikeWeapon || !DAMAGE_VALUES.has(record.strikeWeapon.damageClass) || !SPLASH_VALUES.has(record.strikeWeapon.splashClass)) errors.push(`${path}: invalid strikeWeapon`);
    if (!Array.isArray(record.strikeWeapon?.targetDomains) || record.strikeWeapon.targetDomains.some((domain) => !TARGET_VALUES.has(domain))) errors.push(`${path}: strikeWeapon targetDomains are invalid`);
    if (!finiteInRange(record.strikeWeapon?.damage, Number.EPSILON)) errors.push(`${path}: strikeWeapon.damage must be positive`);
  }
}

function validateElectronicWarfare(errors, path, record) {
  const config = record.ewConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: electronic-warfare profile requires ewConfig`);
    return;
  }
  for (const field of ['emissionRange', 'setupTime', 'packTime']) if (!finiteInRange(config[field], 0)) errors.push(`${path}: ewConfig.${field} must be non-negative`);
  if (config.emissionRange <= 0) errors.push(`${path}: ewConfig.emissionRange must be positive`);
  for (const field of ['jammerStrength', 'linkDisruption', 'radarDegradation', 'minimumEffect', 'ownLinkHardening', 'emissionSignature']) {
    if (!finiteInRange(config[field], 0, 1)) errors.push(`${path}: ewConfig.${field} must be within [0, 1]`);
  }
  if (config.minimumEffect > config.jammerStrength) errors.push(`${path}: ewConfig.minimumEffect cannot exceed jammerStrength`);
}

function validateArtillery(errors, path, record) {
  if (!record.weapon || !DAMAGE_VALUES.has(record.weapon.damageClass)) errors.push(`${path}: invalid weapon damageClass`);
  if (!Array.isArray(record.weapon?.targetDomains) || record.weapon.targetDomains.some((domain) => !TARGET_VALUES.has(domain))) errors.push(`${path}: invalid weapon targetDomains`);
  if (!SPLASH_VALUES.has(record.weapon?.splashClass)) errors.push(`${path}: invalid weapon splashClass`);
  if (!finiteInRange(record.weapon?.minimumRange, 0) || !finiteInRange(record.weapon?.maximumRange, 0) || !(record.weapon.maximumRange > record.weapon.minimumRange)) errors.push(`${path}: invalid weapon range envelope`);
  if (!finiteInRange(record.weapon?.damage, Number.EPSILON)) errors.push(`${path}: weapon.damage must be positive`);
  const config = record.artilleryConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: indirect-fire profile requires artilleryConfig`);
    return;
  }
  for (const field of ['ammo', 'salvoSize']) if (!Number.isInteger(config[field]) || config[field] <= 0) errors.push(`${path}: artilleryConfig.${field} must be a positive integer`);
  if (config.salvoSize > config.ammo) errors.push(`${path}: artillery salvoSize cannot exceed ammo`);
  for (const field of ['setupTime', 'packTime', 'minimumRange', 'signatureDecay', 'scatterRadius']) if (!finiteInRange(config[field], 0)) errors.push(`${path}: artilleryConfig.${field} must be non-negative`);
  if (!finiteInRange(config.shotCadence, Number.EPSILON)) errors.push(`${path}: artilleryConfig.shotCadence must be positive`);
  if (!finiteInRange(config.signaturePerShot, 0, 1)) errors.push(`${path}: artilleryConfig.signaturePerShot must be within [0, 1]`);
  if (config.minimumRange !== record.weapon.minimumRange) errors.push(`${path}: artillery minimumRange must match weapon minimumRange`);
  if (!record.spotting || !finiteInRange(record.spotting.requiredBeyondRange, record.weapon.minimumRange) || record.spotting.requiredBeyondRange > record.weapon.maximumRange) errors.push(`${path}: invalid spotting range distinction`);
  if (!finiteInRange(record.spotting?.minimumContactQuality, 0, 1)) errors.push(`${path}: spotting.minimumContactQuality must be within [0, 1]`);
}

function validateAirDefense(errors, path, record) {
  const config = record.airDefenseConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: air-defense profile requires airDefenseConfig`);
    return;
  }
  const positiveFields = ['detectionRange', 'opticalRange', 'maximumRange', 'maximumAltitude', 'reloadTime', 'missileSpeed', 'missileDamage', 'missileLife', 'seekerRange'];
  for (const field of positiveFields) if (!finiteInRange(config[field], Number.EPSILON)) errors.push(`${path}: airDefenseConfig.${field} must be positive`);
  for (const field of ['minimumRadarRange', 'minimumRange', 'minimumAltitude', 'impactRadius']) if (!finiteInRange(config[field], 0)) errors.push(`${path}: airDefenseConfig.${field} must be non-negative`);
  for (const field of ['jammerRangePenalty', 'radarHardening', 'hitChance', 'overkillThreshold']) if (!finiteInRange(config[field], 0, 1)) errors.push(`${path}: airDefenseConfig.${field} must be within [0, 1]`);
  for (const field of ['ammunition', 'maxInFlight', 'maxMissilesPerTarget']) if (!Number.isInteger(config[field]) || config[field] <= 0) errors.push(`${path}: airDefenseConfig.${field} must be a positive integer`);
  if (!(config.maximumRange > config.minimumRange)) errors.push(`${path}: air-defense maximumRange must exceed minimumRange`);
  if (!(config.maximumAltitude > config.minimumAltitude)) errors.push(`${path}: air-defense maximumAltitude must exceed minimumAltitude`);
  if (!Array.isArray(record.airTargetPriority) || record.airTargetPriority.length === 0 || record.airTargetPriority.some((value) => !AIR_TARGET_VALUES.has(value))) errors.push(`${path}: airTargetPriority contains an unknown UFR-039 class`);
}

export function validateRussianUasEwFiresBranch(branch = RUSSIAN_UAS_EW_FIRES_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION) errors.push(`schemaVersion must be ${RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION}`);
  if (branch.faction !== 'russia') errors.push('faction must be russia');
  if (branch.doctrine !== RUSSIAN_UAS_EW_FIRES_DOCTRINE) errors.push(`doctrine must be ${RUSSIAN_UAS_EW_FIRES_DOCTRINE}`);
  if (RUSSIAN_TREE.doctrine !== branch.doctrine) errors.push('branch doctrine must match UFR-070');
  if (!Array.isArray(branch.profiles)) return Object.freeze([...errors, 'profiles must be an array']);

  for (const duplicate of duplicateValues(branch.profiles.map((record) => record?.id))) errors.push(`duplicate profile id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.profiles.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.profiles) {
    const path = record?.id || '<missing-profile-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('profile records must be objects');
      continue;
    }
    if (record.schemaVersion !== RUSSIAN_UAS_EW_FIRES_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!PROFILE_IDS.has(record.id)) errors.push(`${path}: unexpected profile id`);
    if (!ROSTER_NODE_IDS.has(record.rosterNodeId)) errors.push(`${path}: invalid rosterNodeId`);
    if (!(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`))) errors.push(`${path}: profile id must remain under its roster node namespace`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId`);
    if (record.faction !== 'russia' || record.doctrine !== RUSSIAN_UAS_EW_FIRES_DOCTRINE) errors.push(`${path}: ownership mismatch`);
    if (typeof record.displayName !== 'string' || record.displayName.trim().length < 5) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);

    const rosterNode = TECH_NODES_BY_ID.get(record.rosterNodeId);
    if (rosterNode?.kind !== 'roster') errors.push(`${path}: rosterNodeId must reference a UFR-070 roster node`);
    else {
      if (record.tier !== rosterNode.tier) errors.push(`${path}: tier must match UFR-070`);
      if (record.producer !== rosterNode.producer) errors.push(`${path}: producer must match UFR-070`);
      if (JSON.stringify(record.requires) !== JSON.stringify(rosterNode.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (TECH_NODES_BY_ID.get(record.producer)?.kind !== 'structure') errors.push(`${path}: producer must reference a UFR-070 structure`);
    if (!Array.isArray(record.variantRequires) || record.variantRequires.some((id) => !TECH_NODES_BY_ID.has(id))) errors.push(`${path}: variantRequires contains an unknown UFR-070 node`);
    for (const duplicate of duplicateValues(record.variantRequires || [])) errors.push(`${path}: duplicate variant requirement ${duplicate}`);

    if (!Number.isInteger(record.capacityCost) || record.capacityCost <= 0) errors.push(`${path}: capacityCost must be a positive integer`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!finiteInRange(record.cost?.[resource], 0)) errors.push(`${path}: cost.${resource} must be non-negative and finite`);
    for (const field of ['setupTime', 'packTime']) if (!finiteInRange(record.deployment?.[field], 0)) errors.push(`${path}: deployment.${field} must be non-negative`);
    if (!['medium', 'high', 'critical'].includes(record.resupplyPriority)) errors.push(`${path}: invalid resupplyPriority`);

    if (record.family === 'uas') {
      validateDrone(errors, path, record);
      if (record.ewConfig !== null || record.weapon !== null || record.artilleryConfig !== null || record.spotting !== null || record.airDefenseConfig !== null || record.airTargetPriority !== null) errors.push(`${path}: UAS profile contains incompatible runtime data`);
    } else if (record.family === 'electronic-warfare') {
      validateElectronicWarfare(errors, path, record);
      if (record.droneConfig !== null || record.strikeWeapon !== null || record.weapon !== null || record.artilleryConfig !== null || record.spotting !== null || record.airDefenseConfig !== null || record.airTargetPriority !== null) errors.push(`${path}: EW profile contains incompatible runtime data`);
    } else if (record.family === 'indirect-fire') {
      validateArtillery(errors, path, record);
      if (record.droneConfig !== null || record.strikeWeapon !== null || record.ewConfig !== null || record.airDefenseConfig !== null || record.airTargetPriority !== null) errors.push(`${path}: artillery profile contains incompatible runtime data`);
    } else if (record.family === 'air-defense') {
      validateAirDefense(errors, path, record);
      if (record.droneConfig !== null || record.strikeWeapon !== null || record.ewConfig !== null || record.weapon !== null || record.artilleryConfig !== null || record.spotting !== null) errors.push(`${path}: air-defense profile contains incompatible runtime data`);
    } else errors.push(`${path}: invalid family`);

    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities need at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0 || record.counters.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length < 2 || record.vulnerabilities.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilities are invalid`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.length === 0) errors.push(`${path}: supportLinks must be non-empty`);
    for (const linkedId of record.supportLinks || []) if (!PROFILE_IDS.has(linkedId) && !TECH_NODES_BY_ID.has(linkedId)) errors.push(`${path}: unknown support link ${linkedId}`);
    if (record.supportLinks?.includes(record.id)) errors.push(`${path}: supportLinks cannot contain itself`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 60) errors.push(`${path}: playerUse must contain actionable guidance`);
  }

  for (const id of RUSSIAN_UAS_EW_FIRES_PROFILE_IDS) if (!branch.profiles.some((record) => record.id === id)) errors.push(`missing required profile: ${id}`);
  for (const roleId of RUSSIAN_UAS_EW_FIRES_ROLE_IDS) if (!branch.profiles.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  for (const rosterNodeId of ROSTER_NODE_IDS) if (!branch.profiles.some((record) => record.rosterNodeId === rosterNodeId)) errors.push(`missing UFR-070 roster coverage: ${rosterNodeId}`);
  if (branch.profiles.filter((record) => record.rosterNodeId === 'ru.recon-uav').length !== 2) errors.push('recon-UAV roster node must expose reconnaissance and strike variants');
  if (branch.profiles.filter((record) => record.rosterNodeId === 'ru.self-propelled-gun').length !== 2) errors.push('fires roster node must expose gun and rocket variants');
  if (branch.profiles.filter((record) => record.rosterNodeId === 'ru.sam-battery').length !== 2) errors.push('air-defense roster node must expose short- and medium-range variants');
  return Object.freeze([...new Set(errors)].sort());
}

export function getRussianUasEwFiresProfile(profileId) {
  const record = PROFILES_BY_ID.get(profileId);
  if (!record) throw new RangeError(`Unknown Russian UAS/EW/fires profile: ${profileId}`);
  return record;
}

export function getRussianUasEwFiresVariants(rosterNodeId) {
  if (typeof rosterNodeId !== 'string' || !rosterNodeId) throw new TypeError('rosterNodeId must be a non-empty string');
  const variants = RUSSIAN_UAS_EW_FIRES_BRANCH.profiles.filter((record) => record.rosterNodeId === rosterNodeId);
  if (!variants.length) throw new RangeError(`Unknown Russian UAS/EW/fires roster node: ${rosterNodeId}`);
  return Object.freeze([...variants]);
}

export function availableRussianUasEwFiresProfiles(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(RUSSIAN_UAS_EW_FIRES_BRANCH.profiles
    .filter((record) => [...record.requires, ...record.variantRequires].every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function getRussianDroneRuntimeConfig(profileId) {
  const record = getRussianUasEwFiresProfile(profileId);
  if (!record.droneConfig) throw new TypeError(`${record.id} is not a UFR-038 drone profile`);
  return record.droneConfig;
}

export function getRussianJammerRuntimeContext(profileId, distance = 0) {
  const record = getRussianUasEwFiresProfile(profileId);
  if (!record.ewConfig) throw new TypeError(`${record.id} is not an electronic-warfare profile`);
  if (!finiteInRange(distance, 0)) throw new TypeError('distance must be a non-negative finite number');
  const config = record.ewConfig;
  const normalizedDistance = Math.min(1, distance / config.emissionRange);
  const strength = distance > config.emissionRange
    ? 0
    : Math.max(config.minimumEffect, config.jammerStrength * (1 - normalizedDistance));
  return deepFreeze({
    jammerStrength: Number(strength.toFixed(3)),
    linkDisruption: Number((strength * config.linkDisruption).toFixed(3)),
    radarDegradation: Number((strength * config.radarDegradation).toFixed(3)),
    sourceRange: config.emissionRange,
    distance,
    emissionSignature: config.emissionSignature,
  });
}

export function getRussianArtilleryRuntimeConfig(profileId, shotDistance = 0) {
  const record = getRussianUasEwFiresProfile(profileId);
  if (!record.artilleryConfig) throw new TypeError(`${record.id} is not a UFR-037 artillery profile`);
  if (!finiteInRange(shotDistance, 0)) throw new TypeError('shotDistance must be a non-negative finite number');
  return deepFreeze({
    ...record.artilleryConfig,
    requiresSpotter: shotDistance >= record.spotting.requiredBeyondRange,
  });
}

export function getRussianAirDefenseRuntimeConfig(profileId) {
  const record = getRussianUasEwFiresProfile(profileId);
  if (!record.airDefenseConfig) throw new TypeError(`${record.id} is not a UFR-039 air-defense profile`);
  return record.airDefenseConfig;
}

export function composeRussianReconStrikeGroup(profileIds, unlockedNodeIds = []) {
  if (!Array.isArray(profileIds)) throw new TypeError('profileIds must be an array');
  if (!Array.isArray(unlockedNodeIds)) throw new TypeError('unlockedNodeIds must be an array');
  for (const duplicate of duplicateValues(profileIds)) throw new TypeError(`profileIds contains duplicate profile id: ${duplicate}`);
  const unlocked = new Set(unlockedNodeIds);
  const selected = [];
  const rejected = [];
  for (const id of profileIds) {
    const record = PROFILES_BY_ID.get(id);
    if (!record) {
      rejected.push({ id, reason: 'unknown-profile' });
      continue;
    }
    const missing = [...record.requires, ...record.variantRequires].filter((dependency) => !unlocked.has(dependency));
    if (missing.length) {
      rejected.push({ id, reason: 'missing-requirements', missing });
      continue;
    }
    selected.push(record);
  }
  const roles = [...new Set(selected.map((record) => record.roleId))].sort();
  const capabilities = [...new Set(selected.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const counters = [...new Set(selected.flatMap((record) => record.counters))].sort();
  const cost = selected.reduce((total, record) => ({
    metal: total.metal + record.cost.metal,
    fuel: total.fuel + record.cost.fuel,
    intel: total.intel + record.cost.intel,
  }), { metal: 0, fuel: 0, intel: 0 });
  const has = (roleId) => roles.includes(roleId);
  const droneRecords = selected.filter((record) => record.droneConfig);
  return deepFreeze({
    profileIds: selected.map((record) => record.id),
    rejected,
    roles,
    capabilities,
    counters,
    cost,
    totalCapacityCost: selected.reduce((total, record) => total + record.capacityCost, 0),
    totalDronePayload: droneRecords.reduce((total, record) => total + record.droneConfig.payload, 0),
    averageDroneLinkHardening: droneRecords.length
      ? Number((droneRecords.reduce((total, record) => total + record.droneConfig.linkHardening, 0) / droneRecords.length).toFixed(3))
      : 0,
    totalArtilleryAmmunition: selected.reduce((total, record) => total + (record.artilleryConfig?.ammo || 0), 0),
    totalAirDefenseAmmunition: selected.reduce((total, record) => total + (record.airDefenseConfig?.ammunition || 0), 0),
    doctrine: {
      reconnaissanceStrikeChain: has('broad-area-reconnaissance') && has('one-way-recon-strike'),
      preparedFirePlan: has('broad-area-reconnaissance') && has('persistent-spectrum-denial') && has('prepared-self-propelled-artillery'),
      saturationEchelon: has('prepared-self-propelled-artillery') && has('saturation-rocket-artillery'),
      layeredAirDefense: has('short-range-air-defense') && has('medium-range-air-defense'),
      protectedFiresComplex: has('persistent-spectrum-denial') && has('prepared-self-propelled-artillery') && has('short-range-air-defense') && has('medium-range-air-defense'),
      completeReconStrikeComplex: RUSSIAN_UAS_EW_FIRES_ROLE_IDS.every((roleId) => has(roleId)),
    },
    missingRoles: RUSSIAN_UAS_EW_FIRES_ROLE_IDS.filter((roleId) => !has(roleId)),
  });
}

const validationErrors = validateRussianUasEwFiresBranch();
if (validationErrors.length) throw new Error(`Invalid Russian UAS/EW/fires branch: ${validationErrors.join('; ')}`);
