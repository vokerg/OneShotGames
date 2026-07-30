import { FACTION_TECH_TREES } from './faction-tech-trees.js';
import {
  ARMOR_CLASSES,
  DAMAGE_CLASSES,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
} from '../combat/combat-schema.js';

export const RUSSIAN_INFANTRY_SCHEMA_VERSION = 1;
export const RUSSIAN_INFANTRY_DOCTRINE = 'echeloned-pressure';

export const RUSSIAN_INFANTRY_ROLE_IDS = Object.freeze([
  'engineering',
  'command-support',
  'line-infantry',
  'assault',
  'anti-armor',
  'reconnaissance',
  'medical',
]);

export const RUSSIAN_INFANTRY_UNIT_IDS = Object.freeze([
  'ru.engineer-sappers',
  'ru.command-group',
  'ru.motor-rifle-squad',
  'ru.assault-group.shock',
  'ru.assault-group.anti-armor',
  'ru.scout-section',
  'ru.medical-team',
]);

export const RUSSIAN_INFANTRY_COUNTER_DOMAINS = Object.freeze([
  'infantry',
  'light-vehicles',
  'armor',
  'fortifications',
  'reconnaissance',
  'suppression',
  'fires',
  'logistics',
]);

const SIGNATURES = new Set(['very-low', 'low', 'normal', 'high']);
const STANCES = new Set(['route-preparation', 'sector-command', 'line-hold', 'assault', 'anti-armor-reserve', 'screening', 'casualty-collection']);
const ROLE_IDS = new Set(RUSSIAN_INFANTRY_ROLE_IDS);
const UNIT_IDS = new Set(RUSSIAN_INFANTRY_UNIT_IDS);
const COUNTER_DOMAINS = new Set(RUSSIAN_INFANTRY_COUNTER_DOMAINS);
const ARMOR_VALUES = new Set(Object.values(ARMOR_CLASSES));
const RESISTANCE_VALUES = new Set(Object.values(RESISTANCE_CLASSES));
const DAMAGE_VALUES = new Set(Object.values(DAMAGE_CLASSES));
const TARGET_VALUES = new Set(Object.values(TARGET_DOMAINS));
const SPLASH_VALUES = new Set(Object.values(SPLASH_CLASSES));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const weapon = ({
  id,
  damageClass,
  targetDomains = [TARGET_DOMAINS.GROUND],
  splashClass = SPLASH_CLASSES.NONE,
  range,
  damage,
  reload,
  minimumRange = 0,
  ammo = null,
}) => ({ id, damageClass, targetDomains, splashClass, range, damage, reload, minimumRange, ammo });

const capability = (id, parameters = {}) => ({ id, parameters });

const unit = ({
  id,
  rosterNodeId,
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
  replacement,
  playerUse,
}) => ({
  schemaVersion: RUSSIAN_INFANTRY_SCHEMA_VERSION,
  faction: 'russia',
  doctrine: RUSSIAN_INFANTRY_DOCTRINE,
  id,
  rosterNodeId,
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
  replacement,
  playerUse,
});

const BRANCH_UNITS = [
  unit({
    id: 'ru.engineer-sappers',
    rosterNodeId: 'ru.engineer-sappers',
    roleId: 'engineering',
    displayName: 'Russian Engineer-Sapper Section',
    shortName: 'Engineer-Sappers',
    tier: 0,
    producer: 'ru.regimental-command',
    requires: ['ru.regimental-command'],
    squadSize: 7,
    capacityCost: 1,
    cost: { metal: 62, fuel: 0, intel: 0 },
    durability: { hitPoints: 90, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 0.96 },
    mobility: { speed: 57, transportSlots: 3, setupSeconds: 0 },
    sight: 195,
    signature: 'normal',
    preferredStance: 'route-preparation',
    weapons: [weapon({ id: 'sapper-small-arms', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 120, damage: 8, reload: 1.05 })],
    capabilities: [
      capability('construction', { rate: 0.95, families: ['base', 'field-defense'] }),
      capability('field-repair', { rate: 0.8, targets: ['vehicle', 'structure'], fieldLimit: 0.55 }),
      capability('route-clearance', { mines: true, barriers: true, rubble: true }),
      capability('obstacle-preparation', { mines: true, barriers: true, trenches: true }),
    ],
    counters: ['fortifications'],
    vulnerabilities: ['suppression', 'armor'],
    supportLinks: ['ru.motor-rifle-squad', 'ru.assault-group.shock', 'ru.command-group'],
    replacement: { weight: 1, reserveEligible: true, recoverySeconds: 18 },
    playerUse: 'Prepare routes and defensive belts for following echelons, but avoid using the section as disposable assault infantry.',
  }),
  unit({
    id: 'ru.command-group',
    rosterNodeId: 'ru.command-group',
    roleId: 'command-support',
    displayName: 'Russian Regimental Command Group',
    shortName: 'Command Group',
    tier: 0,
    producer: 'ru.regimental-command',
    requires: ['ru.regimental-command'],
    squadSize: 6,
    capacityCost: 2,
    cost: { metal: 88, fuel: 0, intel: 42 },
    durability: { hitPoints: 94, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 1.05 },
    mobility: { speed: 54, transportSlots: 3, setupSeconds: 1.5 },
    sight: 240,
    signature: 'high',
    preferredStance: 'sector-command',
    weapons: [weapon({ id: 'command-security-weapons', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 115, damage: 6, reload: 1.2 })],
    capabilities: [
      capability('sector-preparation', { radius: 320, preparationSeconds: 8, maximumSectors: 2 }),
      capability('reserve-release', { minimumDelaySeconds: 5, eligibleRoles: ['line-infantry', 'assault', 'anti-armor'] }),
      capability('replacement-routing', { radius: 360, requiresSupplyPath: true }),
      capability('fire-support-request', { requiresRegisteredTarget: true, requestCooldownSeconds: 45 }),
    ],
    counters: ['suppression'],
    vulnerabilities: ['reconnaissance', 'fires'],
    supportLinks: ['ru.motor-rifle-squad', 'ru.assault-group.shock', 'ru.assault-group.anti-armor', 'ru.scout-section', 'ru.medical-team'],
    replacement: { weight: 2.2, reserveEligible: false, recoverySeconds: 36 },
    playerUse: 'Prepare a limited sector and release reserves deliberately; losing the group should disrupt coordination rather than grant passive global bonuses.',
  }),
  unit({
    id: 'ru.motor-rifle-squad',
    rosterNodeId: 'ru.motor-rifle-squad',
    roleId: 'line-infantry',
    displayName: 'Russian Motor-Rifle Squad',
    shortName: 'Motor-Rifle Squad',
    tier: 1,
    producer: 'ru.motor-rifle-barracks',
    requires: ['ru.motor-rifle-barracks'],
    squadSize: 10,
    capacityCost: 2,
    cost: { metal: 78, fuel: 0, intel: 0 },
    durability: { hitPoints: 132, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 0.98 },
    mobility: { speed: 56, transportSlots: 4, setupSeconds: 0 },
    sight: 205,
    signature: 'normal',
    preferredStance: 'line-hold',
    weapons: [
      weapon({ id: 'motor-rifle-small-arms', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 150, damage: 15, reload: 0.95 }),
      weapon({ id: 'squad-machine-gun', damageClass: DAMAGE_CLASSES.HEAVY_MACHINE_GUN, range: 175, damage: 18, reload: 2.2, ammo: 6 }),
    ],
    capabilities: [
      capability('successive-line', { replacementPriority: 1, reserveReleaseEligible: true }),
      capability('field-entrenchment', { setupSeconds: 6, coverBonus: 0.18 }),
      capability('massed-fire', { requiresFriendlyLineUnits: 2, suppressionMultiplier: 1.12 }),
      capability('limited-anti-vehicle', { damageMultiplier: 0.45, ammunition: 2 }),
    ],
    counters: ['infantry', 'reconnaissance'],
    vulnerabilities: ['armor', 'fires'],
    supportLinks: ['ru.command-group', 'ru.medical-team', 'ru.engineer-sappers', 'ru.assault-group.anti-armor'],
    replacement: { weight: 0.75, reserveEligible: true, recoverySeconds: 14 },
    playerUse: 'Hold prepared ground and absorb ordinary attrition through replacement depth, while relying on specialists against armor and fortifications.',
  }),
  unit({
    id: 'ru.assault-group.shock',
    rosterNodeId: 'ru.assault-group',
    roleId: 'assault',
    displayName: 'Russian Shock Assault Group',
    shortName: 'Shock Group',
    tier: 1,
    producer: 'ru.motor-rifle-barracks',
    requires: ['ru.motor-rifle-barracks'],
    squadSize: 8,
    capacityCost: 3,
    cost: { metal: 102, fuel: 0, intel: 8 },
    durability: { hitPoints: 118, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 1.12 },
    mobility: { speed: 59, transportSlots: 4, setupSeconds: 0 },
    sight: 195,
    signature: 'high',
    preferredStance: 'assault',
    weapons: [
      weapon({ id: 'assault-small-arms', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 125, damage: 18, reload: 0.8 }),
      weapon({ id: 'disposable-rocket', damageClass: DAMAGE_CLASSES.SHAPED_CHARGE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 110, damage: 45, reload: 7, ammo: 2 }),
      weapon({ id: 'grenade-volley', damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE, splashClass: SPLASH_CLASSES.SMALL, range: 100, damage: 28, reload: 8, ammo: 3 }),
    ],
    capabilities: [
      capability('assault-under-suppression', { incomingSuppressionMultiplier: 0.78, durationSeconds: 7 }),
      capability('close-assault', { maximumRange: 125, structureDamageMultiplier: 1.15 }),
      capability('breach-follow-through', { requiresClearedRoute: true, readinessSeconds: 3 }),
      capability('successive-echelon', { requiresLineScreen: true, reserveReleaseEligible: true }),
    ],
    counters: ['infantry', 'fortifications'],
    vulnerabilities: ['armor', 'fires'],
    supportLinks: ['ru.engineer-sappers', 'ru.command-group', 'ru.motor-rifle-squad', 'ru.medical-team'],
    replacement: { weight: 1.25, reserveEligible: true, recoverySeconds: 22 },
    playerUse: 'Exploit a prepared breach or suppressed position at close range, then rotate out before concentrated armor or indirect fire responds.',
  }),
  unit({
    id: 'ru.assault-group.anti-armor',
    rosterNodeId: 'ru.assault-group',
    roleId: 'anti-armor',
    displayName: 'Russian Anti-Armor Reserve Team',
    shortName: 'Anti-Armor Reserve',
    tier: 1,
    producer: 'ru.motor-rifle-barracks',
    requires: ['ru.motor-rifle-barracks'],
    squadSize: 5,
    capacityCost: 2,
    cost: { metal: 108, fuel: 0, intel: 12 },
    durability: { hitPoints: 78, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 0.84 },
    mobility: { speed: 53, transportSlots: 3, setupSeconds: 2.2 },
    sight: 210,
    signature: 'normal',
    preferredStance: 'anti-armor-reserve',
    weapons: [
      weapon({ id: 'anti-armor-guided-missile', damageClass: DAMAGE_CLASSES.SHAPED_CHARGE, targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE], range: 235, damage: 72, reload: 10, minimumRange: 40, ammo: 4 }),
      weapon({ id: 'reserve-team-small-arms', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 90, damage: 5, reload: 1.25 }),
    ],
    capabilities: [
      capability('prepared-kill-zone', { setupSeconds: 2.2, firstShotAccuracyMultiplier: 1.18 }),
      capability('reserve-commitment', { requiresCommandRelease: true, responseDelaySeconds: 3 }),
      capability('salvo-discipline', { maximumSimultaneousShots: 2, overkillPrevention: true }),
      capability('displace-on-order', { automaticDisplacement: false, packSeconds: 1.4 }),
    ],
    counters: ['light-vehicles', 'armor'],
    vulnerabilities: ['infantry', 'suppression'],
    supportLinks: ['ru.scout-section', 'ru.command-group', 'ru.motor-rifle-squad'],
    replacement: { weight: 1.5, reserveEligible: true, recoverySeconds: 28 },
    playerUse: 'Hold behind the first line as a command-released armor reserve; exposed teams are vulnerable to reconnaissance, suppression, and flanking infantry.',
  }),
  unit({
    id: 'ru.scout-section',
    rosterNodeId: 'ru.scout-section',
    roleId: 'reconnaissance',
    displayName: 'Russian Scout Section',
    shortName: 'Scout Section',
    tier: 1,
    producer: 'ru.motor-rifle-barracks',
    requires: ['ru.motor-rifle-barracks', 'ru.echelon-command'],
    squadSize: 5,
    capacityCost: 2,
    cost: { metal: 76, fuel: 0, intel: 28 },
    durability: { hitPoints: 72, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 0.8 },
    mobility: { speed: 65, transportSlots: 2, setupSeconds: 0 },
    sight: 290,
    signature: 'low',
    preferredStance: 'screening',
    weapons: [weapon({ id: 'scout-small-arms', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 165, damage: 9, reload: 1.1 })],
    capabilities: [
      capability('route-reconnaissance', { revealRadius: 110, detectsAmbushes: true }),
      capability('registered-target', { registrationSeconds: 4, contactQuality: 0.62 }),
      capability('screening-line', { detectionWarningSeconds: 2.5, withdrawalBias: 0.8 }),
      capability('counter-reconnaissance', { signatureComparisonBonus: 0.12 }),
    ],
    counters: ['reconnaissance', 'logistics'],
    vulnerabilities: ['infantry', 'fires'],
    supportLinks: ['ru.command-group', 'ru.assault-group.anti-armor', 'ru.assault-group.shock'],
    replacement: { weight: 1.3, reserveEligible: false, recoverySeconds: 26 },
    playerUse: 'Screen routes and register sufficient contacts for prepared action; the section is not a precision-strike substitute or durable line unit.',
  }),
  unit({
    id: 'ru.medical-team',
    rosterNodeId: 'ru.medical-team',
    roleId: 'medical',
    displayName: 'Russian Forward Medical Team',
    shortName: 'Medical Team',
    tier: 1,
    producer: 'ru.motor-rifle-barracks',
    requires: ['ru.motor-rifle-barracks'],
    squadSize: 6,
    capacityCost: 2,
    cost: { metal: 72, fuel: 0, intel: 12 },
    durability: { hitPoints: 82, armorClass: ARMOR_CLASSES.SOFT, resistanceClass: RESISTANCE_CLASSES.INFANTRY, suppressionResistance: 0.88 },
    mobility: { speed: 55, transportSlots: 3, setupSeconds: 1 },
    sight: 190,
    signature: 'normal',
    preferredStance: 'casualty-collection',
    weapons: [weapon({ id: 'medical-security-weapons', damageClass: DAMAGE_CLASSES.SMALL_ARMS, range: 95, damage: 4, reload: 1.3 })],
    capabilities: [
      capability('casualty-collection-point', { setupSeconds: 5, radius: 85 }),
      capability('forward-treatment', { rate: 7, suppressionRecoveryMultiplier: 1.18 }),
      capability('replacement-continuity', { requiresSupplyPath: true, recoveryTimeMultiplier: 0.82 }),
      capability('triage-by-echelon', { prioritizes: ['command-support', 'anti-armor', 'assault', 'line-infantry'] }),
    ],
    counters: ['suppression'],
    vulnerabilities: ['armor', 'fires'],
    supportLinks: ['ru.motor-rifle-squad', 'ru.assault-group.shock', 'ru.command-group'],
    replacement: { weight: 1.4, reserveEligible: false, recoverySeconds: 30 },
    playerUse: 'Sustain replacement continuity from a protected casualty-collection point; moving the team into direct combat should rapidly collapse its value.',
  }),
];

export const RUSSIAN_INFANTRY_BRANCH = deepFreeze({
  schemaVersion: RUSSIAN_INFANTRY_SCHEMA_VERSION,
  faction: 'russia',
  doctrine: RUSSIAN_INFANTRY_DOCTRINE,
  units: BRANCH_UNITS,
});

const TECH_TREE_RU = FACTION_TECH_TREES.factions.russia;
const TECH_NODES_BY_ID = new Map(TECH_TREE_RU.nodes.map((node) => [node.id, node]));
const BRANCH_BY_ID = new Map(RUSSIAN_INFANTRY_BRANCH.units.map((record) => [record.id, record]));

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

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && JSON.stringify(left) === JSON.stringify(right);
}

export function validateRussianInfantryBranch(branch = RUSSIAN_INFANTRY_BRANCH) {
  const errors = [];
  if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return Object.freeze(['branch must be an object']);
  if (branch.schemaVersion !== RUSSIAN_INFANTRY_SCHEMA_VERSION) errors.push(`schemaVersion must be ${RUSSIAN_INFANTRY_SCHEMA_VERSION}`);
  if (branch.faction !== 'russia') errors.push('faction must be russia');
  if (branch.doctrine !== RUSSIAN_INFANTRY_DOCTRINE) errors.push(`doctrine must be ${RUSSIAN_INFANTRY_DOCTRINE}`);
  if (TECH_TREE_RU.doctrine !== branch.doctrine) errors.push('branch doctrine must match the UFR-070 Russian doctrine');
  if (!Array.isArray(branch.units)) return Object.freeze([...errors, 'units must be an array']);

  for (const duplicate of duplicateValues(branch.units.map((record) => record?.id))) errors.push(`duplicate unit id: ${duplicate}`);
  for (const duplicate of duplicateValues(branch.units.map((record) => record?.roleId))) errors.push(`duplicate roleId: ${duplicate}`);

  for (const record of branch.units) {
    const path = record?.id || '<missing-unit-id>';
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push('unit records must be objects');
      continue;
    }
    if (record.schemaVersion !== RUSSIAN_INFANTRY_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!UNIT_IDS.has(record.id)) errors.push(`${path}: unexpected unit id`);
    if (!ROLE_IDS.has(record.roleId)) errors.push(`${path}: invalid roleId ${record.roleId}`);
    if (record.faction !== 'russia' || record.doctrine !== RUSSIAN_INFANTRY_DOCTRINE) errors.push(`${path}: faction/doctrine mismatch`);
    if (typeof record.displayName !== 'string' || !record.displayName.trim()) errors.push(`${path}: displayName is required`);
    if (typeof record.shortName !== 'string' || !record.shortName.trim()) errors.push(`${path}: shortName is required`);
    if (!Number.isInteger(record.tier) || record.tier < 0 || record.tier > 3) errors.push(`${path}: tier must be an integer from 0 to 3`);
    if (!Number.isInteger(record.squadSize) || record.squadSize <= 0) errors.push(`${path}: squadSize must be a positive integer`);
    if (!Number.isInteger(record.capacityCost) || record.capacityCost <= 0) errors.push(`${path}: capacityCost must be a positive integer`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!isNonNegativeFinite(record.cost?.[resource])) errors.push(`${path}: cost.${resource} must be non-negative and finite`);
    if (!isNonNegativeFinite(record.durability?.hitPoints) || record.durability.hitPoints <= 0) errors.push(`${path}: durability.hitPoints must be positive`);
    if (!ARMOR_VALUES.has(record.durability?.armorClass)) errors.push(`${path}: invalid armorClass`);
    if (!RESISTANCE_VALUES.has(record.durability?.resistanceClass)) errors.push(`${path}: invalid resistanceClass`);
    if (!Number.isFinite(record.durability?.suppressionResistance) || record.durability.suppressionResistance <= 0) errors.push(`${path}: suppressionResistance must be positive`);
    if (!isNonNegativeFinite(record.mobility?.speed) || record.mobility.speed <= 0) errors.push(`${path}: mobility.speed must be positive`);
    if (!Number.isInteger(record.mobility?.transportSlots) || record.mobility.transportSlots <= 0) errors.push(`${path}: transportSlots must be a positive integer`);
    if (!isNonNegativeFinite(record.mobility?.setupSeconds)) errors.push(`${path}: setupSeconds must be non-negative`);
    if (!isNonNegativeFinite(record.sight) || record.sight <= 0) errors.push(`${path}: sight must be positive`);
    if (!SIGNATURES.has(record.signature)) errors.push(`${path}: invalid signature`);
    if (!STANCES.has(record.preferredStance)) errors.push(`${path}: invalid preferredStance`);

    const techNode = TECH_NODES_BY_ID.get(record.rosterNodeId);
    if (techNode?.kind !== 'roster') errors.push(`${path}: missing UFR-070 roster node ${record.rosterNodeId}`);
    else {
      if (techNode.tier !== record.tier) errors.push(`${path}: tier must match UFR-070`);
      if (techNode.producer !== record.producer) errors.push(`${path}: producer must match UFR-070`);
      if (!sameArray(techNode.requires, record.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (TECH_NODES_BY_ID.get(record.producer)?.kind !== 'structure') errors.push(`${path}: producer must reference a UFR-070 structure`);
    if (!Array.isArray(record.requires) || record.requires.some((id) => !TECH_NODES_BY_ID.has(id))) errors.push(`${path}: requires contains an unknown UFR-070 node`);

    if (!Array.isArray(record.weapons) || record.weapons.length === 0) errors.push(`${path}: weapons must be non-empty`);
    for (const profile of record.weapons || []) {
      if (typeof profile.id !== 'string' || !profile.id) errors.push(`${path}: weapon id is required`);
      if (!DAMAGE_VALUES.has(profile.damageClass)) errors.push(`${path}: unknown weapon damageClass ${profile.damageClass}`);
      if (!Array.isArray(profile.targetDomains) || profile.targetDomains.length === 0 || profile.targetDomains.some((domain) => !TARGET_VALUES.has(domain))) errors.push(`${path}: weapon targetDomains are invalid`);
      if (!SPLASH_VALUES.has(profile.splashClass)) errors.push(`${path}: weapon splashClass is invalid`);
      for (const field of ['range', 'damage', 'reload', 'minimumRange']) if (!isNonNegativeFinite(profile[field])) errors.push(`${path}: weapon ${profile.id} ${field} must be non-negative and finite`);
      if (profile.reload <= 0) errors.push(`${path}: weapon ${profile.id} reload must be positive`);
      if (profile.minimumRange > profile.range) errors.push(`${path}: weapon ${profile.id} minimumRange exceeds range`);
      if (profile.ammo !== null && (!Number.isInteger(profile.ammo) || profile.ammo <= 0)) errors.push(`${path}: weapon ${profile.id} ammo must be null or a positive integer`);
    }

    if (!Array.isArray(record.capabilities) || record.capabilities.length < 3) errors.push(`${path}: capabilities must contain at least three entries`);
    for (const duplicate of duplicateValues((record.capabilities || []).map((entry) => entry?.id))) errors.push(`${path}: duplicate capability ${duplicate}`);
    if (!Array.isArray(record.counters) || record.counters.length === 0 || record.counters.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(record.vulnerabilities) || record.vulnerabilities.length === 0 || record.vulnerabilities.some((domain) => !COUNTER_DOMAINS.has(domain))) errors.push(`${path}: vulnerabilities are invalid`);
    if (!Array.isArray(record.supportLinks) || record.supportLinks.some((id) => id !== record.id && !UNIT_IDS.has(id))) errors.push(`${path}: supportLinks contain an unknown unit`);
    if (!Number.isFinite(record.replacement?.weight) || record.replacement.weight <= 0) errors.push(`${path}: replacement.weight must be positive`);
    if (typeof record.replacement?.reserveEligible !== 'boolean') errors.push(`${path}: replacement.reserveEligible must be boolean`);
    if (!isNonNegativeFinite(record.replacement?.recoverySeconds)) errors.push(`${path}: replacement.recoverySeconds must be non-negative`);
    if (typeof record.playerUse !== 'string' || record.playerUse.trim().length < 40) errors.push(`${path}: playerUse must provide actionable guidance`);
  }

  for (const id of RUSSIAN_INFANTRY_UNIT_IDS) if (!branch.units.some((record) => record.id === id)) errors.push(`missing required unit: ${id}`);
  for (const roleId of RUSSIAN_INFANTRY_ROLE_IDS) if (!branch.units.some((record) => record.roleId === roleId)) errors.push(`missing required role: ${roleId}`);

  const assaultVariants = branch.units.filter((record) => record.rosterNodeId === 'ru.assault-group').map((record) => record.id).sort();
  if (!sameArray(assaultVariants, ['ru.assault-group.anti-armor', 'ru.assault-group.shock'])) errors.push('ru.assault-group must expose shock and anti-armor variants');
  for (const record of branch.units) {
    for (const linkedId of record.supportLinks || []) {
      if (linkedId === record.id) errors.push(`${record.id}: supportLinks cannot contain itself`);
      if (!branch.units.some((candidate) => candidate.id === linkedId)) errors.push(`${record.id}: support link ${linkedId} is not present in this branch`);
    }
  }

  return Object.freeze([...new Set(errors)].sort());
}

export function getRussianInfantryUnit(unitId) {
  const record = BRANCH_BY_ID.get(unitId);
  if (!record) throw new RangeError(`Unknown Russian infantry unit: ${unitId}`);
  return record;
}

export function getRussianInfantryVariants(rosterNodeId) {
  if (typeof rosterNodeId !== 'string' || !rosterNodeId) throw new TypeError('rosterNodeId must be a non-empty string');
  const variants = RUSSIAN_INFANTRY_BRANCH.units.filter((record) => record.rosterNodeId === rosterNodeId);
  if (!variants.length) throw new RangeError(`Unknown Russian infantry roster node: ${rosterNodeId}`);
  return Object.freeze(variants.map((record) => record.id));
}

export function availableRussianInfantryUnits(completedNodeIds = []) {
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(RUSSIAN_INFANTRY_BRANCH.units
    .filter((record) => record.requires.every((id) => completed.has(id)))
    .map((record) => record.id));
}

export function summarizeRussianInfantryTaskGroup(unitIds = []) {
  if (!Array.isArray(unitIds)) throw new TypeError('unitIds must be an array');
  for (const duplicate of duplicateValues(unitIds)) throw new TypeError(`unitIds contains duplicate unit id: ${duplicate}`);
  const records = unitIds.map(getRussianInfantryUnit);
  const roles = [...new Set(records.map((record) => record.roleId))].sort();
  const counters = [...new Set(records.flatMap((record) => record.counters))].sort();
  const capabilities = [...new Set(records.flatMap((record) => record.capabilities.map((entry) => entry.id)))].sort();
  const hasCommand = roles.includes('command-support');
  const hasLine = roles.includes('line-infantry');
  const hasAssault = roles.includes('assault');
  const hasAntiArmor = roles.includes('anti-armor');
  const hasRecon = roles.includes('reconnaissance');
  const hasMedical = roles.includes('medical');
  const hasEngineers = roles.includes('engineering');
  const linkedPairs = new Set(records.flatMap((record) => record.supportLinks
    .filter((id) => unitIds.includes(id))
    .map((id) => [record.id, id].sort().join('|')))).size;
  const totalCost = { metal: 0, fuel: 0, intel: 0 };
  for (const record of records) for (const resource of Object.keys(totalCost)) totalCost[resource] += record.cost[resource];
  return deepFreeze({
    unitIds: [...unitIds],
    roles,
    counters,
    capabilities,
    totalCapacityCost: records.reduce((total, record) => total + record.capacityCost, 0),
    totalPersonnel: records.reduce((total, record) => total + record.squadSize, 0),
    totalCost,
    replacementDemand: records.reduce((total, record) => total + record.squadSize * record.replacement.weight, 0),
    reserveEligibleUnits: records.filter((record) => record.replacement.reserveEligible).map((record) => record.id),
    doctrine: {
      echelonCommand: hasCommand,
      replacementContinuity: hasLine && hasMedical && hasCommand,
      preparedAssault: hasCommand && hasAssault && hasEngineers,
      armorReserve: hasCommand && hasAntiArmor && hasRecon,
      successiveEchelonReady: hasCommand && hasLine && hasAssault && hasMedical,
      supportLinkPairs: linkedPairs,
    },
    missingCoreRoles: ['line-infantry', 'assault', 'command-support']
      .filter((roleId) => !roles.includes(roleId)),
  });
}

const validationErrors = validateRussianInfantryBranch();
if (validationErrors.length) throw new Error(`Invalid Russian infantry branch: ${validationErrors.join('; ')}`);
