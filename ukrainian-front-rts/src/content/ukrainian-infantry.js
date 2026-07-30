import { FACTION_TECH_TREES } from './faction-tech-trees.js';

export const UKRAINIAN_INFANTRY_SCHEMA_VERSION = 1;
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

export const UKRAINIAN_INFANTRY_COUNTER_DOMAINS = Object.freeze([
  'infantry',
  'light-vehicles',
  'armor',
  'drones',
  'fortifications',
  'reconnaissance',
  'suppression',
]);

const ARMOR_CLASSES = new Set(['soft', 'light']);
const DAMAGE_CLASSES = new Set(['none', 'smallArms', 'heavyMachineGun', 'shapedCharge', 'highExplosive']);
const TARGET_DOMAINS = new Set(['ground', 'air', 'structure']);
const SIGNATURES = new Set(['very-low', 'low', 'normal', 'high']);
const STANCES = new Set(['mobile', 'screening', 'ambush', 'observation', 'support', 'air-watch', 'coordination']);
const ROLE_IDS = new Set(UKRAINIAN_INFANTRY_ROLE_IDS);
const UNIT_IDS = new Set(UKRAINIAN_INFANTRY_UNIT_IDS);
const COUNTER_DOMAINS = new Set(UKRAINIAN_INFANTRY_COUNTER_DOMAINS);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const weapon = ({ id, damageClass, targetDomains, range, damage, reload, minimumRange = 0, ammo = null }) => ({
  id,
  damageClass,
  targetDomains,
  range,
  damage,
  reload,
  minimumRange,
  ammo,
});

const capability = (id, parameters = {}) => ({ id, parameters });

const unit = ({
  id,
  roleId,
  displayName,
  shortName,
  tier,
  producer,
  requires,
  squadSize,
  capacityCost,
  cost,
  durability,
  mobility,
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
  schemaVersion: UKRAINIAN_INFANTRY_SCHEMA_VERSION,
  faction: 'ukraine',
  doctrine: UKRAINIAN_INFANTRY_DOCTRINE,
  id,
  roleId,
  displayName,
  shortName,
  tier,
  producer,
  requires,
  squadSize,
  capacityCost,
  cost,
  durability,
  mobility,
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

const BRANCH_UNITS = [
  unit({
    id: 'ua.combat-engineers',
    roleId: 'engineer',
    displayName: 'Ukrainian Combat Engineer Section',
    shortName: 'Combat Engineers',
    tier: 0,
    producer: 'ua.command-post',
    requires: ['ua.command-post'],
    squadSize: 6,
    capacityCost: 1,
    cost: { metal: 70, fuel: 0, intel: 0 },
    durability: { hitPoints: 82, armorClass: 'soft', suppressionResistance: 0.95 },
    mobility: { speed: 61, transportSlots: 2, setupSeconds: 0 },
    sight: 205,
    signature: 'normal',
    preferredStance: 'mobile',
    weapons: [weapon({ id: 'service-rifles', damageClass: 'smallArms', targetDomains: ['ground'], range: 135, damage: 8, reload: 1.05 })],
    capabilities: [
      capability('construction', { rate: 1, families: ['base', 'field-defense'] }),
      capability('repair', { rate: 1, targets: ['vehicle', 'structure'], fieldLimit: 0.65 }),
      capability('obstacle-clearance', { mines: true, barriers: true }),
    ],
    counters: ['fortifications'],
    vulnerabilities: ['suppression', 'armor'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team'],
    playerUse: 'Open routes, establish forward support, and recover damaged assets without becoming a frontline assault squad.',
  }),
  unit({
    id: 'ua.line-infantry',
    roleId: 'line-infantry',
    displayName: 'Ukrainian Mechanized Infantry Squad',
    shortName: 'Mechanized Squad',
    tier: 1,
    producer: 'ua.infantry-center',
    requires: ['ua.infantry-center'],
    squadSize: 8,
    capacityCost: 2,
    cost: { metal: 90, fuel: 0, intel: 0 },
    durability: { hitPoints: 118, armorClass: 'soft', suppressionResistance: 1 },
    mobility: { speed: 60, transportSlots: 3, setupSeconds: 0 },
    sight: 225,
    signature: 'normal',
    preferredStance: 'screening',
    weapons: [
      weapon({ id: 'squad-small-arms', damageClass: 'smallArms', targetDomains: ['ground'], range: 160, damage: 14, reload: 0.95 }),
      weapon({ id: 'automatic-grenade', damageClass: 'highExplosive', targetDomains: ['ground'], range: 125, damage: 24, reload: 8, ammo: 3 }),
    ],
    capabilities: [
      capability('cover-discipline', { incomingAccuracyMultiplier: 0.86, requiresCover: true }),
      capability('local-suppression', { radius: 75, accumulation: 0.8 }),
      capability('rapid-dismount', { readinessSeconds: 2.5 }),
    ],
    counters: ['infantry', 'reconnaissance'],
    vulnerabilities: ['armor', 'suppression'],
    supportLinks: ['ua.casevac-team', 'ua.command-team', 'ua.anti-armor-team'],
    playerUse: 'Screen specialists, contest terrain, and hold short engagements while the task group concentrates effects.',
  }),
  unit({
    id: 'ua.anti-armor-team',
    roleId: 'anti-armor',
    displayName: 'Ukrainian Anti-Armor Team',
    shortName: 'Anti-Armor Team',
    tier: 1,
    producer: 'ua.infantry-center',
    requires: ['ua.infantry-center'],
    squadSize: 4,
    capacityCost: 2,
    cost: { metal: 105, fuel: 0, intel: 20 },
    durability: { hitPoints: 72, armorClass: 'soft', suppressionResistance: 0.82 },
    mobility: { speed: 57, transportSlots: 2, setupSeconds: 1.8 },
    sight: 215,
    signature: 'low',
    preferredStance: 'ambush',
    weapons: [
      weapon({ id: 'guided-anti-armor-missile', damageClass: 'shapedCharge', targetDomains: ['ground', 'structure'], range: 245, damage: 76, reload: 9.5, minimumRange: 45, ammo: 4 }),
      weapon({ id: 'personal-defense-weapons', damageClass: 'smallArms', targetDomains: ['ground'], range: 95, damage: 5, reload: 1.2 }),
    ],
    capabilities: [
      capability('prepared-ambush', { firstShotAccuracyMultiplier: 1.25, revealSeconds: 4, requiresStationary: true }),
      capability('top-attack', { heavyArmorMultiplier: 1.08, requiresContactQuality: 0.65 }),
      capability('displace-after-shot', { moveDelaySeconds: 1.2 }),
    ],
    counters: ['light-vehicles', 'armor'],
    vulnerabilities: ['infantry', 'suppression'],
    supportLinks: ['ua.recon-team', 'ua.line-infantry', 'ua.command-team'],
    playerUse: 'Create temporary armor-denial lanes, fire from prepared positions, and relocate before suppression or flanking arrives.',
  }),
  unit({
    id: 'ua.recon-team',
    roleId: 'reconnaissance',
    displayName: 'Ukrainian Reconnaissance Team',
    shortName: 'Recon Team',
    tier: 1,
    producer: 'ua.infantry-center',
    requires: ['ua.infantry-center', 'ua.distributed-c2'],
    squadSize: 4,
    capacityCost: 2,
    cost: { metal: 80, fuel: 0, intel: 35 },
    durability: { hitPoints: 68, armorClass: 'soft', suppressionResistance: 0.78 },
    mobility: { speed: 68, transportSlots: 2, setupSeconds: 0 },
    sight: 315,
    signature: 'very-low',
    preferredStance: 'observation',
    weapons: [weapon({ id: 'suppressed-small-arms', damageClass: 'smallArms', targetDomains: ['ground'], range: 175, damage: 9, reload: 1.15 })],
    capabilities: [
      capability('contact-quality', { base: 0.55, stationaryBonus: 0.25, maximum: 1 }),
      capability('forward-observer', { sharedTargetingRange: 360, requiresLineOfSight: true }),
      capability('emission-control', { detectedRangeMultiplier: 0.7, disablesWeapons: true }),
    ],
    counters: ['reconnaissance'],
    vulnerabilities: ['infantry', 'suppression'],
    supportLinks: ['ua.anti-armor-team', 'ua.mobile-sam', 'ua.command-team'],
    playerUse: 'Build high-quality contacts and observer links while avoiding direct fights and predictable sensor positions.',
  }),
  unit({
    id: 'ua.casevac-team',
    roleId: 'medical',
    displayName: 'Ukrainian CASEVAC Team',
    shortName: 'CASEVAC Team',
    tier: 1,
    producer: 'ua.infantry-center',
    requires: ['ua.infantry-center'],
    squadSize: 5,
    capacityCost: 2,
    cost: { metal: 85, fuel: 0, intel: 15 },
    durability: { hitPoints: 84, armorClass: 'soft', suppressionResistance: 0.9 },
    mobility: { speed: 64, transportSlots: 2, setupSeconds: 0 },
    sight: 210,
    signature: 'normal',
    preferredStance: 'support',
    weapons: [weapon({ id: 'defensive-small-arms', damageClass: 'smallArms', targetDomains: ['ground'], range: 105, damage: 4, reload: 1.25 })],
    capabilities: [
      capability('casualty-stabilization', { rate: 8, radius: 70, suppressionRecoveryMultiplier: 1.25 }),
      capability('casevac', { extractionSeconds: 4, protectedThreshold: 0.35 }),
      capability('triage', { prioritizes: ['critical', 'veteran', 'specialist'] }),
    ],
    counters: ['suppression'],
    vulnerabilities: ['armor', 'infantry'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team', 'ua.recon-team'],
    playerUse: 'Preserve premium squads, shorten recovery cycles, and support withdrawal rather than extending a lost engagement.',
  }),
  unit({
    id: 'ua.mobile-sam',
    roleId: 'air-defense',
    displayName: 'Ukrainian Mobile Short-Range Air-Defense Section',
    shortName: 'Mobile SHORAD',
    tier: 3,
    producer: 'ua.air-defense-site',
    requires: ['ua.air-defense-site', 'ua.layered-air-defense'],
    squadSize: 5,
    capacityCost: 3,
    cost: { metal: 145, fuel: 35, intel: 45 },
    durability: { hitPoints: 96, armorClass: 'light', suppressionResistance: 0.92 },
    mobility: { speed: 54, transportSlots: 3, setupSeconds: 2.4 },
    sight: 285,
    signature: 'high',
    preferredStance: 'air-watch',
    weapons: [
      weapon({ id: 'short-range-surface-to-air-missile', damageClass: 'shapedCharge', targetDomains: ['air'], range: 305, damage: 62, reload: 7.5, minimumRange: 35, ammo: 6 }),
      weapon({ id: 'crew-small-arms', damageClass: 'smallArms', targetDomains: ['ground'], range: 85, damage: 3, reload: 1.3 }),
    ],
    capabilities: [
      capability('air-search', { detectionRange: 345, lowAltitudeMultiplier: 1.15 }),
      capability('engagement-reservation', { maximumReservedTargets: 2, overkillPrevention: true }),
      capability('silent-watch', { signatureMultiplier: 0.55, detectionRangeMultiplier: 0.75, blocksFire: true }),
    ],
    counters: ['drones'],
    vulnerabilities: ['armor', 'fortifications'],
    supportLinks: ['ua.recon-team', 'ua.command-team', 'ua.line-infantry'],
    playerUse: 'Protect dispersed task groups from drones through mobile short-range coverage, ammunition discipline, and frequent relocation.',
  }),
  unit({
    id: 'ua.command-team',
    roleId: 'command-support',
    displayName: 'Ukrainian Distributed Command Team',
    shortName: 'Command Team',
    tier: 0,
    producer: 'ua.command-post',
    requires: ['ua.command-post'],
    squadSize: 5,
    capacityCost: 2,
    cost: { metal: 95, fuel: 0, intel: 55 },
    durability: { hitPoints: 88, armorClass: 'soft', suppressionResistance: 1.05 },
    mobility: { speed: 59, transportSlots: 2, setupSeconds: 0 },
    sight: 255,
    signature: 'high',
    preferredStance: 'coordination',
    weapons: [weapon({ id: 'command-security-weapons', damageClass: 'smallArms', targetDomains: ['ground'], range: 120, damage: 6, reload: 1.15 })],
    capabilities: [
      capability('distributed-command-link', { radius: 330, retaskDelayMultiplier: 0.75, groupLimit: 3 }),
      capability('shared-spotting', { contactQualityFloor: 0.45, requiresObserver: true }),
      capability('support-routing', { reinforcementDelayMultiplier: 0.85, recoveryDelayMultiplier: 0.85 }),
    ],
    counters: ['suppression'],
    vulnerabilities: ['reconnaissance', 'armor'],
    supportLinks: ['ua.line-infantry', 'ua.anti-armor-team', 'ua.recon-team', 'ua.casevac-team', 'ua.mobile-sam'],
    playerUse: 'Synchronize several small groups and route support quickly without becoming a global passive aura or frontline combat unit.',
  }),
];

export const UKRAINIAN_INFANTRY_BRANCH = deepFreeze({
  schemaVersion: UKRAINIAN_INFANTRY_SCHEMA_VERSION,
  faction: 'ukraine',
  doctrine: UKRAINIAN_INFANTRY_DOCTRINE,
  units: BRANCH_UNITS,
});

const TECH_TREE_UA = FACTION_TECH_TREES.factions.ukraine;
const TECH_NODES_BY_ID = new Map(TECH_TREE_UA.nodes.map((node) => [node.id, node]));
const BRANCH_BY_ID = new Map(UKRAINIAN_INFANTRY_BRANCH.units.map((record) => [record.id, record]));

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

export function validateUkrainianInfantryBranch(branch = UKRAINIAN_INFANTRY_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== UKRAINIAN_INFANTRY_SCHEMA_VERSION) errors.push(`schemaVersion must be ${UKRAINIAN_INFANTRY_SCHEMA_VERSION}`);
  if (branch.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (branch.doctrine !== UKRAINIAN_INFANTRY_DOCTRINE) errors.push(`doctrine must be ${UKRAINIAN_INFANTRY_DOCTRINE}`);
  if (TECH_TREE_UA.doctrine !== branch.doctrine) errors.push('branch doctrine must match the UFR-070 Ukrainian doctrine');
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
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId ${record.roleId}`);
    if (record.faction !== 'ukraine' || record.doctrine !== UKRAINIAN_INFANTRY_DOCTRINE) errors.push(`${path}: faction/doctrine mismatch`);
    if (typeof record.displayName !== 'string' || !record.displayName.trim()) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);
    if (!Number.isInteger(record.tier) || record.tier < 0 || record.tier > 3) errors.push(`${path}: tier must be an integer from 0 to 3`);
    if (!Number.isInteger(record.squadSize) || record.squadSize <= 0) errors.push(`${path}: squadSize must be a positive integer`);
    if (!Number.isInteger(record.capacityCost) || record.capacityCost <= 0) errors.push(`${path}: capacityCost must be a positive integer`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!isNonNegativeFinite(record.cost?.[resource])) errors.push(`${path}: cost.${resource} must be non-negative and finite`);
    if (!isNonNegativeFinite(record.durability?.hitPoints) || record.durability.hitPoints <= 0) errors.push(`${path}: durability.hitPoints must be positive`);
    if (!ARMOR_CLASSES.has(record.durability?.armorClass)) errors.push(`${path}: invalid armorClass`);
    if (!Number.isFinite(record.durability?.suppressionResistance) || record.durability.suppressionResistance <= 0) errors.push(`${path}: suppressionResistance must be positive`);
    if (!isNonNegativeFinite(record.mobility?.speed) || record.mobility.speed <= 0) errors.push(`${path}: mobility.speed must be positive`);
    if (!Number.isInteger(record.mobility?.transportSlots) || record.mobility.transportSlots <= 0) errors.push(`${path}: transportSlots must be a positive integer`);
    if (!isNonNegativeFinite(record.mobility?.setupSeconds)) errors.push(`${path}: setupSeconds must be non-negative`);
    if (!isNonNegativeFinite(record.sight) || record.sight <= 0) errors.push(`${path}: sight must be positive`);
    if (!SIGNATURES.has(record.signature)) errors.push(`${path}: invalid signature`);
    if (!STANCES.has(record.preferredStance)) errors.push(`${path}: invalid preferredStance`);

    const techNode = TECH_NODES_BY_ID.get(record.id);
    if (techNode?.kind !== 'roster') errors.push(`${path}: missing UFR-070 roster node`);
    else {
      if (techNode.tier !== record.tier) errors.push(`${path}: tier must match UFR-070`);
      if (techNode.producer !== record.producer) errors.push(`${path}: producer must match UFR-070`);
      if (JSON.stringify(techNode.requires) !== JSON.stringify(record.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (TECH_NODES_BY_ID.get(record.producer)?.kind !== 'structure') errors.push(`${path}: producer must reference a UFR-070 structure`);
    if (!Array.isArray(record.requires) || record.requires.some((id) => !TECH_NODES_BY_ID.has(id))) errors.push(`${path}: requires contains an unknown UFR-070 node`);

    if (!Array.isArray(record.weapons) || record.weapons.length === 0) errors.push(`${path}: weapons must be non-empty`);
    for (const profile of record.weapons || []) {
      if (typeof profile.id !== 'string' || !profile.id) errors.push(`${path}: weapon id is required`);
      if (!DAMAGE_CLASSES.has(profile.damageClass)) errors.push(`${path}: unknown weapon damageClass ${profile.damageClass}`);
      if (!Array.isArray(profile.targetDomains) || profile.targetDomains.length === 0 || profile.targetDomains.some((domain) => !TARGET_DOMAINS.has(domain))) errors.push(`${path}: weapon targetDomains are invalid`);
      for (const field of ['range', 'damage', 'reload', 'minimumRange']) if (!isNonNegativeFinite(profile[field])) errors.push(`${path}: weapon ${profile.id} ${field} must be non-negative and finite`);
      if (profile.reload <= 0) errors.push(`${path}: weapon ${profile.id} reload must be positive`);
      if (profile.minimumRange > profile.range) errors.push(`${path}: weapon ${profile.id} minimumRange exceeds range`);
      if (profile.ammo !== null && (!Number.isInteger(profile.ammo) || profile.ammo <= 0)) errors.push(`${path}: weapon ${profile.id} ammo must be null or a positive integer`);
    }

    if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) errors.push(`${path}: capabilities must be non-empty`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0 || record.counters.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length === 0 || record.vulnerabilities.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilities are invalid`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.some((id) => id !== record.id && !UNIT_IDS.has(id))) errors.push(`${path}: supportLinks contain an unknown unit`);
    if (typeof record.playerUse !== 'string' || !record.playerUse.trim()) errors.push(`${path}: playerUse is required`);
  }

  for (const id of UKRAINIAN_INFANTRY_UNIT_IDS) if (!branch.units.some((record) => record.id === id)) errors.push(`missing required unit: ${id}`);
  for (const roleId of UKRAINIAN_INFANTRY_ROLE_IDS) if (!branch.units.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);
  for (const record of branch.units) {
    for (const linkedId of record.supportLinks || []) {
      if (linkedId === record.id) errors.push(`${record.id}: supportLinks cannot contain itself`);
      const linked = branch.units.find((candidate) => candidate.id === linkedId);
      if (!linked) errors.push(`${record.id}: support link ${linkedId} is not present in this branch`);
    }
  }
  return Object.freeze([...new Set(errors)].sort());
}

export function getUkrainianInfantryUnit(unitId) {
  const record = BRANCH_BY_ID.get(unitId);
  if (!record) throw new RangeError(`Unknown Ukrainian infantry unit: ${unitId}`);
  return record;
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
  const records = unitIds.map(getUkrainianInfantryUnit);
  const roles = [...new Set(records.map((record) => record.roleId))].sort();
  const counters = [...new Set(records.flatMap((record) => record.counters))].sort();
  const capabilities = [...new Set(records.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const hasCommand = roles.includes('command-support');
  const hasRecon = roles.includes('reconnaissance');
  const hasMedical = roles.includes('medical');
  const hasScreen = roles.includes('line-infantry');
  const linkedPairs = records.reduce((total, record) => total + record.supportLinks.filter((id) => unitIds.includes(id)).length, 0) / 2;
  return deepFreeze({
    unitIds: [...unitIds],
    roles,
    counters,
    capabilities,
    totalCapacityCost: records.reduce((total, record) => total + record.capacityCost, 0),
    doctrine: {
      distributedCommand: hasCommand,
      contactToAction: hasCommand && hasRecon,
      casualtyPreservation: hasMedical && hasScreen,
      combinedArmsReady: hasCommand && hasRecon && hasScreen && counters.includes('armor'),
      supportLinkPairs: linkedPairs,
    },
    missingCoreRoles: ['line-infantry', 'reconnaissance', 'command-support']
      .filter((roleId) => !roles.includes(roleId)),
  });
}

const validationErrors = validateUkrainianInfantryBranch();
if (validationErrors.length) throw new Error(`Invalid Ukrainian infantry branch: ${validationErrors.join('; ')}`);
