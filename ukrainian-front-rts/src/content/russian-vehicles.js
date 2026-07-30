import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import {
  ARMOR_CLASSES,
  DAMAGE_CLASSES,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
} from '../combat/combat-schema.js';

export const RUSSIAN_VEHICLE_SCHEMA_VERSION = 1;
export const RUSSIAN_VEHICLE_DOCTRINE = 'echeloned-pressure';

export const RUSSIAN_VEHICLE_ROLE_IDS = Object.freeze([
  'mass-protected-transport',
  'infantry-fighting-vehicle',
  'breakthrough-tank',
  'armored-recovery',
]);

export const RUSSIAN_VEHICLE_IDS = Object.freeze([
  'ru.apc-carrier',
  'ru.apc-ifv',
  'ru.tank-breakthrough',
  'ru.repair-tractor',
]);

export const RUSSIAN_VEHICLE_COUNTER_DOMAINS = Object.freeze([
  'infantry',
  'light-vehicles',
  'armor',
  'anti-armor',
  'fires',
  'drones',
  'fortifications',
  'logistics',
  'mobility',
  'repair',
]);

const ARMOR_VALUES = new Set(Object.values(ARMOR_CLASSES));
const RESISTANCE_VALUES = new Set(Object.values(RESISTANCE_CLASSES));
const DAMAGE_VALUES = new Set(Object.values(DAMAGE_CLASSES));
const SPLASH_VALUES = new Set(Object.values(SPLASH_CLASSES));
const TARGET_VALUES = new Set(Object.values(TARGET_DOMAINS));
const ROLE_IDS = new Set(RUSSIAN_VEHICLE_ROLE_IDS);
const UNIT_IDS = new Set(RUSSIAN_VEHICLE_IDS);
const COUNTER_DOMAINS = new Set(RUSSIAN_VEHICLE_COUNTER_DOMAINS);
const SIGNATURES = new Set(['low', 'normal', 'high', 'very-high']);
const ECHELON_ROLES = new Set(['lift', 'line-fire-support', 'breakthrough', 'recovery']);
const BLOCKED_EXIT_POLICIES = new Set(['retain-cargo']);
const DESTRUCTION_POLICIES = new Set(['catastrophic-loss']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const weapon = ({ id, damageClass, targetDomains, range, damage, reload, minimumRange = 0, splashClass = SPLASH_CLASSES.NONE, ammunition = null }) => ({
  id,
  damageClass,
  targetDomains,
  range,
  damage,
  reload,
  minimumRange,
  splashClass,
  ammunition,
});

const capability = (id, parameters = {}) => ({ id, parameters });

const vehicle = ({
  id,
  rosterNodeId,
  roleId,
  displayName,
  shortName,
  variant,
  tier,
  producer,
  requires,
  capacityCost,
  cost,
  durability,
  mobility,
  transport,
  repair,
  signature,
  massing,
  weapons,
  capabilities,
  counters,
  vulnerabilities,
  supportLinks,
  playerUse,
}) => ({
  schemaVersion: RUSSIAN_VEHICLE_SCHEMA_VERSION,
  faction: 'russia',
  doctrine: RUSSIAN_VEHICLE_DOCTRINE,
  id,
  rosterNodeId,
  roleId,
  displayName,
  shortName,
  variant,
  tier,
  producer,
  requires,
  capacityCost,
  cost,
  durability,
  mobility,
  transport,
  repair,
  signature,
  massing,
  weapons,
  capabilities,
  counters,
  vulnerabilities,
  supportLinks,
  playerUse,
});

const BRANCH_VEHICLES = [
  vehicle({
    id: 'ru.apc-carrier',
    rosterNodeId: 'ru.apc',
    roleId: 'mass-protected-transport',
    displayName: 'Russian Massed Armored Personnel Carrier',
    shortName: 'Mass APC',
    variant: 'carrier',
    tier: 1,
    producer: 'ru.armored-park',
    requires: ['ru.armored-park'],
    capacityCost: 3,
    cost: { metal: 118, fuel: 42, intel: 0 },
    durability: { hitPoints: 295, armorClass: ARMOR_CLASSES.LIGHT, resistanceClass: RESISTANCE_CLASSES.VEHICLE, suppressionResistance: 1.18 },
    mobility: { speed: 70, acceleration: 36, turnRate: 1.8, footprint: 18, damagedSpeedMultiplier: 0.58 },
    transport: { capacity: 8, passengerSlotLimit: 2, embarkSeconds: 2.8, disembarkSeconds: 2.2, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    repair: { fieldRepairCap: 0.6, facilityRepairAllowed: true, canRepairOthers: false, recoveryTowCapacity: 0 },
    signature: 'high',
    massing: { batchSize: 2, productionWeight: 0.72, replacementPriority: 0.82, fuelBurden: 0.72, commandLoad: 0.75, echelonRole: 'lift' },
    weapons: [weapon({ id: 'apc-heavy-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, targetDomains: [TARGET_DOMAINS.GROUND], range: 155, damage: 18, reload: 0.8 })],
    capabilities: [
      capability('massed-lift', { batchSize: 2, protectedSeats: 8 }),
      capability('rapid-unload', { readinessSeconds: 2.2, requiresClearExit: true }),
      capability('route-column', { roadSpeedMultiplier: 1.12, spacingPenalty: 0.2 }),
    ],
    counters: ['infantry', 'logistics', 'mobility'],
    vulnerabilities: ['anti-armor', 'fires', 'drones'],
    supportLinks: ['ru.apc-ifv', 'ru.tank-breakthrough', 'ru.repair-tractor'],
    playerUse: 'Move replaceable infantry echelons quickly and cheaply, accepting limited protection and firepower against prepared anti-armor threats.',
  }),
  vehicle({
    id: 'ru.apc-ifv',
    rosterNodeId: 'ru.apc',
    roleId: 'infantry-fighting-vehicle',
    displayName: 'Russian Infantry Fighting Vehicle',
    shortName: 'Line IFV',
    variant: 'fire-support',
    tier: 1,
    producer: 'ru.armored-park',
    requires: ['ru.armored-park'],
    capacityCost: 4,
    cost: { metal: 158, fuel: 62, intel: 8 },
    durability: { hitPoints: 345, armorClass: ARMOR_CLASSES.MEDIUM, resistanceClass: RESISTANCE_CLASSES.VEHICLE, suppressionResistance: 1.3 },
    mobility: { speed: 63, acceleration: 30, turnRate: 1.55, footprint: 19, damagedSpeedMultiplier: 0.52 },
    transport: { capacity: 6, passengerSlotLimit: 2, embarkSeconds: 3.1, disembarkSeconds: 2.6, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    repair: { fieldRepairCap: 0.58, facilityRepairAllowed: true, canRepairOthers: false, recoveryTowCapacity: 0 },
    signature: 'very-high',
    massing: { batchSize: 1, productionWeight: 1, replacementPriority: 0.7, fuelBurden: 1, commandLoad: 1, echelonRole: 'line-fire-support' },
    weapons: [
      weapon({ id: 'ifv-autocannon', damageClass: DAMAGE_CLASSES.AUTOCANNON, targetDomains: [TARGET_DOMAINS.GROUND], range: 205, damage: 32, reload: 1.3, splashClass: SPLASH_CLASSES.SMALL }),
      weapon({ id: 'ifv-guided-missile', damageClass: DAMAGE_CLASSES.SHAPED_CHARGE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 255, damage: 72, reload: 10, minimumRange: 40, ammunition: 3 }),
    ],
    capabilities: [
      capability('mounted-fire-support', { suppressionRadius: 58, infantryScreenRequired: true }),
      capability('anti-armor-salvo', { ammunition: 3, targetReservation: true }),
      capability('successive-echelon', { reinforcementReadinessMultiplier: 0.88, requiresTransportedInfantry: true }),
    ],
    counters: ['infantry', 'light-vehicles', 'armor'],
    vulnerabilities: ['anti-armor', 'fires', 'drones'],
    supportLinks: ['ru.apc-carrier', 'ru.tank-breakthrough', 'ru.repair-tractor'],
    playerUse: 'Add direct fire to motor-rifle echelons while preserving some passenger capacity, but pay a higher fuel and replacement cost than mass carriers.',
  }),
  vehicle({
    id: 'ru.tank-breakthrough',
    rosterNodeId: 'ru.tank',
    roleId: 'breakthrough-tank',
    displayName: 'Russian Breakthrough Main Battle Tank',
    shortName: 'Breakthrough Tank',
    variant: 'breakthrough',
    tier: 2,
    producer: 'ru.armored-park',
    requires: ['ru.armored-park'],
    capacityCost: 6,
    cost: { metal: 235, fuel: 108, intel: 12 },
    durability: { hitPoints: 570, armorClass: ARMOR_CLASSES.HEAVY, resistanceClass: RESISTANCE_CLASSES.VEHICLE, suppressionResistance: 1.62 },
    mobility: { speed: 50, acceleration: 20, turnRate: 1.05, footprint: 23, damagedSpeedMultiplier: 0.4 },
    transport: null,
    repair: { fieldRepairCap: 0.5, facilityRepairAllowed: true, canRepairOthers: false, recoveryTowCapacity: 0 },
    signature: 'very-high',
    massing: { batchSize: 1, productionWeight: 1.42, replacementPriority: 0.5, fuelBurden: 1.55, commandLoad: 1.45, echelonRole: 'breakthrough' },
    weapons: [
      weapon({ id: 'tank-kinetic-round', damageClass: DAMAGE_CLASSES.KINETIC, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 265, damage: 104, reload: 6.8 }),
      weapon({ id: 'tank-high-explosive-round', damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 245, damage: 78, reload: 7.2, splashClass: SPLASH_CLASSES.MEDIUM, ammunition: 5 }),
    ],
    capabilities: [
      capability('breakthrough-mass', { frontalDamageMultiplier: 0.82, requiresAdjacentArmor: true }),
      capability('prepared-axis', { roadAndOpenGroundSpeedMultiplier: 1.08, rubblePenalty: 0.18 }),
      capability('shock-action', { suppressionOnImpact: 1.15, minimumFriendlyArmor: 2 }),
    ],
    counters: ['armor', 'fortifications', 'light-vehicles'],
    vulnerabilities: ['anti-armor', 'drones', 'repair'],
    supportLinks: ['ru.apc-carrier', 'ru.apc-ifv', 'ru.repair-tractor'],
    playerUse: 'Concentrate several tanks on a prepared axis to break defended sectors; isolated tanks are expensive, fuel-heavy, and difficult to replace.',
  }),
  vehicle({
    id: 'ru.repair-tractor',
    rosterNodeId: 'ru.repair-tractor',
    roleId: 'armored-recovery',
    displayName: 'Russian Armored Repair Tractor',
    shortName: 'Repair Tractor',
    variant: 'recovery',
    tier: 2,
    producer: 'ru.armored-park',
    requires: ['ru.armored-park', 'ru.replacement-depth'],
    capacityCost: 4,
    cost: { metal: 142, fuel: 54, intel: 6 },
    durability: { hitPoints: 380, armorClass: ARMOR_CLASSES.MEDIUM, resistanceClass: RESISTANCE_CLASSES.VEHICLE, suppressionResistance: 1.32 },
    mobility: { speed: 46, acceleration: 18, turnRate: 1.15, footprint: 21, damagedSpeedMultiplier: 0.46 },
    transport: null,
    repair: { fieldRepairCap: 0.72, facilityRepairAllowed: true, canRepairOthers: true, recoveryTowCapacity: 1 },
    signature: 'high',
    massing: { batchSize: 1, productionWeight: 0.9, replacementPriority: 0.92, fuelBurden: 0.82, commandLoad: 0.8, echelonRole: 'recovery' },
    weapons: [weapon({ id: 'recovery-defense-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, targetDomains: [TARGET_DOMAINS.GROUND], range: 125, damage: 12, reload: 1 })],
    capabilities: [
      capability('formation-repair', { targets: ['vehicle'], fieldLimit: 0.72, contributorLimit: 3 }),
      capability('disabled-vehicle-recovery', { towCapacity: 1, threatTolerance: 0.35 }),
      capability('replacement-routing', { recoveryDelayMultiplier: 0.78, requiresSupplyRoute: true }),
    ],
    counters: ['repair', 'logistics'],
    vulnerabilities: ['anti-armor', 'fires', 'drones'],
    supportLinks: ['ru.apc-carrier', 'ru.apc-ifv', 'ru.tank-breakthrough'],
    playerUse: 'Keep successive armored echelons operational and recover disabled platforms, but protect the tractor because its loss sharply increases replacement demand.',
  }),
];

export const RUSSIAN_VEHICLE_BRANCH = deepFreeze({
  schemaVersion: RUSSIAN_VEHICLE_SCHEMA_VERSION,
  faction: 'russia',
  doctrine: RUSSIAN_VEHICLE_DOCTRINE,
  vehicles: BRANCH_VEHICLES,
});

const TECH_TREE_RU = FACTION_TECH_TREES.factions.russia;
const TECH_NODES_BY_ID = new Map(TECH_TREE_RU.nodes.map((node) => [node.id, node]));
const VEHICLES_BY_ID = new Map(RUSSIAN_VEHICLE_BRANCH.vehicles.map((record) => [record.id, record]));

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

export function validateRussianVehicleBranch(branch = RUSSIAN_VEHICLE_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== RUSSIAN_VEHICLE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${RUSSIAN_VEHICLE_SCHEMA_VERSION}`);
  if (branch.faction !== 'russia') errors.push('faction must be russia');
  if (branch.doctrine !== RUSSIAN_VEHICLE_DOCTRINE) errors.push(`doctrine must be ${RUSSIAN_VEHICLE_DOCTRINE}`);
  if (TECH_TREE_RU.doctrine !== branch.doctrine) errors.push('branch doctrine must match the UFR-070 Russian doctrine');
  if (!Array.isArray(branch.vehicles)) return Object.freeze([...errors, 'vehicles must be an array']);

  for (const duplicate of duplicateValues(branch.vehicles.map((record) => record?.id))) errors.push(`duplicate vehicle id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.vehicles.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.vehicles) {
    const path = record?.id || '<missing-vehicle-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('vehicle records must be objects');
      continue;
    }
    if (record.schemaVersion !== RUSSIAN_VEHICLE_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!UNIT_IDS.has(record.id)) errors.push(`${path}: unexpected vehicle id`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId ${record.roleId}`);
    if (record.faction !== 'russia' || record.doctrine !== RUSSIAN_VEHICLE_DOCTRINE) errors.push(`${path}: faction/doctrine mismatch`);
    if (typeof record.displayName !== 'string' || !record.displayName.trim()) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);
    if (typeof record.variant !== 'string' || !record.variant.trim()) errors.push(`${path}: variant is required`);
    if (!Number.isInteger(record.tier) || record.tier < 0 || record.tier > 3) errors.push(`${path}: tier must be an integer from 0 to 3`);
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

    if (!isNonNegativeFinite(record.durability?.hitPoints) || record.durability.hitPoints <= 0) errors.push(`${path}: durability.hitPoints must be positive`);
    if (!ARMOR_VALUES.has(record.durability?.armorClass)) errors.push(`${path}: invalid armorClass`);
    if (!RESISTANCE_VALUES.has(record.durability?.resistanceClass)) errors.push(`${path}: invalid resistanceClass`);
    if (!Number.isFinite(record.durability?.suppressionResistance) || record.durability.suppressionResistance <= 0) errors.push(`${path}: suppressionResistance must be positive`);

    for (const field of ['speed', 'acceleration', 'turnRate', 'footprint']) if (!isNonNegativeFinite(record.mobility?.[field]) || record.mobility[field] <= 0) errors.push(`${path}: mobility.${field} must be positive`);
    if (!Number.isFinite(record.mobility?.damagedSpeedMultiplier) || record.mobility.damagedSpeedMultiplier <= 0 || record.mobility.damagedSpeedMultiplier > 1) errors.push(`${path}: damagedSpeedMultiplier must be in (0, 1]`);

    if (record.transport !== null) {
      if (!Number.isInteger(record.transport?.capacity) || record.transport.capacity <= 0) errors.push(`${path}: transport.capacity must be a positive integer`);
      if (!Number.isInteger(record.transport?.passengerSlotLimit) || record.transport.passengerSlotLimit <= 0) errors.push(`${path}: passengerSlotLimit must be a positive integer`);
      for (const field of ['embarkSeconds', 'disembarkSeconds']) if (!isNonNegativeFinite(record.transport?.[field])) errors.push(`${path}: transport.${field} must be non-negative`);
      if (!BLOCKED_EXIT_POLICIES.has(record.transport?.blockedExitPolicy)) errors.push(`${path}: invalid blockedExitPolicy`);
      if (!DESTRUCTION_POLICIES.has(record.transport?.destructionPolicy)) errors.push(`${path}: invalid destructionPolicy`);
    }

    if (!Number.isFinite(record.repair?.fieldRepairCap) || record.repair.fieldRepairCap <= 0 || record.repair.fieldRepairCap > 1) errors.push(`${path}: fieldRepairCap must be in (0, 1]`);
    if (typeof record.repair?.facilityRepairAllowed !== 'boolean') errors.push(`${path}: facilityRepairAllowed must be boolean`);
    if (typeof record.repair?.canRepairOthers !== 'boolean') errors.push(`${path}: canRepairOthers must be boolean`);
    if (!Number.isInteger(record.repair?.recoveryTowCapacity) || record.repair.recoveryTowCapacity < 0) errors.push(`${path}: recoveryTowCapacity must be a non-negative integer`);

    if (!SIGNATURES.has(record.signature)) errors.push(`${path}: invalid signature`);
    if (!Number.isInteger(record.massing?.batchSize) || record.massing.batchSize <= 0) errors.push(`${path}: massing.batchSize must be a positive integer`);
    for (const field of ['productionWeight', 'replacementPriority', 'fuelBurden', 'commandLoad']) if (!isNonNegativeFinite(record.massing?.[field]) || record.massing[field] <= 0) errors.push(`${path}: massing.${field} must be positive`);
    if (!ECHELON_ROLES.has(record.massing?.echelonRole)) errors.push(`${path}: invalid echelonRole`);

    if (!Array.isArray(record.weapons) || record.weapons.length === 0) errors.push(`${path}: weapons must be non-empty`);
    for (const profile of record.weapons || []) {
      if (typeof profile.id !== 'string' || !profile.id) errors.push(`${path}: weapon id is required`);
      if (!DAMAGE_VALUES.has(profile.damageClass)) errors.push(`${path}: unknown weapon damageClass ${profile.damageClass}`);
      if (!Array.isArray(profile.targetDomains) || profile.targetDomains.length === 0 || profile.targetDomains.some((domain) => !TARGET_VALUES.has(domain))) errors.push(`${path}: weapon targetDomains are invalid`);
      if (!SPLASH_VALUES.has(profile.splashClass)) errors.push(`${path}: invalid splashClass`);
      for (const field of ['range', 'damage', 'reload', 'minimumRange']) if (!isNonNegativeFinite(profile[field])) errors.push(`${path}: weapon ${profile.id} ${field} must be non-negative and finite`);
      if (profile.reload <= 0) errors.push(`${path}: weapon ${profile.id} reload must be positive`);
      if (profile.minimumRange > profile.range) errors.push(`${path}: weapon ${profile.id} minimumRange exceeds range`);
      if (profile.ammunition !== null && (!Number.isInteger(profile.ammunition) || profile.ammunition <= 0)) errors.push(`${path}: weapon ${profile.id} ammunition must be null or a positive integer`);
    }

    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities must contain at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0 || record.counters.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length === 0 || record.vulnerabilities.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilities are invalid`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.some((id) => id !== record.id && !UNIT_IDS.has(id))) errors.push(`${path}: supportLinks contain an unknown vehicle`);
    if (record.supportLinks?.includes(record.id)) errors.push(`${path}: supportLinks cannot contain itself`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 40) errors.push(`${path}: playerUse must provide actionable guidance`);
  }

  for (const id of RUSSIAN_VEHICLE_IDS) if (!branch.vehicles.some((record) => record.id === id)) errors.push(`missing required vehicle: ${id}`);
  for (const roleId of RUSSIAN_VEHICLE_ROLE_IDS) if (!branch.vehicles.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  return Object.freeze([...new Set(errors)].sort());
}

export function getRussianVehicle(vehicleId) {
  const record = VEHICLES_BY_ID.get(vehicleId);
  if (!record) throw new RangeError(`Unknown Russian vehicle: ${vehicleId}`);
  return record;
}

export function getRussianVehicleVariants(rosterNodeId) {
  if (typeof rosterNodeId !== 'string' || !rosterNodeId) throw new TypeError('rosterNodeId must be a non-empty string');
  const variants = RUSSIAN_VEHICLE_BRANCH.vehicles.filter((record) => record.rosterNodeId === rosterNodeId);
  if (!variants.length) throw new RangeError(`Unknown Russian vehicle roster node: ${rosterNodeId}`);
  return Object.freeze([...variants]);
}

export function availableRussianVehicles(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(RUSSIAN_VEHICLE_BRANCH.vehicles
    .filter((record) => record.requires.every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function summarizeRussianVehicleTaskGroup(vehicleIds = []) {
  if (!Array.isArray(vehicleIds)) throw new TypeError('vehicleIds must be an array');
  for (const duplicate of duplicateValues(vehicleIds)) throw new TypeError(`vehicleIds contains duplicate vehicle id: ${duplicate}`);
  const records = vehicleIds.map(getRussianVehicle);
  const roles = [...new Set(records.map((record) => record.roleId))].sort();
  const counters = [...new Set(records.flatMap((record) => record.counters))].sort();
  const capabilities = [...new Set(records.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const linkedPairs = new Set(records.flatMap((record) => record.supportLinks
    .filter((id) => vehicleIds.includes(id))
    .map((id) => [record.id, id].sort().join('|')))).size;
  const hasCarrier = roles.includes('mass-protected-transport');
  const hasIfv = roles.includes('infantry-fighting-vehicle');
  const hasTank = roles.includes('breakthrough-tank');
  const hasRecovery = roles.includes('armored-recovery');
  const totalCost = records.reduce((total, record) => ({
    metal: total.metal + record.cost.metal,
    fuel: total.fuel + record.cost.fuel,
    intel: total.intel + record.cost.intel,
  }), { metal: 0, fuel: 0, intel: 0 });
  const directFireIndex = records.reduce((total, record) => total + record.weapons.reduce((weaponTotal, profile) => weaponTotal + profile.damage / profile.reload, 0), 0);
  return deepFreeze({
    vehicleIds: [...vehicleIds],
    roles,
    counters,
    capabilities,
    totalCost,
    totalCapacityCost: records.reduce((total, record) => total + record.capacityCost, 0),
    protectedSeats: records.reduce((total, record) => total + (record.transport?.capacity || 0), 0),
    productionBatchSize: records.reduce((total, record) => total + record.massing.batchSize, 0),
    fuelBurden: records.reduce((total, record) => total + record.massing.fuelBurden, 0),
    commandLoad: records.reduce((total, record) => total + record.massing.commandLoad, 0),
    directFireIndex: Number(directFireIndex.toFixed(3)),
    doctrine: {
      massLiftReady: hasCarrier,
      mountedEchelonReady: hasCarrier && hasIfv,
      breakthroughReady: hasIfv && hasTank,
      recoveryContinuity: hasTank && hasRecovery,
      operationalMassReady: hasCarrier && hasIfv && hasTank && hasRecovery,
      supportLinkPairs: linkedPairs,
    },
    missingCoreRoles: RUSSIAN_VEHICLE_ROLE_IDS.filter((roleId) => !roles.includes(roleId)),
  });
}

const validationErrors = validateRussianVehicleBranch();
if (validationErrors.length) throw new Error(`Invalid Russian vehicle branch: ${validationErrors.join('; ')}`);
