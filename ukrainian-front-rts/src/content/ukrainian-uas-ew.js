import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import { AIR_TARGET_CLASSES } from '../combat/air-defense-system.js';
import {
  UKRAINIAN_UAS_EW_SCHEMA_VERSION,
  UKRAINIAN_UAS_EW_DOCTRINE,
  UAS_EW_CAPABILITIES,
  UKRAINIAN_UAS_EW_PROFILE_IDS,
  UAS_EW_LEGACY_PROFILE_ALIASES,
  UKRAINIAN_UAS_EW,
  deepFreezeUasEw,
} from './ukrainian-uas-ew-profiles.js';

export {
  UKRAINIAN_UAS_EW_SCHEMA_VERSION,
  UKRAINIAN_UAS_EW_DOCTRINE,
  UAS_EW_CAPABILITIES,
  UKRAINIAN_UAS_EW_PROFILE_IDS,
  UAS_EW_LEGACY_PROFILE_ALIASES,
  UKRAINIAN_UAS_EW,
} from './ukrainian-uas-ew-profiles.js';

const deepFreeze = deepFreezeUasEw;
const ROLE_IDS = new Set(UAS_EW_CAPABILITIES);
const PROFILE_IDS = new Set(UKRAINIAN_UAS_EW_PROFILE_IDS);
const ROSTER_NODE_IDS = new Set(['ua.recon-drone', 'ua.ew-team']);
const AIR_TARGET_CLASS_VALUES = new Set(Object.values(AIR_TARGET_CLASSES));
const UA_TECH_TREE = FACTION_TECH_TREES.factions.ukraine;
const TECH_NODES_BY_ID = new Map(UA_TECH_TREE.nodes.map((node) => [node.id, node]));
const PROFILES_BY_ID = new Map(UKRAINIAN_UAS_EW.profiles.map((record) => [record.id, record]));

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

function canonicalProfileId(profileId) {
  return UAS_EW_LEGACY_PROFILE_ALIASES[profileId] || profileId;
}

function validateDroneConfig(errors, path, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: air profiles require droneConfig`);
    return;
  }
  for (const field of ['launchTime', 'loiterDuration', 'returnTime', 'recoveryTime', 'linkRange', 'linkLossGrace', 'signatureDecay']) {
    if (!finiteInRange(config[field], field === 'loiterDuration' || field === 'linkRange' ? Number.EPSILON : 0)) errors.push(`${path}: droneConfig.${field} is invalid`);
  }
  if (!Number.isInteger(config.payload) || config.payload < 0) errors.push(`${path}: droneConfig.payload must be a non-negative integer`);
  for (const field of ['linkHardening', 'evasionBonus', 'signaturePerStrike', 'signatureInterceptionBonus']) {
    if (config[field] !== undefined && !finiteInRange(config[field], 0, 1)) errors.push(`${path}: droneConfig.${field} must be within [0, 1]`);
  }
  if (typeof config.autonomousReturn !== 'boolean') errors.push(`${path}: droneConfig.autonomousReturn must be boolean`);
  if (config.consumedOnStrike && config.payload < 1) errors.push(`${path}: consumed strike profiles require payload`);
}

function validateAirDefenseConfig(errors, path, config, priorities) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    errors.push(`${path}: counter-UAS profile requires airDefenseConfig`);
    return;
  }
  const positiveFields = ['detectionRange', 'opticalRange', 'maximumRange', 'maximumAltitude', 'reloadTime', 'missileSpeed', 'missileDamage', 'missileLife', 'seekerRange'];
  for (const field of positiveFields) if (!finiteInRange(config[field], Number.EPSILON)) errors.push(`${path}: airDefenseConfig.${field} must be positive`);
  for (const field of ['minimumRadarRange', 'minimumRange', 'minimumAltitude', 'impactRadius']) if (!finiteInRange(config[field], 0)) errors.push(`${path}: airDefenseConfig.${field} must be non-negative`);
  for (const field of ['jammerRangePenalty', 'radarHardening', 'hitChance', 'overkillThreshold']) if (!finiteInRange(config[field], 0, 1)) errors.push(`${path}: airDefenseConfig.${field} must be within [0, 1]`);
  for (const field of ['ammunition', 'maxInFlight', 'maxMissilesPerTarget']) if (!Number.isInteger(config[field]) || config[field] <= 0) errors.push(`${path}: airDefenseConfig.${field} must be a positive integer`);
  if (!(config.maximumRange > config.minimumRange)) errors.push(`${path}: air-defense maximumRange must exceed minimumRange`);
  if (!(config.maximumAltitude > config.minimumAltitude)) errors.push(`${path}: air-defense maximumAltitude must exceed minimumAltitude`);
  if (!Array.isArray(priorities) || priorities.length === 0 || priorities.some((value) => !AIR_TARGET_CLASS_VALUES.has(value))) errors.push(`${path}: airTargetPriority contains an unknown UFR-039 class`);
}

function validateEwEffect(errors, path, effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
    errors.push(`${path}: EW-support profiles require ewEffect`);
    return;
  }
  if (!finiteInRange(effect.radius, 0)) errors.push(`${path}: ewEffect.radius must be non-negative`);
  if (!finiteInRange(effect.relayBonus, 0)) errors.push(`${path}: ewEffect.relayBonus must be non-negative`);
  for (const field of ['jammerStrength', 'linkHardeningBonus', 'radarHardeningBonus']) if (!finiteInRange(effect[field], 0, 1)) errors.push(`${path}: ewEffect.${field} must be within [0, 1]`);
}

export function validateUkrainianUasEw(data = UKRAINIAN_UAS_EW) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return Object.freeze(['branch must be an object']);
  if (data.schemaVersion !== UKRAINIAN_UAS_EW_SCHEMA_VERSION) errors.push(`schemaVersion must be ${UKRAINIAN_UAS_EW_SCHEMA_VERSION}`);
  if (data.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (data.doctrine !== UKRAINIAN_UAS_EW_DOCTRINE) errors.push(`doctrine must be ${UKRAINIAN_UAS_EW_DOCTRINE}`);
  if (UA_TECH_TREE.doctrine !== data.doctrine) errors.push('branch doctrine must match UFR-070');
  if (!Array.isArray(data.profiles)) return Object.freeze([...errors, 'profiles must be an array']);

  for (const duplicate of duplicateValues(data.profiles.map((record) => record?.id))) errors.push(`duplicate profile id: ${duplicate}`);
  for (const duplicate of duplicateValues(data.profiles.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  const covered = new Set();
  for (const record of data.profiles) {
    const path = record?.id || '<missing-profile-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('profile records must be objects');
      continue;
    }
    if (record.schemaVersion !== UKRAINIAN_UAS_EW_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!PROFILE_IDS.has(record.id)) errors.push(`${path}: unexpected profile id`);
    if (!ROSTER_NODE_IDS.has(record.rosterNodeId)) errors.push(`${path}: invalid rosterNodeId`);
    if (!(record.id === record.rosterNodeId || record.id.startsWith(`${record.rosterNodeId}.`))) errors.push(`${path}: profile id must remain under its roster node namespace`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId`);
    covered.add(record.roleId);
    if (record.faction !== 'ukraine' || record.doctrine !== UKRAINIAN_UAS_EW_DOCTRINE || record.family !== 'uas-ew') errors.push(`${path}: ownership mismatch`);
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
    if (!['air', 'ground'].includes(record.domain)) errors.push(`${path}: invalid domain`);
    if (typeof record.mobility !== 'string' || !record.mobility) errors.push(`${path}: mobility is required`);
    if (!finiteInRange(record.signature, 0, 1)) errors.push(`${path}: signature must be within [0, 1]`);

    if (record.domain === 'air') validateDroneConfig(errors, path, record.droneConfig);
    else if (record.droneConfig !== null) errors.push(`${path}: ground profile cannot define droneConfig`);
    if (record.roleId === 'counter-uas') validateAirDefenseConfig(errors, path, record.airDefenseConfig, record.airTargetPriority);
    else if (record.airDefenseConfig !== null || record.airTargetPriority !== null) errors.push(`${path}: only counter-UAS profile may define air-defense runtime data`);
    if (record.ewEffect !== null) validateEwEffect(errors, path, record.ewEffect);
    if (['relay', 'jamming', 'counter-uas', 'targeting-support'].includes(record.roleId) && record.ewEffect === null) errors.push(`${path}: role requires ewEffect`);

    if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) errors.push(`${path}: capabilities must be non-empty`);
    const capabilityIds = (record.capabilities || []).map((entry) => entry?.id);
    for (const duplicate of duplicateValues(capabilityIds)) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!capabilityIds.includes(record.roleId)) errors.push(`${path}: capabilities must include the primary role`);
    if (capabilityIds.some((id) => !ROLE_IDS.has(id))) errors.push(`${path}: capabilities contain an unknown role`);
    if (!Array.isArray(record.counters) || record.counters.length === 0) errors.push(`${path}: counters must be non-empty`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length < 2) errors.push(`${path}: vulnerabilities need at least two entries`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.length === 0) errors.push(`${path}: supportLinks must be non-empty`);
    for (const linkedId of record.supportLinks || []) if (!PROFILE_IDS.has(linkedId) && !TECH_NODES_BY_ID.has(linkedId)) errors.push(`${path}: unknown support link ${linkedId}`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 50) errors.push(`${path}: playerUse must contain actionable guidance`);
  }

  for (const id of UKRAINIAN_UAS_EW_PROFILE_IDS) if (!data.profiles.some((record) => record.id === id)) errors.push(`missing required profile: ${id}`);
  for (const roleId of UAS_EW_CAPABILITIES) if (!covered.has(roleId)) errors.push(`missing capability ${roleId}`);
  for (const rosterNodeId of ROSTER_NODE_IDS) if (!data.profiles.some((record) => record.rosterNodeId === rosterNodeId)) errors.push(`missing UFR-070 roster coverage: ${rosterNodeId}`);
  return Object.freeze([...new Set(errors)].sort());
}

export function getUkrainianUasEwProfile(profileId) {
  const canonicalId = canonicalProfileId(profileId);
  const record = PROFILES_BY_ID.get(canonicalId);
  if (!record) throw new RangeError(`Unknown Ukrainian UAS/EW profile: ${profileId}`);
  return record;
}

export function availableUkrainianUasEwProfiles(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(UKRAINIAN_UAS_EW.profiles
    .filter((record) => [...record.requires, ...record.variantRequires].every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function getUkrainianDroneRuntimeConfig(profileId) {
  const record = getUkrainianUasEwProfile(profileId);
  if (!record.droneConfig) throw new TypeError(`${record.id} is not an airborne UFR-038 profile`);
  return record.droneConfig;
}

export function getUkrainianAirDefenseRuntimeConfig(profileId) {
  const record = getUkrainianUasEwProfile(profileId);
  if (!record.airDefenseConfig) throw new TypeError(`${record.id} is not a UFR-039 counter-UAS profile`);
  return record.airDefenseConfig;
}

export function getUkrainianEwEffect(profileId) {
  const record = getUkrainianUasEwProfile(profileId);
  if (!record.ewEffect) throw new TypeError(`${record.id} does not provide an EW telemetry effect`);
  return record.ewEffect;
}

export function resolveUasEwTaskGroup(profileIds, unlockedNodeIds = []) {
  if (!Array.isArray(profileIds)) throw new TypeError('profileIds must be an array');
  if (!Array.isArray(unlockedNodeIds)) throw new TypeError('unlockedNodeIds must be an array');
  const canonicalIds = profileIds.map(canonicalProfileId);
  for (const duplicate of duplicateValues(canonicalIds)) throw new TypeError(`profileIds contains duplicate profile id: ${duplicate}`);
  const unlocked = new Set(unlockedNodeIds);
  const selected = [];
  const rejected = [];
  for (const id of canonicalIds) {
    const record = PROFILES_BY_ID.get(id);
    if (!record) {
      rejected.push({ id, reason: 'unknown-profile' });
      continue;
    }
    const missing = [...record.requires, ...record.variantRequires].filter((requirement) => !unlocked.has(requirement));
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
      reconnaissanceStrikeChain: has('reconnaissance') && has('fpv-strike') && has('targeting-support'),
      resilientRelay: has('relay') && has('jamming'),
      layeredCounterUas: has('jamming') && has('counter-uas'),
      completeNetwork: UAS_EW_CAPABILITIES.every((roleId) => has(roleId)),
    },
    missingCapabilities: UAS_EW_CAPABILITIES.filter((roleId) => !has(roleId)),
  });
}

const validationErrors = validateUkrainianUasEw();
if (validationErrors.length) throw new Error(`Invalid Ukrainian UAS/EW branch: ${validationErrors.join('; ')}`);
