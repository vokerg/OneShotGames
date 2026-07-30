import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import { AIR_TARGET_CLASSES } from '../combat/air-defense-system.js';
import { DAMAGE_CLASSES, TARGET_DOMAINS, SPLASH_CLASSES } from '../combat/combat-schema.js';
import {
  UKRAINIAN_FIRES_SCHEMA_VERSION,
  UKRAINIAN_FIRES_DOCTRINE,
  UKRAINIAN_FIRES_ROLE_IDS,
  UKRAINIAN_FIRES_PROFILE_IDS,
  UKRAINIAN_FIRES_BRANCH,
  UKRAINIAN_FIRES_PROFILES,
  deepFreezeFires,
} from './ukrainian-fires-profiles.js';

export {
  UKRAINIAN_FIRES_SCHEMA_VERSION,
  UKRAINIAN_FIRES_DOCTRINE,
  UKRAINIAN_FIRES_ROLE_IDS,
  UKRAINIAN_FIRES_PROFILE_IDS,
  UKRAINIAN_FIRES_BRANCH,
  UKRAINIAN_FIRES_PROFILES,
} from './ukrainian-fires-profiles.js';

const deepFreeze = deepFreezeFires;
const ROLE_IDS = new Set(UKRAINIAN_FIRES_ROLE_IDS);
const PROFILE_IDS = new Set(UKRAINIAN_FIRES_PROFILE_IDS);
const ROSTER_NODE_IDS = new Set(['ua.self-propelled-artillery', 'ua.mobile-sam']);
const AIR_TARGET_CLASS_VALUES = new Set(Object.values(AIR_TARGET_CLASSES));
const DAMAGE_CLASS_VALUES = new Set(Object.values(DAMAGE_CLASSES));
const TARGET_DOMAIN_VALUES = new Set(Object.values(TARGET_DOMAINS));
const SPLASH_CLASS_VALUES = new Set(Object.values(SPLASH_CLASSES));
const UA_TECH_TREE = FACTION_TECH_TREES.factions.ukraine;
const TECH_NODES_BY_ID = new Map(UA_TECH_TREE.nodes.map((node) => [node.id, node]));
const PROFILES_BY_ID = new Map(UKRAINIAN_FIRES_BRANCH.profiles.map((record) => [record.id, record]));

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

function validateArtillery(errors, path, record) {
  const config = record.artilleryConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: indirect-fire profile requires artilleryConfig`);
    return;
  }
  for (const field of ['ammo', 'salvoSize']) if (!Number.isInteger(config[field]) || config[field] <= 0) errors.push(`${path}: artilleryConfig.${field} must be a positive integer`);
  if (config.salvoSize > config.ammo) errors.push(`${path}: artillery salvoSize cannot exceed ammo`);
  for (const field of ['setupTime', 'packTime', 'minimumRange', 'shotCadence', 'signatureDecay', 'scatterRadius']) if (!finiteInRange(config[field], 0)) errors.push(`${path}: artilleryConfig.${field} must be non-negative`);
  if (!finiteInRange(config.signaturePerShot, 0, 1)) errors.push(`${path}: artilleryConfig.signaturePerShot must be within [0, 1]`);
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
  if (!Array.isArray(record.airTargetPriority) || record.airTargetPriority.length === 0 || record.airTargetPriority.some((value) => !AIR_TARGET_CLASS_VALUES.has(value))) errors.push(`${path}: airTargetPriority contains an unknown UFR-039 class`);
}

export function validateUkrainianFiresBranch(branch = UKRAINIAN_FIRES_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== UKRAINIAN_FIRES_SCHEMA_VERSION) errors.push(`schemaVersion must be ${UKRAINIAN_FIRES_SCHEMA_VERSION}`);
  if (branch.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (branch.doctrine !== UKRAINIAN_FIRES_DOCTRINE) errors.push(`doctrine must be ${UKRAINIAN_FIRES_DOCTRINE}`);
  if (UA_TECH_TREE.doctrine !== branch.doctrine) errors.push('branch doctrine must match UFR-070');
  if (!Array.isArray(branch.profiles)) return Object.freeze([...errors, 'profiles must be an array']);

  for (const duplicate of duplicateValues(branch.profiles.map((record) => record?.id))) errors.push(`duplicate profile id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.profiles.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.profiles) {
    const path = record?.id || '<missing-profile-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('profile records must be objects');
      continue;
    }
    if (record.schemaVersion !== UKRAINIAN_FIRES_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!PROFILE_IDS.has(record.id)) errors.push(`${path}: unexpected profile id`);
    if (!ROSTER_NODE_IDS.has(record.rosterNodeId)) errors.push(`${path}: invalid rosterNodeId`);
    if (!(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`))) errors.push(`${path}: profile id must remain under its roster node namespace`);
    if (record.id === 'ua.mobile-sam') errors.push(`${path}: exact ua.mobile-sam identity belongs to UFR-071; UFR-074 must use layered variants`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId`);
    if (record.faction !== 'ukraine' || record.doctrine !== UKRAINIAN_FIRES_DOCTRINE) errors.push(`${path}: ownership mismatch`);
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

    if (record.family === 'indirect-fire') {
      if (!record.weapon || !DAMAGE_CLASS_VALUES.has(record.weapon.damageClass)) errors.push(`${path}: invalid weapon damageClass`);
      if (!Array.isArray(record.weapon?.targetDomains) || record.weapon.targetDomains.some((domain) => !TARGET_DOMAIN_VALUES.has(domain))) errors.push(`${path}: invalid weapon targetDomains`);
      if (!SPLASH_CLASS_VALUES.has(record.weapon?.splashClass)) errors.push(`${path}: invalid weapon splashClass`);
      if (!finiteInRange(record.weapon?.minimumRange, 0) || !finiteInRange(record.weapon?.maximumRange, 0) || !(record.weapon.maximumRange > record.weapon.minimumRange)) errors.push(`${path}: invalid weapon range envelope`);
      if (!finiteInRange(record.weapon?.damage, Number.EPSILON)) errors.push(`${path}: weapon damage must be positive`);
      validateArtillery(errors, path, record);
      if (record.airDefenseConfig !== null || record.airTargetPriority !== null) errors.push(`${path}: indirect-fire profile cannot define air-defense runtime data`);
    } else if (record.family === 'air-defense') {
      validateAirDefense(errors, path, record);
      if (record.weapon !== null || record.artilleryConfig !== null || record.spotting !== null) errors.push(`${path}: air-defense profile cannot define artillery runtime data`);
    } else errors.push(`${path}: invalid family`);

    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities need at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0) errors.push(`${path}: counters must be non-empty`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length < 2) errors.push(`${path}: vulnerabilities need at least two entries`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.length === 0) errors.push(`${path}: supportLinks must be non-empty`);
    for (const linkedId of record.supportLinks || []) if (!PROFILE_IDS.has(linkedId) && !TECH_NODES_BY_ID.has(linkedId)) errors.push(`${path}: unknown support link ${linkedId}`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 50) errors.push(`${path}: playerUse must contain actionable guidance`);
  }

  for (const id of UKRAINIAN_FIRES_PROFILE_IDS) if (!branch.profiles.some((record) => record.id === id)) errors.push(`missing required profile: ${id}`);
  for (const roleId of UKRAINIAN_FIRES_ROLE_IDS) if (!branch.profiles.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  for (const rosterNodeId of ROSTER_NODE_IDS) if (!branch.profiles.some((record) => record.rosterNodeId === rosterNodeId)) errors.push(`missing UFR-070 roster coverage: ${rosterNodeId}`);
  if (branch.profiles.filter((record) => record.rosterNodeId === 'ua.self-propelled-artillery').length !== 3) errors.push('fires roster node must expose mortar, gun, and rocket variants');
  if (branch.profiles.filter((record) => record.rosterNodeId === 'ua.mobile-sam').length !== 2) errors.push('air-defense roster node must expose point and medium-range variants');
  return Object.freeze([...new Set(errors)].sort());
}

export function validateUkrainianFiresProfiles(profiles = UKRAINIAN_FIRES_PROFILES) {
  return validateUkrainianFiresBranch({
    schemaVersion: UKRAINIAN_FIRES_SCHEMA_VERSION,
    faction: 'ukraine',
    doctrine: UKRAINIAN_FIRES_DOCTRINE,
    profiles,
  });
}

export function getUkrainianFiresProfile(profileId) {
  const record = PROFILES_BY_ID.get(profileId);
  if (!record) throw new RangeError(`Unknown Ukrainian fires profile: ${profileId}`);
  return record;
}

export function availableUkrainianFiresProfiles(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(UKRAINIAN_FIRES_BRANCH.profiles
    .filter((record) => [...record.requires, ...record.variantRequires].every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function getArtilleryRuntimeConfig(profileId, shotDistance = 0) {
  const record = getUkrainianFiresProfile(profileId);
  if (!record.artilleryConfig) throw new TypeError(`${record.id} is not a UFR-037 artillery profile`);
  if (!Number.isFinite(shotDistance) || shotDistance < 0) throw new TypeError('shotDistance must be a non-negative finite number');
  return deepFreeze({
    ...record.artilleryConfig,
    requiresSpotter: shotDistance >= record.spotting.requiredBeyondRange,
  });
}

export function getAirDefenseRuntimeConfig(profileId) {
  const record = getUkrainianFiresProfile(profileId);
  if (!record.airDefenseConfig) throw new TypeError(`${record.id} is not a UFR-039 air-defense profile`);
  return record.airDefenseConfig;
}

export function composeUkrainianFiresGroup(profileIds, unlockedNodeIds = []) {
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
  return deepFreeze({
    profileIds: selected.map((record) => record.id),
    rejected,
    roles,
    capabilities,
    counters,
    cost,
    totalCapacityCost: selected.reduce((total, record) => total + record.capacityCost, 0),
    doctrine: {
      responsiveFires: has('mortar') && has('self-propelled-artillery'),
      deepFires: has('rocket-artillery'),
      layeredAirDefense: has('point-air-defense') && has('medium-air-defense'),
      completeFiresNetwork: has('mortar') && has('self-propelled-artillery') && has('rocket-artillery') && has('point-air-defense') && has('medium-air-defense'),
    },
    missingRoles: UKRAINIAN_FIRES_ROLE_IDS.filter((roleId) => !has(roleId)),
  });
}

const validationErrors = validateUkrainianFiresBranch();
if (validationErrors.length) throw new Error(`Invalid Ukrainian fires branch: ${validationErrors.join('; ')}`);
