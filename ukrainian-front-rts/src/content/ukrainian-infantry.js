import {
  COUNTER_DOMAINS as FACTION_COUNTER_DOMAINS,
  FACTION_TECH_TREES,
} from './faction-tech-trees.js';
import {
  ARMOR_CLASSES,
  DAMAGE_CLASSES,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
  createDefenseProfile,
  createWeaponProfile,
  validateDefenseProfile,
  validateWeaponProfile,
} from '../combat/combat-schema.js';

export const UKRAINIAN_INFANTRY_SCHEMA_VERSION = 2;
export const UKRAINIAN_INFANTRY_DOCTRINE = 'networked-maneuver';

export const UKRAINIAN_INFANTRY_ROLE_IDS = Object.freeze([
  'engineer',
  'line-infantry',
  'anti-armor',
  'reconnaissance',
  'medical',
  'air-defense',
  'command-support',
]);

export const UKRAINIAN_INFANTRY_UNIT_IDS = Object.freeze([
  'ua.combat-engineers',
  'ua.line-infantry',
  'ua.anti-armor-team',
  'ua.recon-team',
  'ua.casevac-team',
  'ua.mobile-sam',
  'ua.command-team',
]);

const ROLE_IDS = new Set(UKRAINIAN_INFANTRY_ROLE_IDS);
const UNIT_IDS = new Set(UKRAINIAN_INFANTRY_UNIT_IDS);
const COUNTER_DOMAINS = new Set(FACTION_COUNTER_DOMAINS);
const UA_TECH_TREE = FACTION_TECH_TREES.factions.ukraine;
const TECH_NODES_BY_ID = new Map(UA_TECH_TREE.nodes.map((node) => [node.id, node]));

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function finiteInRange(value, minimum = 0, maximum = Infinity) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function capability(id, parameters = {}) {
  return { id, parameters };
}

function weapon({
  id,
  damageClass,
  targetDomains,
  splashClass = SPLASH_CLASSES.NONE,
  penetration = null,
  range,
  damage,
  reload,
  minimumRange = 0,
  ammo = null,
}) {
  return {
    id,
    profile: createWeaponProfile({
      damageClass,
      targetDomains,
      splashClass,
      penetration,
    }),
    range,
    damage,
    reload,
    minimumRange,
    ammo,
  };
}

function unit({
  id,
  roleId,
  displayName,
  shortName,
  squadSize,
  commandCapacityCost,
  cost,
  hitPoints,
  armorClass = ARMOR_CLASSES.SOFT,
  resistanceClass = RESISTANCE_CLASSES.INFANTRY,
  suppressionResistance,
  speed,
  transportSlots,
  garrisonSlots = 1,
  garrisonable = true,
  sight,
  signature,
  preferredStance,
  weapons,
  capabilities,
  counterDomains,
  vulnerabilityDomains,
  supportLinks,
  tags,
  playerUse,
}) {
  const rosterNode = TECH_NODES_BY_ID.get(id);
  return {
    schemaVersion: UKRAINIAN_INFANTRY_SCHEMA_VERSION,
    faction: 'ukraine',
    doctrine: UKRAINIAN_INFANTRY_DOCTRINE,
    id,
    rosterNodeId: id,
    roleId,
    displayName,
    shortName,
    tier: rosterNode?.tier,
    producer: rosterNode?.producer,
    requires: rosterNode ? [...rosterNode.requires] : [],
    squadSize,
    commandCapacityCost,
    capacityCost: commandCapacityCost,
    cost,
    durability: {
      hitPoints,
      defenseProfile: createDefenseProfile({ armorClass, resistanceClass }),
      suppressionResistance,
    },
    mobility: {
      speed,
      movementLayer: 'ground',
      transportable: true,
      transportSlots,
      garrisonable,
      garrisonSlots: garrisonable ? garrisonSlots : 0,
    },
    sight,
    signature,
    preferredStance,
    weapons,
    capabilities,
    counterDomains,
    vulnerabilityDomains,
    supportLinks,
    upgradeDescriptor: {
      faction: 'ukraine',
      unitType: id,
      archetype: roleId === 'air-defense' ? 'infantry-support' : 'infantry',
      tags: [...new Set(['infantry', roleId, ...tags])],
      abilities: capabilities.map((entry) => entry.id),
    },
    playerUse,
  };
}

const UNITS = [
  unit({
    id: 'ua.combat-engineers',
    roleId: 'engineer',
    displayName: 'Ukrainian Combat Engineer Section',
    shortName: 'Combat Engineers',
    squadSize: 6,
    commandCapacityCost: 1,
    cost: { metal: 70, fuel: 0, intel: 0 },
    hitPoints: 82,
    suppressionResistance: 0.95,
    speed: 61,
    transportSlots: 2,
    sight: 205,
    signature: 'normal',
    preferredStance: 'mobile',
    weapons: [weapon({
      id: 'service-rifles',
      damageClass: DAMAGE_CLASSES.SMALL_ARMS,
      targetDomains: [TARGET_DOMAINS.GROUND],
      range: 135,
      damage: 8,
      reload: 1.05,
    })],
    capabilities: [
      capability('construction', { rate: 1, families: ['base', 'field-defense'] }),
      capability('repair', { rate: 1, targets: ['vehicle', 'structure'], fieldLimit: 0.65 }),
      capability('obstacle-clearance', { mines: true, barriers: true }),
    ],
    counterDomains: ['fortifications', 'logistics'],
    vulnerabilityDomains: ['armor', 'fires'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team'],
    tags: ['construction', 'repair', 'breaching'],
    playerUse: 'Open routes, establish forward support, and recover damaged assets without becoming a frontline assault squad.',
  }),
  unit({
    id: 'ua.line-infantry',
    roleId: 'line-infantry',
    displayName: 'Ukrainian Mechanized Infantry Squad',
    shortName: 'Mechanized Squad',
    squadSize: 8,
    commandCapacityCost: 2,
    cost: { metal: 90, fuel: 0, intel: 0 },
    hitPoints: 118,
    suppressionResistance: 1,
    speed: 60,
    transportSlots: 3,
    garrisonSlots: 2,
    sight: 225,
    signature: 'normal',
    preferredStance: 'screening',
    weapons: [
      weapon({
        id: 'squad-small-arms',
        damageClass: DAMAGE_CLASSES.SMALL_ARMS,
        targetDomains: [TARGET_DOMAINS.GROUND],
        range: 160,
        damage: 14,
        reload: 0.95,
      }),
      weapon({
        id: 'automatic-grenade',
        damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE,
        targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
        splashClass: SPLASH_CLASSES.SMALL,
        range: 125,
        damage: 24,
        reload: 8,
        ammo: 3,
      }),
    ],
    capabilities: [
      capability('cover-discipline', { incomingAccuracyMultiplier: 0.86, requiresCover: true }),
      capability('local-suppression', { radius: 75, accumulation: 0.8 }),
      capability('rapid-dismount', { readinessSeconds: 2.5 }),
    ],
    counterDomains: ['infantry-mass', 'reconnaissance'],
    vulnerabilityDomains: ['armor', 'fires'],
    supportLinks: ['ua.casevac-team', 'ua.command-team', 'ua.anti-armor-team'],
    tags: ['screening', 'mechanized', 'suppression'],
    playerUse: 'Screen specialists, contest terrain, and hold short engagements while the task group concentrates effects.',
  }),
  unit({
    id: 'ua.anti-armor-team',
    roleId: 'anti-armor',
    displayName: 'Ukrainian Anti-Armor Team',
    shortName: 'Anti-Armor Team',
    squadSize: 4,
    commandCapacityCost: 2,
    cost: { metal: 105, fuel: 0, intel: 20 },
    hitPoints: 72,
    suppressionResistance: 0.82,
    speed: 57,
    transportSlots: 2,
    sight: 215,
    signature: 'low',
    preferredStance: 'ambush',
    weapons: [
      weapon({
        id: 'guided-anti-armor-missile',
        damageClass: DAMAGE_CLASSES.SHAPED_CHARGE,
        targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE],
        penetration: 1.08,
        range: 245,
        damage: 76,
        reload: 9.5,
        minimumRange: 45,
        ammo: 4,
      }),
      weapon({
        id: 'personal-defense-weapons',
        damageClass: DAMAGE_CLASSES.SMALL_ARMS,
        targetDomains: [TARGET_DOMAINS.GROUND],
        range: 95,
        damage: 5,
        reload: 1.2,
      }),
    ],
    capabilities: [
      capability('prepared-ambush', { firstShotAccuracyMultiplier: 1.25, revealSeconds: 4, requiresStationary: true }),
      capability('top-attack', { heavyArmorMultiplier: 1.08, requiresContactQuality: 0.65 }),
      capability('displace-after-shot', { moveDelaySeconds: 1.2 }),
    ],
    counterDomains: ['armor', 'logistics'],
    vulnerabilityDomains: ['infantry-mass', 'fires'],
    supportLinks: ['ua.recon-team', 'ua.line-infantry', 'ua.command-team'],
    tags: ['missile', 'ambush', 'anti-armor'],
    playerUse: 'Create temporary armor-denial lanes, fire from prepared positions, and relocate before suppression or flanking arrives.',
  }),
  unit({
    id: 'ua.recon-team',
    roleId: 'reconnaissance',
    displayName: 'Ukrainian Reconnaissance Team',
    shortName: 'Recon Team',
    squadSize: 4,
    commandCapacityCost: 2,
    cost: { metal: 80, fuel: 0, intel: 35 },
    hitPoints: 68,
    suppressionResistance: 0.78,
    speed: 68,
    transportSlots: 2,
    sight: 315,
    signature: 'very-low',
    preferredStance: 'observation',
    weapons: [weapon({
      id: 'suppressed-small-arms',
      damageClass: DAMAGE_CLASSES.SMALL_ARMS,
      targetDomains: [TARGET_DOMAINS.GROUND],
      range: 175,
      damage: 9,
      reload: 1.15,
    })],
    capabilities: [
      capability('contact-quality', { base: 0.55, stationaryBonus: 0.25, maximum: 1 }),
      capability('forward-observer', { sharedTargetingRange: 360, requiresLineOfSight: true }),
      capability('emission-control', { detectedRangeMultiplier: 0.7, disablesWeapons: true }),
    ],
    counterDomains: ['reconnaissance', 'logistics'],
    vulnerabilityDomains: ['infantry-mass', 'drones'],
    supportLinks: ['ua.anti-armor-team', 'ua.mobile-sam', 'ua.command-team'],
    tags: ['observer', 'low-signature', 'targeting-support'],
    playerUse: 'Build high-quality contacts and observer links while avoiding direct fights and predictable sensor positions.',
  }),
  unit({
    id: 'ua.casevac-team',
    roleId: 'medical',
    displayName: 'Ukrainian CASEVAC Team',
    shortName: 'CASEVAC Team',
    squadSize: 5,
    commandCapacityCost: 2,
    cost: { metal: 85, fuel: 0, intel: 15 },
    hitPoints: 84,
    suppressionResistance: 0.9,
    speed: 64,
    transportSlots: 2,
    sight: 210,
    signature: 'normal',
    preferredStance: 'support',
    weapons: [weapon({
      id: 'defensive-small-arms',
      damageClass: DAMAGE_CLASSES.SMALL_ARMS,
      targetDomains: [TARGET_DOMAINS.GROUND],
      range: 105,
      damage: 4,
      reload: 1.25,
    })],
    capabilities: [
      capability('casualty-stabilization', { rate: 8, radius: 70, suppressionRecoveryMultiplier: 1.25 }),
      capability('casevac', { extractionSeconds: 4, protectedThreshold: 0.35 }),
      capability('triage', { prioritizes: ['critical', 'veteran', 'specialist'] }),
    ],
    counterDomains: ['infantry-mass', 'logistics'],
    vulnerabilityDomains: ['armor', 'fires'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team', 'ua.recon-team'],
    tags: ['medical', 'recovery', 'support'],
    playerUse: 'Preserve premium squads, shorten recovery cycles, and support withdrawal rather than extending a lost engagement.',
  }),
  unit({
    id: 'ua.mobile-sam',
    roleId: 'air-defense',
    displayName: 'Ukrainian Mobile Air-Defense Section',
    shortName: 'Mobile Air Defense',
    squadSize: 5,
    commandCapacityCost: 3,
    cost: { metal: 145, fuel: 35, intel: 45 },
    hitPoints: 96,
    armorClass: ARMOR_CLASSES.LIGHT,
    resistanceClass: RESISTANCE_CLASSES.VEHICLE,
    suppressionResistance: 0.92,
    speed: 54,
    transportSlots: 3,
    garrisonable: false,
    sight: 285,
    signature: 'high',
    preferredStance: 'air-watch',
    weapons: [
      weapon({
        id: 'short-range-surface-to-air-missile',
        damageClass: DAMAGE_CLASSES.SHAPED_CHARGE,
        targetDomains: [TARGET_DOMAINS.AIR],
        penetration: 1,
        range: 305,
        damage: 62,
        reload: 7.5,
        minimumRange: 35,
        ammo: 6,
      }),
      weapon({
        id: 'crew-small-arms',
        damageClass: DAMAGE_CLASSES.SMALL_ARMS,
        targetDomains: [TARGET_DOMAINS.GROUND],
        range: 85,
        damage: 3,
        reload: 1.3,
      }),
    ],
    capabilities: [
      capability('air-search', { detectionRange: 345, lowAltitudeMultiplier: 1.15 }),
      capability('engagement-reservation', { maximumReservedTargets: 2, overkillPrevention: true }),
      capability('silent-watch', { signatureMultiplier: 0.55, detectionRangeMultiplier: 0.75, blocksFire: true }),
    ],
    counterDomains: ['drones', 'air-defense'],
    vulnerabilityDomains: ['armor', 'fires'],
    supportLinks: ['ua.recon-team', 'ua.command-team', 'ua.line-infantry'],
    tags: ['air-defense', 'counter-uas', 'crewed-support'],
    playerUse: 'Protect dispersed task groups from drones through mobile coverage, ammunition discipline, emission control, and frequent relocation.',
  }),
  unit({
    id: 'ua.command-team',
    roleId: 'command-support',
    displayName: 'Ukrainian Distributed Command Team',
    shortName: 'Command Team',
    squadSize: 5,
    commandCapacityCost: 2,
    cost: { metal: 95, fuel: 0, intel: 55 },
    hitPoints: 88,
    suppressionResistance: 1.05,
    speed: 59,
    transportSlots: 2,
    sight: 255,
    signature: 'high',
    preferredStance: 'coordination',
    weapons: [weapon({
      id: 'command-security-weapons',
      damageClass: DAMAGE_CLASSES.SMALL_ARMS,
      targetDomains: [TARGET_DOMAINS.GROUND],
      range: 120,
      damage: 6,
      reload: 1.15,
    })],
    capabilities: [
      capability('distributed-command-link', { radius: 330, retaskDelayMultiplier: 0.75, groupLimit: 3 }),
      capability('shared-spotting', { contactQualityFloor: 0.45, requiresObserver: true }),
      capability('support-routing', { reinforcementDelayMultiplier: 0.85, recoveryDelayMultiplier: 0.85 }),
    ],
    counterDomains: ['reconnaissance', 'logistics'],
    vulnerabilityDomains: ['fires', 'drones'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team', 'ua.recon-team', 'ua.casevac-team', 'ua.mobile-sam'],
    tags: ['command', 'coordination', 'targeting-support'],
    playerUse: 'Synchronize several small groups and route support quickly without becoming a global passive aura or frontline combat unit.',
  }),
];

export const UKRAINIAN_INFANTRY_BRANCH = deepFreeze({
  schemaVersion: UKRAINIAN_INFANTRY_SCHEMA_VERSION,
  faction: 'ukraine',
  doctrine: UKRAINIAN_INFANTRY_DOCTRINE,
  units: UNITS,
});

const BRANCH_BY_ID = new Map(UKRAINIAN_INFANTRY_BRANCH.units.map((record) => [record.id, record]));

export function getUkrainianInfantryUnit(unitId) {
  const record = BRANCH_BY_ID.get(unitId);
  if (!record) throw new RangeError(`Unknown Ukrainian infantry unit: ${unitId}`);
  return record;
}

export function getUkrainianInfantryProductionConfig(unitId) {
  const record = getUkrainianInfantryUnit(unitId);
  return deepFreeze({
    type: record.id,
    faction: record.faction,
    producer: record.producer,
    requires: [...record.requires],
    cost: { ...record.cost },
    pop: record.commandCapacityCost,
  });
}

export function getUkrainianInfantryTransportDescriptor(unitId) {
  const record = getUkrainianInfantryUnit(unitId);
  return deepFreeze({
    type: record.id,
    faction: record.faction,
    infantry: true,
    air: false,
    armor: false,
    vehicle: false,
    movementLayer: record.mobility.movementLayer,
    transportable: record.mobility.transportable,
    transportSlots: record.mobility.transportSlots,
  });
}

export function getUkrainianInfantryGarrisonDescriptor(unitId) {
  const record = getUkrainianInfantryUnit(unitId);
  return deepFreeze({
    type: record.id,
    faction: record.faction,
    infantry: true,
    domain: 'infantry',
    air: false,
    armor: false,
    vehicle: false,
    garrisonable: record.mobility.garrisonable,
    garrisonSlots: record.mobility.garrisonSlots,
  });
}

export function getUkrainianInfantryUpgradeDescriptor(unitId) {
  const record = getUkrainianInfantryUnit(unitId);
  return record.upgradeDescriptor;
}

export function availableUkrainianInfantryUnits(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(UKRAINIAN_INFANTRY_BRANCH.units
    .filter((record) => record.requires.every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function summarizeUkrainianInfantryTaskGroup(unitIds = []) {
  if (!Array.isArray(unitIds)) throw new TypeError('unitIds must be an array');
  for (const duplicate of duplicateValues(unitIds)) throw new TypeError(`unitIds contains duplicate unit id: ${duplicate}`);
  const records = unitIds.map(getUkrainianInfantryUnit);
  const roles = [...new Set(records.map((record) => record.roleId))].sort();
  const counterDomains = [...new Set(records.flatMap((record) => record.counterDomains))].sort();
  const capabilities = [...new Set(records.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const hasCommand = roles.includes('command-support');
  const hasRecon = roles.includes('reconnaissance');
  const hasMedical = roles.includes('medical');
  const hasScreen = roles.includes('line-infantry');
  const cost = records.reduce((total, record) => ({
    metal: total.metal + record.cost.metal,
    fuel: total.fuel + record.cost.fuel,
    intel: total.intel + record.cost.intel,
  }), { metal: 0, fuel: 0, intel: 0 });
  const linkedPairs = new Set(records.flatMap((record) => record.supportLinks
    .filter((id) => unitIds.includes(id))
    .map((id) => [record.id, id].sort().join('|')))).size;

  return deepFreeze({
    unitIds: [...unitIds],
    roles,
    counterDomains,
    capabilities,
    totalCommandCapacityCost: records.reduce((total, record) => total + record.commandCapacityCost, 0),
    cost,
    doctrine: {
      distributedCommand: hasCommand,
      contactToAction: hasCommand && hasRecon,
      casualtyPreservation: hasMedical && hasScreen,
      combinedArmsReady: hasCommand && hasRecon && hasScreen && counterDomains.includes('armor'),
      supportLinkPairs: linkedPairs,
    },
    missingCoreRoles: ['line-infantry', 'reconnaissance', 'command-support']
      .filter((roleId) => !roles.includes(roleId)),
  });
}

export function validateUkrainianInfantryBranch(branch = UKRAINIAN_INFANTRY_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== UKRAINIAN_INFANTRY_SCHEMA_VERSION) errors.push(`schemaVersion must be ${UKRAINIAN_INFANTRY_SCHEMA_VERSION}`);
  if (branch.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (branch.doctrine !== UKRAINIAN_INFANTRY_DOCTRINE) errors.push(`doctrine must be ${UKRAINIAN_INFANTRY_DOCTRINE}`);
  if (UA_TECH_TREE.doctrine !== branch.doctrine) errors.push('branch doctrine must match UFR-070');
  if (!Array.isArray(branch.units)) return Object.freeze([...errors, 'units must be an array']);

  for (const duplicate of duplicateValues(branch.units.map((record) => record?.id))) errors.push(`duplicate unit id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.units.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.units) {
    const path = record?.id || '<missing-unit-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('unit records must be objects');
      continue;
    }
    if (record.schemaVersion !== UKRAINIAN_INFANTRY_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!UNIT_IDS.has(record.id)) errors.push(`${path}: unexpected unit id`);
    if (record.rosterNodeId !== record.id) errors.push(`${path}: rosterNodeId must equal the stable UFR-070 identity`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId ${record.roleId}`);
    if (record.faction !== 'ukraine' || record.doctrine !== UKRAINIAN_INFANTRY_DOCTRINE) errors.push(`${path}: ownership mismatch`);
    if (typeof record.displayName !== 'string' || record.displayName.trim().length < 5) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);

    const rosterNode = TECH_NODES_BY_ID.get(record.id);
    if (rosterNode?.kind !== 'roster') errors.push(`${path}: missing UFR-070 roster node`);
    else {
      if (record.tier !== rosterNode.tier) errors.push(`${path}: tier must match UFR-070`);
      if (record.producer !== rosterNode.producer) errors.push(`${path}: producer must match UFR-070`);
      if (JSON.stringify(record.requires) !== JSON.stringify(rosterNode.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (TECH_NODES_BY_ID.get(record.producer)?.kind !== 'structure') errors.push(`${path}: producer must reference a UFR-070 structure`);

    if (!Number.isInteger(record.squadSize) || record.squadSize <= 0) errors.push(`${path}: squadSize must be a positive integer`);
    if (!Number.isInteger(record.commandCapacityCost) || record.commandCapacityCost <= 0) errors.push(`${path}: commandCapacityCost must be a positive integer`);
    if (record.capacityCost !== record.commandCapacityCost) errors.push(`${path}: capacityCost compatibility alias must match commandCapacityCost`);
    const resourceKeys = Object.keys(record.cost || {}).sort();
    if (JSON.stringify(resourceKeys) !== JSON.stringify(['fuel', 'intel', 'metal'])) errors.push(`${path}: cost must use only metal, fuel, and intel`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!finiteInRange(record.cost?.[resource])) errors.push(`${path}: cost.${resource} must be non-negative and finite`);

    if (!finiteInRange(record.durability?.hitPoints, Number.EPSILON)) errors.push(`${path}: durability.hitPoints must be positive`);
    if (validateDefenseProfile(record.durability?.defenseProfile).length) errors.push(`${path}: invalid UFR-031 defense profile`);
    if (!finiteInRange(record.durability?.suppressionResistance, Number.EPSILON)) errors.push(`${path}: suppressionResistance must be positive`);
    if (!finiteInRange(record.mobility?.speed, Number.EPSILON)) errors.push(`${path}: mobility.speed must be positive`);
    if (record.mobility?.movementLayer !== 'ground') errors.push(`${path}: movementLayer must remain ground`);
    if (record.mobility?.transportable !== true) errors.push(`${path}: infantry branch units must expose transport compatibility`);
    if (!Number.isInteger(record.mobility?.transportSlots) || record.mobility.transportSlots <= 0) errors.push(`${path}: transportSlots must be a positive integer`);
    if (typeof record.mobility?.garrisonable !== 'boolean') errors.push(`${path}: garrisonable must be boolean`);
    if (!Number.isInteger(record.mobility?.garrisonSlots) || record.mobility.garrisonSlots < 0) errors.push(`${path}: garrisonSlots must be a non-negative integer`);
    if (record.mobility?.garrisonable === true && record.mobility?.garrisonSlots <= 0) errors.push(`${path}: garrisonable units need positive garrisonSlots`);
    if (record.mobility?.garrisonable === false && record.mobility?.garrisonSlots !== 0) errors.push(`${path}: non-garrisonable units must use zero garrisonSlots`);

    if (!finiteInRange(record.sight, Number.EPSILON)) errors.push(`${path}: sight must be positive`);
    if (typeof record.signature !== 'string' || !record.signature) errors.push(`${path}: signature is required`);
    if (typeof record.preferredStance !== 'string' || !record.preferredStance) errors.push(`${path}: preferredStance is required`);
    if (!Array.isArray(record.weapons) || record.weapons.length === 0) errors.push(`${path}: weapons must be non-empty`);
    for (const profile of record.weapons || []) {
      if (typeof profile.id !== 'string' || !profile.id) errors.push(`${path}: weapon id is required`);
      if (validateWeaponProfile(profile.profile).length) errors.push(`${path}: weapon ${profile.id} has an invalid UFR-031 profile`);
      for (const field of ['range', 'damage', 'reload', 'minimumRange']) if (!finiteInRange(profile[field])) errors.push(`${path}: weapon ${profile.id} ${field} must be non-negative and finite`);
      if (!(profile.reload > 0)) errors.push(`${path}: weapon ${profile.id} reload must be positive`);
      if (profile.minimumRange > profile.range) errors.push(`${path}: weapon ${profile.id} minimumRange exceeds range`);
      if (profile.ammo !== null && (!Number.isInteger(profile.ammo) || profile.ammo <= 0)) errors.push(`${path}: weapon ${profile.id} ammo must be null or a positive integer`);
    }

    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities need at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counterDomains) || record.counterDomains.length === 0 || record.counterDomains.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counterDomains must use UFR-070 vocabulary`);
    if (!Array.isArray(record.vulnerabilityDomains) || record.vulnerabilityDomains.length === 0 || record.vulnerabilityDomains.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilityDomains must use UFR-070 vocabulary`);
    if (!Array.isArray(record.supportLinks)) errors.push(`${path}: supportLinks must be an array`);
    for (const linkedId of record.supportLinks || []) if (!UNIT_IDS.has(linkedId) || linkedId === record.id) errors.push(`${path}: invalid support link ${linkedId}`);
    if (!Array.isArray(record.upgradeDescriptor?.tags) || !record.upgradeDescriptor.tags.includes('infantry')) errors.push(`${path}: upgrade descriptor must expose infantry tag`);
    if (!Array.isArray(record.upgradeDescriptor?.abilities) || JSON.stringify(record.upgradeDescriptor.abilities) !== JSON.stringify((record.capabilities || []).map((entry) => entry.id))) errors.push(`${path}: upgrade abilities must mirror capability IDs`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 50) errors.push(`${path}: playerUse must contain actionable guidance`);
  }

  for (const id of UKRAINIAN_INFANTRY_UNIT_IDS) if (!branch.units.some((record) => record?.id === id)) errors.push(`missing required unit: ${id}`);
  for (const roleId of UKRAINIAN_INFANTRY_ROLE_IDS) if (!branch.units.some((record) => record?.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  if (branch.units.filter((record) => record?.id === 'ua.mobile-sam').length !== 1) errors.push('exact ua.mobile-sam identity must have one UFR-071 owner');

  return Object.freeze([...new Set(errors)].sort());
}

const validationErrors = validateUkrainianInfantryBranch();
if (validationErrors.length) throw new Error(`Invalid Ukrainian infantry branch: ${validationErrors.join('; ')}`);
