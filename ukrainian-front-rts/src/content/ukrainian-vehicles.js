import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import {
  ARMOR_CLASSES,
  DAMAGE_CLASSES,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
} from '../combat/combat-schema.js';

export const UKRAINIAN_VEHICLE_SCHEMA_VERSION = 1;
export const UKRAINIAN_VEHICLE_DOCTRINE = 'networked-maneuver';

export const UKRAINIAN_VEHICLE_ROLE_IDS = Object.freeze([
  'protected-transport',
  'infantry-fighting-vehicle',
  'main-battle-tank',
  'armored-recovery',
  'combat-engineering-vehicle',
]);

export const UKRAINIAN_VEHICLE_IDS = Object.freeze([
  'ua.protected-mobility.apc',
  'ua.protected-mobility.ifv',
  'ua.tank.main-battle',
  'ua.recovery-vehicle.armored-recovery',
  'ua.breaching-section.engineering-vehicle',
]);

export const UKRAINIAN_VEHICLE_ROSTER_NODE_IDS = Object.freeze([
  'ua.protected-mobility',
  'ua.tank',
  'ua.recovery-vehicle',
  'ua.breaching-section',
]);

export const UKRAINIAN_VEHICLE_COUNTER_DOMAINS = Object.freeze([
  'infantry',
  'light-vehicles',
  'armor',
  'fortifications',
  'fires',
  'drones',
  'mines-obstacles',
  'mobility',
  'logistics',
]);

const ROLE_IDS = new Set(UKRAINIAN_VEHICLE_ROLE_IDS);
const VEHICLE_IDS = new Set(UKRAINIAN_VEHICLE_IDS);
const ROSTER_NODE_IDS = new Set(UKRAINIAN_VEHICLE_ROSTER_NODE_IDS);
const COUNTER_DOMAINS = new Set(UKRAINIAN_VEHICLE_COUNTER_DOMAINS);
const DAMAGE_CLASS_VALUES = new Set(Object.values(DAMAGE_CLASSES));
const ARMOR_CLASS_VALUES = new Set(Object.values(ARMOR_CLASSES));
const RESISTANCE_CLASS_VALUES = new Set(Object.values(RESISTANCE_CLASSES));
const SPLASH_CLASS_VALUES = new Set(Object.values(SPLASH_CLASSES));
const TARGET_DOMAIN_VALUES = new Set(Object.values(TARGET_DOMAINS));
const SIGNATURES = new Set(['low', 'normal', 'high', 'very-high']);
const STANCES = new Set(['transport', 'screening', 'overwatch', 'breakthrough', 'recovery', 'breaching']);
const BLOCKED_EXIT_POLICIES = new Set(['retain-cargo']);
const TRANSPORT_DESTRUCTION_POLICIES = new Set(['catastrophic-loss']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const weapon = ({
  id,
  damageClass,
  targetDomains,
  splashClass = SPLASH_CLASSES.NONE,
  range,
  damage,
  reload,
  minimumRange = 0,
  ammo = null,
}) => ({
  id,
  damageClass,
  targetDomains,
  splashClass,
  range,
  damage,
  reload,
  minimumRange,
  ammo,
});

const capability = (id, parameters = {}) => ({ id, parameters });

const vehicle = ({
  id,
  rosterNodeId,
  roleId,
  displayName,
  shortName,
  tier,
  producer,
  requires,
  crew,
  capacityCost,
  cost,
  defense,
  mobility,
  transport,
  repair,
  sight,
  signature,
  preferredStance,
  weapons,
  capabilities,
  counters,
  vulnerabilities,
  supportLinks,
  playerUse,
}) => ({
  schemaVersion: UKRAINIAN_VEHICLE_SCHEMA_VERSION,
  faction: 'ukraine',
  doctrine: UKRAINIAN_VEHICLE_DOCTRINE,
  id,
  rosterNodeId,
  roleId,
  displayName,
  shortName,
  tier,
  producer,
  requires,
  crew,
  capacityCost,
  cost,
  defense,
  mobility,
  transport,
  repair,
  sight,
  signature,
  preferredStance,
  weapons,
  capabilities,
  counters,
  vulnerabilities,
  supportLinks,
  playerUse,
});

const VEHICLES = [
  vehicle({
    id: 'ua.protected-mobility.apc',
    rosterNodeId: 'ua.protected-mobility',
    roleId: 'protected-transport',
    displayName: 'Ukrainian Protected Mobility Carrier',
    shortName: 'Protected Carrier',
    tier: 1,
    producer: 'ua.motor-pool',
    requires: ['ua.motor-pool'],
    crew: 3,
    capacityCost: 3,
    cost: { metal: 135, fuel: 70, intel: 0 },
    defense: { hitPoints: 285, armorClass: ARMOR_CLASSES.LIGHT, resistanceClass: RESISTANCE_CLASSES.VEHICLE, disabledThreshold: 0.22 },
    mobility: { speed: 86, acceleration: 32, turnRate: 105, footprintRadius: 15, reverseSpeedMultiplier: 0.62 },
    transport: { capacity: 8, passengerDomains: ['infantry'], embarkSeconds: 2.4, disembarkSeconds: 2, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    repair: { repairable: true, fieldRepairCap: 0.65, recoveryEligible: true },
    sight: 230,
    signature: 'normal',
    preferredStance: 'transport',
    weapons: [weapon({ id: 'remote-heavy-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, targetDomains: [TARGET_DOMAINS.GROUND], range: 185, damage: 16, reload: 0.7 })],
    capabilities: [
      capability('protected-lift', { seats: 8, rapidDismount: true }),
      capability('road-march', { roadSpeedMultiplier: 1.18, mudSpeedMultiplier: 0.78 }),
      capability('smoke-screen', { charges: 2, durationSeconds: 7 }),
    ],
    counters: ['mobility', 'logistics'],
    vulnerabilities: ['armor', 'mines-obstacles'],
    supportLinks: ['ua.protected-mobility.ifv', 'ua.recovery-vehicle.armored-recovery'],
    playerUse: 'Move full infantry squads between dispersed positions, preserve them from small-arms fire, and disengage before anti-armor weapons fix the carrier in place.',
  }),
  vehicle({
    id: 'ua.protected-mobility.ifv',
    rosterNodeId: 'ua.protected-mobility',
    roleId: 'infantry-fighting-vehicle',
    displayName: 'Ukrainian Infantry Fighting Vehicle',
    shortName: 'Infantry Fighting Vehicle',
    tier: 1,
    producer: 'ua.motor-pool',
    requires: ['ua.motor-pool'],
    crew: 3,
    capacityCost: 4,
    cost: { metal: 175, fuel: 95, intel: 15 },
    defense: { hitPoints: 340, armorClass: ARMOR_CLASSES.MEDIUM, resistanceClass: RESISTANCE_CLASSES.VEHICLE, disabledThreshold: 0.24 },
    mobility: { speed: 72, acceleration: 25, turnRate: 82, footprintRadius: 17, reverseSpeedMultiplier: 0.55 },
    transport: { capacity: 6, passengerDomains: ['infantry'], embarkSeconds: 2.8, disembarkSeconds: 2.2, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    repair: { repairable: true, fieldRepairCap: 0.65, recoveryEligible: true },
    sight: 255,
    signature: 'high',
    preferredStance: 'screening',
    weapons: [
      weapon({ id: 'stabilized-autocannon', damageClass: DAMAGE_CLASSES.AUTOCANNON, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], splashClass: SPLASH_CLASSES.SMALL, range: 235, damage: 28, reload: 1.65, ammo: 36 }),
      weapon({ id: 'coaxial-machine-gun', damageClass: DAMAGE_CLASSES.SMALL_ARMS, targetDomains: [TARGET_DOMAINS.GROUND], range: 155, damage: 8, reload: 0.55 }),
    ],
    capabilities: [
      capability('fighting-dismounts', { suppressionRadius: 55, dismountCoverSeconds: 4 }),
      capability('hunter-killer-optics', { stationarySightBonus: 45, targetHandoff: true }),
      capability('active-smoke', { charges: 2, incomingAccuracyMultiplier: 0.72 }),
    ],
    counters: ['infantry', 'light-vehicles'],
    vulnerabilities: ['armor', 'fires'],
    supportLinks: ['ua.protected-mobility.apc', 'ua.tank.main-battle', 'ua.recovery-vehicle.armored-recovery'],
    playerUse: 'Escort dismounted infantry, suppress light threats, and hand armored contacts to tanks or anti-armor teams instead of trading frontally with heavy armor.',
  }),
  vehicle({
    id: 'ua.tank.main-battle',
    rosterNodeId: 'ua.tank',
    roleId: 'main-battle-tank',
    displayName: 'Ukrainian Main Battle Tank',
    shortName: 'Main Battle Tank',
    tier: 2,
    producer: 'ua.motor-pool',
    requires: ['ua.motor-pool'],
    crew: 3,
    capacityCost: 6,
    cost: { metal: 260, fuel: 145, intel: 30 },
    defense: { hitPoints: 520, armorClass: ARMOR_CLASSES.HEAVY, resistanceClass: RESISTANCE_CLASSES.VEHICLE, disabledThreshold: 0.28 },
    mobility: { speed: 59, acceleration: 18, turnRate: 58, footprintRadius: 20, reverseSpeedMultiplier: 0.48 },
    transport: null,
    repair: { repairable: true, fieldRepairCap: 0.55, recoveryEligible: true },
    sight: 275,
    signature: 'very-high',
    preferredStance: 'breakthrough',
    weapons: [
      weapon({ id: 'tank-kinetic-round', damageClass: DAMAGE_CLASSES.KINETIC, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 290, damage: 92, reload: 6.8, ammo: 12 }),
      weapon({ id: 'tank-high-explosive-round', damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], splashClass: SPLASH_CLASSES.MEDIUM, range: 275, damage: 66, reload: 7.4, ammo: 8 }),
      weapon({ id: 'coaxial-machine-gun', damageClass: DAMAGE_CLASSES.SMALL_ARMS, targetDomains: [TARGET_DOMAINS.GROUND], range: 145, damage: 7, reload: 0.5 }),
    ],
    capabilities: [
      capability('fire-control-network', { contactQualityDamageFloor: 0.65, observerRangeBonus: 35 }),
      capability('hull-down', { incomingKineticMultiplier: 0.78, requiresPreparedPosition: true }),
      capability('reverse-disengagement', { smokeOnCritical: true, reverseAccuracyMultiplier: 0.82 }),
    ],
    counters: ['armor', 'fortifications'],
    vulnerabilities: ['drones', 'mines-obstacles', 'fires'],
    supportLinks: ['ua.protected-mobility.ifv', 'ua.recovery-vehicle.armored-recovery', 'ua.breaching-section.engineering-vehicle'],
    playerUse: 'Concentrate premium direct fire against armored or fortified positions, use shared contacts to avoid blind advances, and withdraw damaged tanks into recovery coverage.',
  }),
  vehicle({
    id: 'ua.recovery-vehicle.armored-recovery',
    rosterNodeId: 'ua.recovery-vehicle',
    roleId: 'armored-recovery',
    displayName: 'Ukrainian Armored Recovery Vehicle',
    shortName: 'Armored Recovery Vehicle',
    tier: 2,
    producer: 'ua.motor-pool',
    requires: ['ua.motor-pool', 'ua.mobile-recovery'],
    crew: 4,
    capacityCost: 4,
    cost: { metal: 190, fuel: 105, intel: 25 },
    defense: { hitPoints: 390, armorClass: ARMOR_CLASSES.MEDIUM, resistanceClass: RESISTANCE_CLASSES.VEHICLE, disabledThreshold: 0.25 },
    mobility: { speed: 54, acceleration: 16, turnRate: 52, footprintRadius: 19, reverseSpeedMultiplier: 0.46 },
    transport: null,
    repair: { repairable: true, fieldRepairCap: 0.75, recoveryEligible: true },
    sight: 210,
    signature: 'high',
    preferredStance: 'recovery',
    weapons: [weapon({ id: 'defensive-heavy-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, targetDomains: [TARGET_DOMAINS.GROUND], range: 145, damage: 11, reload: 0.8 })],
    capabilities: [
      capability('armored-recovery', { disabledTargets: true, towSpeedMultiplier: 0.5 }),
      capability('field-repair-support', { repairRateMultiplier: 1.35, maximumContributors: 2, resourceCostMultiplier: 1 }),
      capability('vehicle-extraction', { underFirePenalty: 1.4, stabilizesBurning: true }),
    ],
    counters: ['logistics'],
    vulnerabilities: ['armor', 'fires'],
    supportLinks: ['ua.protected-mobility.apc', 'ua.protected-mobility.ifv', 'ua.tank.main-battle', 'ua.breaching-section.engineering-vehicle'],
    playerUse: 'Recover disabled premium vehicles, extend bounded field repairs, and shorten replacement cycles while remaining behind the direct-fire line.',
  }),
  vehicle({
    id: 'ua.breaching-section.engineering-vehicle',
    rosterNodeId: 'ua.breaching-section',
    roleId: 'combat-engineering-vehicle',
    displayName: 'Ukrainian Combat Engineering Vehicle',
    shortName: 'Engineering Vehicle',
    tier: 2,
    producer: 'ua.engineer-park',
    requires: ['ua.engineer-park'],
    crew: 4,
    capacityCost: 5,
    cost: { metal: 220, fuel: 120, intel: 35 },
    defense: { hitPoints: 430, armorClass: ARMOR_CLASSES.HEAVY, resistanceClass: RESISTANCE_CLASSES.VEHICLE, disabledThreshold: 0.26 },
    mobility: { speed: 43, acceleration: 13, turnRate: 44, footprintRadius: 21, reverseSpeedMultiplier: 0.42 },
    transport: null,
    repair: { repairable: true, fieldRepairCap: 0.6, recoveryEligible: true },
    sight: 205,
    signature: 'very-high',
    preferredStance: 'breaching',
    weapons: [
      weapon({ id: 'demolition-charge-projector', damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], splashClass: SPLASH_CLASSES.LARGE, range: 95, damage: 105, reload: 14, minimumRange: 25, ammo: 3 }),
      weapon({ id: 'defensive-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, targetDomains: [TARGET_DOMAINS.GROUND], range: 135, damage: 10, reload: 0.85 }),
    ],
    capabilities: [
      capability('mine-plow', { laneWidth: 28, clearanceRate: 1.2 }),
      capability('obstacle-breach', { barriers: true, fortifications: true, bridgePreparation: true }),
      capability('assault-lane-marking', { durationSeconds: 30, alliedPathCostMultiplier: 0.65 }),
    ],
    counters: ['mines-obstacles', 'fortifications'],
    vulnerabilities: ['armor', 'drones'],
    supportLinks: ['ua.tank.main-battle', 'ua.recovery-vehicle.armored-recovery'],
    playerUse: 'Open marked lanes through mines and obstacles under armored protection, then hand the route to tanks and protected mobility rather than fighting as a general-purpose assault tank.',
  }),
];

export const UKRAINIAN_VEHICLE_BRANCH = deepFreeze({
  schemaVersion: UKRAINIAN_VEHICLE_SCHEMA_VERSION,
  faction: 'ukraine',
  doctrine: UKRAINIAN_VEHICLE_DOCTRINE,
  vehicles: VEHICLES,
});

const TECH_TREE_UA = FACTION_TECH_TREES.factions.ukraine;
const TECH_NODES_BY_ID = new Map(TECH_TREE_UA.nodes.map((node) => [node.id, node]));
const VEHICLES_BY_ID = new Map(UKRAINIAN_VEHICLE_BRANCH.vehicles.map((record) => [record.id, record]));

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function validateWeapon(errors, path, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    errors.push(`${path}: weapon records must be objects`);
    return;
  }
  if (typeof profile.id !== 'string' || !profile.id) errors.push(`${path}: weapon id is required`);
  if (!DAMAGE_CLASS_VALUES.has(profile.damageClass)) errors.push(`${path}: unknown weapon damageClass ${profile.damageClass}`);
  if (!Array.isArray(profile.targetDomains) || !profile.targetDomains.length || profile.targetDomains.some((domain) => !TARGET_DOMAIN_VALUES.has(domain))) errors.push(`${path}: weapon targetDomains are invalid`);
  if (!SPLASH_CLASS_VALUES.has(profile.splashClass)) errors.push(`${path}: weapon splashClass is invalid`);
  for (const field of ['range', 'damage', 'reload', 'minimumRange']) if (!isNonNegativeFinite(profile[field])) errors.push(`${path}: weapon ${profile.id} ${field} must be non-negative and finite`);
  if (!(profile.reload > 0)) errors.push(`${path}: weapon ${profile.id} reload must be positive`);
  if (profile.minimumRange > profile.range) errors.push(`${path}: weapon ${profile.id} minimumRange exceeds range`);
  if (profile.ammo !== null && (!Number.isInteger(profile.ammo) || profile.ammo <= 0)) errors.push(`${path}: weapon ${profile.id} ammo must be null or a positive integer`);
}

export function validateUkrainianVehicleBranch(branch = UKRAINIAN_VEHICLE_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== UKRAINIAN_VEHICLE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${UKRAINIAN_VEHICLE_SCHEMA_VERSION}`);
  if (branch.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (branch.doctrine !== UKRAINIAN_VEHICLE_DOCTRINE) errors.push(`doctrine must be ${UKRAINIAN_VEHICLE_DOCTRINE}`);
  if (TECH_TREE_UA.doctrine !== branch.doctrine) errors.push('branch doctrine must match the UFR-070 Ukrainian doctrine');
  if (!Array.isArray(branch.vehicles)) return Object.freeze([...errors, 'vehicles must be an array']);

  for (const duplicate of duplicateValues(branch.vehicles.map((record) => record?.id))) errors.push(`duplicate vehicle id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.vehicles.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.vehicles) {
    const path = record?.id || '<missing-vehicle-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('vehicle records must be objects');
      continue;
    }
    if (record.schemaVersion !== UKRAINIAN_VEHICLE_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!VEHICLE_IDS.has(record.id)) errors.push(`${path}: unexpected vehicle id`);
    if (!ROSTER_NODE_IDS.has(record.rosterNodeId)) errors.push(`${path}: invalid rosterNodeId ${record.rosterNodeId}`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId ${record.roleId}`);
    if (record.faction !== 'ukraine' || record.doctrine !== UKRAINIAN_VEHICLE_DOCTRINE) errors.push(`${path}: faction/doctrine mismatch`);
    if (typeof record.displayName !== 'string' || !record.displayName.trim()) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);
    if (!Number.isInteger(record.tier) || record.tier < 0 || record.tier > 3) errors.push(`${path}: tier must be an integer from 0 to 3`);
    if (!Number.isInteger(record.crew) || record.crew <= 0) errors.push(`${path}: crew must be a positive integer`);
    if (!Number.isInteger(record.capacityCost) || record.capacityCost <= 0) errors.push(`${path}: capacityCost must be a positive integer`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!isNonNegativeFinite(record.cost?.[resource])) errors.push(`${path}: cost.${resource} must be non-negative and finite`);

    const techNode = TECH_NODES_BY_ID.get(record.rosterNodeId);
    if (techNode?.kind !== 'roster') errors.push(`${path}: missing UFR-070 roster node`);
    else {
      if (techNode.tier !== record.tier) errors.push(`${path}: tier must match UFR-070`);
      if (techNode.producer !== record.producer) errors.push(`${path}: producer must match UFR-070`);
      if (JSON.stringify(techNode.requires) !== JSON.stringify(record.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (TECH_NODES_BY_ID.get(record.producer)?.kind !== 'structure') errors.push(`${path}: producer must reference a UFR-070 structure`);
    if (!Array.isArray(record.requires) || record.requires.some((id) => !TECH_NODES_BY_ID.has(id))) errors.push(`${path}: requires contains an unknown UFR-070 node`);

    if (!isNonNegativeFinite(record.defense?.hitPoints) || record.defense.hitPoints <= 0) errors.push(`${path}: defense.hitPoints must be positive`);
    if (!ARMOR_CLASS_VALUES.has(record.defense?.armorClass)) errors.push(`${path}: invalid armorClass`);
    if (!RESISTANCE_CLASS_VALUES.has(record.defense?.resistanceClass)) errors.push(`${path}: invalid resistanceClass`);
    if (!Number.isFinite(record.defense?.disabledThreshold) || record.defense.disabledThreshold <= 0 || record.defense.disabledThreshold >= 1) errors.push(`${path}: disabledThreshold must be between 0 and 1`);
    for (const field of ['speed', 'acceleration', 'turnRate', 'footprintRadius', 'reverseSpeedMultiplier']) if (!isNonNegativeFinite(record.mobility?.[field]) || record.mobility[field] <= 0) errors.push(`${path}: mobility.${field} must be positive`);
    if (record.mobility?.reverseSpeedMultiplier > 1) errors.push(`${path}: reverseSpeedMultiplier cannot exceed 1`);

    if (record.transport !== null) {
      if (!record.transport || typeof record.transport !== 'object' || Array.isArray(record.transport)) errors.push(`${path}: transport must be null or an object`);
      else {
        if (!Number.isInteger(record.transport.capacity) || record.transport.capacity <= 0) errors.push(`${path}: transport.capacity must be a positive integer`);
        if (!Array.isArray(record.transport.passengerDomains) || !record.transport.passengerDomains.includes('infantry')) errors.push(`${path}: transport must accept infantry`);
        for (const field of ['embarkSeconds', 'disembarkSeconds']) if (!isNonNegativeFinite(record.transport[field])) errors.push(`${path}: transport.${field} must be non-negative`);
        if (!BLOCKED_EXIT_POLICIES.has(record.transport.blockedExitPolicy)) errors.push(`${path}: blockedExitPolicy must preserve cargo`);
        if (!TRANSPORT_DESTRUCTION_POLICIES.has(record.transport.destructionPolicy)) errors.push(`${path}: destructionPolicy must match UFR-026`);
      }
    }
    if (typeof record.repair?.repairable !== 'boolean') errors.push(`${path}: repair.repairable must be boolean`);
    if (!Number.isFinite(record.repair?.fieldRepairCap) || record.repair.fieldRepairCap <= 0 || record.repair.fieldRepairCap > 1) errors.push(`${path}: fieldRepairCap must be within (0, 1]`);
    if (typeof record.repair?.recoveryEligible !== 'boolean') errors.push(`${path}: repair.recoveryEligible must be boolean`);
    if (!isNonNegativeFinite(record.sight) || record.sight <= 0) errors.push(`${path}: sight must be positive`);
    if (!SIGNATURES.has(record.signature)) errors.push(`${path}: invalid signature`);
    if (!STANCES.has(record.preferredStance)) errors.push(`${path}: invalid preferredStance`);

    if (!Array.isArray(record.weapons) || record.weapons.length === 0) errors.push(`${path}: weapons must be non-empty`);
    for (const profile of record.weapons || []) validateWeapon(errors, path, profile);
    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities must contain at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0 || record.counters.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length === 0 || record.vulnerabilities.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilities are invalid`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.some((id) => id !== record.id && !VEHICLE_IDS.has(id))) errors.push(`${path}: supportLinks contain an unknown vehicle`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 40) errors.push(`${path}: playerUse must contain actionable guidance`);
  }

  for (const id of UKRAINIAN_VEHICLE_IDS) if (!branch.vehicles.some((record) => record.id === id)) errors.push(`missing required vehicle: ${id}`);
  for (const roleId of UKRAINIAN_VEHICLE_ROLE_IDS) if (!branch.vehicles.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  for (const rosterNodeId of UKRAINIAN_VEHICLE_ROSTER_NODE_IDS) if (!branch.vehicles.some((record) => record.rosterNodeId === rosterNodeId)) errors.push(`missing required roster node coverage: ${rosterNodeId}`);
  if (branch.vehicles.filter((record) => record.rosterNodeId === 'ua.protected-mobility').length !== 2) errors.push('ua.protected-mobility must expose exactly transport and IFV variants');

  for (const record of branch.vehicles) {
    for (const linkedId of record.supportLinks || []) {
      if (linkedId === record.id) errors.push(`${record.id}: supportLinks cannot contain itself`);
      if (!branch.vehicles.some((candidate) => candidate.id === linkedId)) errors.push(`${record.id}: support link ${linkedId} is not present in this branch`);
    }
  }
  return Object.freeze([...new Set(errors)].sort());
}

export function getUkrainianVehicle(vehicleId) {
  const record = VEHICLES_BY_ID.get(vehicleId);
  if (!record) throw new RangeError(`Unknown Ukrainian vehicle: ${vehicleId}`);
  return record;
}

export function getUkrainianVehicleVariants(rosterNodeId) {
  if (!ROSTER_NODE_IDS.has(rosterNodeId)) throw new RangeError(`Unknown Ukrainian vehicle roster node: ${rosterNodeId}`);
  return Object.freeze(UKRAINIAN_VEHICLE_BRANCH.vehicles
    .filter((record) => record.rosterNodeId === rosterNodeId)
    .map((record) => record.id));
}

export function availableUkrainianVehicles(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(UKRAINIAN_VEHICLE_BRANCH.vehicles
    .filter((record) => record.requires.every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function summarizeUkrainianVehicleTaskGroup(vehicleIds = []) {
  if (!Array.isArray(vehicleIds)) throw new TypeError('vehicleIds must be an array');
  for (const duplicate of duplicateValues(vehicleIds)) throw new TypeError(`vehicleIds contains duplicate vehicle id: ${duplicate}`);
  const records = vehicleIds.map(getUkrainianVehicle);
  const roles = [...new Set(records.map((record) => record.roleId))].sort();
  const counters = [...new Set(records.flatMap((record) => record.counters))].sort();
  const capabilities = [...new Set(records.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const linkedPairs = new Set(records.flatMap((record) => record.supportLinks
    .filter((id) => vehicleIds.includes(id))
    .map((id) => [record.id, id].sort().join('|')))).size;
  const hasProtectedLift = roles.includes('protected-transport') || roles.includes('infantry-fighting-vehicle');
  const hasDirectFire = roles.includes('infantry-fighting-vehicle') || roles.includes('main-battle-tank');
  const hasRecovery = roles.includes('armored-recovery');
  const hasBreach = roles.includes('combat-engineering-vehicle');
  return deepFreeze({
    vehicleIds: [...vehicleIds],
    roles,
    counters,
    capabilities,
    totalCapacityCost: records.reduce((total, record) => total + record.capacityCost, 0),
    totalTransportCapacity: records.reduce((total, record) => total + (record.transport?.capacity || 0), 0),
    doctrine: {
      protectedLift: hasProtectedLift,
      directFireScreen: hasProtectedLift && hasDirectFire,
      recoveryCoverage: hasRecovery,
      breachSupport: hasBreach,
      preservationLoop: hasDirectFire && hasRecovery,
      combinedArmsReady: hasProtectedLift && roles.includes('main-battle-tank') && hasRecovery && hasBreach,
      supportLinkPairs: linkedPairs,
    },
    missingCoreRoles: [
      'protected-transport',
      'main-battle-tank',
      'armored-recovery',
      'combat-engineering-vehicle',
    ].filter((roleId) => !roles.includes(roleId)),
  });
}

const validationErrors = validateUkrainianVehicleBranch();
if (validationErrors.length) throw new Error(`Invalid Ukrainian vehicle branch: ${validationErrors.join('; ')}`);
