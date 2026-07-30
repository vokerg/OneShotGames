import { FACTION_TECH_TREES } from './faction-tech-trees.js';

export const SHARED_SUPPORT_SCHEMA_VERSION = 1;
export const SUPPORT_FACTIONS = Object.freeze(['ukraine', 'russia']);
export const SUPPORT_ROLE_IDS = Object.freeze([
  'logistics',
  'resupply',
  'transport',
  'command',
  'recovery',
  'bridging',
  'off-map-support',
]);
export const SUPPORT_RESOURCE_TYPES = Object.freeze(['metal', 'fuel', 'intel', 'ammunition', 'repair-parts']);

const ROLE_IDS = new Set(SUPPORT_ROLE_IDS);
const RESOURCE_TYPES = new Set(SUPPORT_RESOURCE_TYPES);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const FACTION_PREFIX = Object.freeze({ ukraine: 'ua.', russia: 'ru.' });
const PROFILE_FACTIONS = new Set(SUPPORT_FACTIONS);
const TRANSPORT_BLOCKED_POLICIES = new Set(['retain-cargo']);
const TRANSPORT_DESTRUCTION_POLICIES = new Set(['catastrophic-loss']);
const TARGETING_MODES = new Set(['point', 'area', 'region']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function supportProfile({
  id,
  faction,
  rosterNodeId,
  roleId,
  displayName,
  tier,
  producer,
  requires,
  cost,
  capacityCost,
  mechanics,
  supportLinks,
  counters,
  vulnerabilities,
  playerUse,
}) {
  return {
    schemaVersion: SHARED_SUPPORT_SCHEMA_VERSION,
    id,
    faction,
    doctrine: FACTION_TECH_TREES.factions[faction].doctrine,
    rosterNodeId,
    roleId,
    displayName,
    tier,
    producer,
    requires,
    cost,
    capacityCost,
    mechanics,
    supportLinks,
    counters,
    vulnerabilities,
    playerUse,
  };
}

const PROFILES = [
  supportProfile({
    id: 'ua.support.mobile-logistics', faction: 'ukraine', rosterNodeId: 'ua.logistics-section', roleId: 'logistics',
    displayName: 'Ukrainian Mobile Logistics Section', tier: 1, producer: 'ua.logistics-hub', requires: ['ua.logistics-hub'],
    cost: { metal: 95, fuel: 55, intel: 10 }, capacityCost: 2,
    mechanics: { stockCapacity: 360, deliveryRadius: 150, throughputPerSecond: 20, routeMode: 'distributed', resources: ['fuel', 'ammunition', 'repair-parts'] },
    supportLinks: ['ua.support.forward-resupply', 'ua.support.protected-transport', 'ua.support.armored-recovery'],
    counters: ['sustainment', 'dispersed-operations'], vulnerabilities: ['interdiction', 'direct-fire'],
    playerUse: 'Disperse supply close enough to reduce turnaround time while keeping the section outside direct-fire and counter-battery zones.',
  }),
  supportProfile({
    id: 'ua.support.forward-resupply', faction: 'ukraine', rosterNodeId: 'ua.logistics-section', roleId: 'resupply',
    displayName: 'Ukrainian Forward Resupply Team', tier: 1, producer: 'ua.logistics-hub', requires: ['ua.logistics-hub'],
    cost: { metal: 70, fuel: 35, intel: 15 }, capacityCost: 1,
    mechanics: { transferRatePerSecond: 14, serviceRadius: 90, maximumReceivers: 3, interruptionSeconds: 2, resources: ['ammunition', 'repair-parts'] },
    supportLinks: ['ua.support.mobile-logistics', 'ua.support.distributed-command'],
    counters: ['tempo', 'fires-endurance'], vulnerabilities: ['suppression', 'drone-detection'],
    playerUse: 'Stage behind firing positions to restore ammunition and repair-part stocks, then displace before reconnaissance fixes the team.',
  }),
  supportProfile({
    id: 'ua.support.protected-transport', faction: 'ukraine', rosterNodeId: 'ua.protected-mobility', roleId: 'transport',
    displayName: 'Ukrainian Support Transport', tier: 1, producer: 'ua.motor-pool', requires: ['ua.motor-pool'],
    cost: { metal: 120, fuel: 65, intel: 5 }, capacityCost: 3,
    mechanics: { capacity: 8, passengerDomains: ['infantry', 'support'], embarkSeconds: 2.4, disembarkSeconds: 2, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    supportLinks: ['ua.support.mobile-logistics', 'ua.support.mobile-bridge'],
    counters: ['mobility', 'casualty-evacuation'], vulnerabilities: ['mines', 'anti-armor'],
    playerUse: 'Move small support detachments between dispersed sectors and preserve them from small-arms fire without treating the carrier as a frontline fighting vehicle.',
  }),
  supportProfile({
    id: 'ua.support.distributed-command', faction: 'ukraine', rosterNodeId: 'ua.command-team', roleId: 'command',
    displayName: 'Ukrainian Distributed Command Team', tier: 0, producer: 'ua.command-post', requires: ['ua.command-post'],
    cost: { metal: 80, fuel: 15, intel: 45 }, capacityCost: 2,
    mechanics: { commandRadius: 220, commandBudget: 4, retaskCooldownMultiplier: 0.8, linkMode: 'distributed', observationSharing: true },
    supportLinks: ['ua.support.forward-resupply', 'ua.support.off-map-coordination'],
    counters: ['reaction-time', 'coordination'], vulnerabilities: ['jamming', 'decapitation'],
    playerUse: 'Keep separated task groups inside a resilient command network and relocate the team when electronic warfare or direct attack threatens the link.',
  }),
  supportProfile({
    id: 'ua.support.armored-recovery', faction: 'ukraine', rosterNodeId: 'ua.recovery-vehicle', roleId: 'recovery',
    displayName: 'Ukrainian Armored Recovery Support', tier: 2, producer: 'ua.motor-pool', requires: ['ua.motor-pool', 'ua.mobile-recovery'],
    cost: { metal: 190, fuel: 105, intel: 25 }, capacityCost: 4,
    mechanics: { repairRateMultiplier: 1.35, fieldRepairCap: 0.75, towSpeedMultiplier: 0.5, maximumContributors: 2, modifierHook: 'ua.mobile-recovery' },
    supportLinks: ['ua.support.mobile-logistics', 'ua.support.protected-transport'],
    counters: ['attrition', 'disabled-vehicles'], vulnerabilities: ['armor', 'fires'],
    playerUse: 'Recover disabled premium vehicles and shorten replacement cycles while remaining behind the direct-fire line and inside logistics coverage.',
  }),
  supportProfile({
    id: 'ua.support.mobile-bridge', faction: 'ukraine', rosterNodeId: 'ua.breaching-section', roleId: 'bridging',
    displayName: 'Ukrainian Mobile Bridge Section', tier: 2, producer: 'ua.engineer-park', requires: ['ua.engineer-park'],
    cost: { metal: 175, fuel: 90, intel: 25 }, capacityCost: 4,
    mechanics: { maximumSpanCells: 5, deploySeconds: 14, recoverSeconds: 10, movementLayers: ['ground'], loadClass: 'heavy', crossings: 2 },
    supportLinks: ['ua.support.protected-transport', 'ua.support.distributed-command'],
    counters: ['river-obstacles', 'route-denial'], vulnerabilities: ['fires', 'mines'],
    playerUse: 'Create alternate crossing points for mobile groups, protect the deployment window, and recover the bridge before the enemy concentrates fires.',
  }),
  supportProfile({
    id: 'ua.support.off-map-coordination', faction: 'ukraine', rosterNodeId: 'ua.command-team', roleId: 'off-map-support',
    displayName: 'Ukrainian Off-map Coordination Cell', tier: 0, producer: 'ua.command-post', requires: ['ua.command-post'],
    cost: { metal: 60, fuel: 0, intel: 70 }, capacityCost: 1,
    mechanics: { targetingMode: 'area', commandPointCost: 2, callDelaySeconds: 5, cooldownSeconds: 70, requiresObservedContact: true, effectFamily: 'precision-support' },
    supportLinks: ['ua.support.distributed-command', 'ua.support.forward-resupply'],
    counters: ['fortifications', 'fires'], vulnerabilities: ['jamming', 'poor-contact-quality'],
    playerUse: 'Spend limited command capacity on observed targets, preserving the call for high-value moments instead of using it as unrestricted artillery.',
  }),
  supportProfile({
    id: 'ru.support.supply-column', faction: 'russia', rosterNodeId: 'ru.supply-column', roleId: 'logistics',
    displayName: 'Russian Supply Column', tier: 1, producer: 'ru.supply-depot', requires: ['ru.supply-depot'],
    cost: { metal: 105, fuel: 70, intel: 0 }, capacityCost: 3,
    mechanics: { stockCapacity: 520, deliveryRadius: 120, throughputPerSecond: 28, routeMode: 'prepared', resources: ['fuel', 'ammunition', 'repair-parts'] },
    supportLinks: ['ru.support.forward-ammunition', 'ru.support.mass-transport', 'ru.support.repair-tractor'],
    counters: ['sustainment', 'replacement-depth'], vulnerabilities: ['route-interdiction', 'drone-detection'],
    playerUse: 'Exploit high throughput along prepared routes, but secure the route and avoid exposing the concentrated column to reconnaissance-strike attacks.',
  }),
  supportProfile({
    id: 'ru.support.forward-ammunition', faction: 'russia', rosterNodeId: 'ru.supply-column', roleId: 'resupply',
    displayName: 'Russian Forward Ammunition Detachment', tier: 1, producer: 'ru.supply-depot', requires: ['ru.supply-depot'],
    cost: { metal: 85, fuel: 45, intel: 0 }, capacityCost: 2,
    mechanics: { transferRatePerSecond: 20, serviceRadius: 75, maximumReceivers: 5, interruptionSeconds: 3, resources: ['ammunition'] },
    supportLinks: ['ru.support.supply-column', 'ru.support.regimental-command'],
    counters: ['fires-endurance', 'successive-echelons'], vulnerabilities: ['interdiction', 'close-assault'],
    playerUse: 'Feed several firing units from a prepared position, accepting lower mobility in exchange for sustained volume and rapid ammunition transfer.',
  }),
  supportProfile({
    id: 'ru.support.mass-transport', faction: 'russia', rosterNodeId: 'ru.apc', roleId: 'transport',
    displayName: 'Russian Support APC', tier: 1, producer: 'ru.armored-park', requires: ['ru.armored-park'],
    cost: { metal: 110, fuel: 60, intel: 0 }, capacityCost: 3,
    mechanics: { capacity: 10, passengerDomains: ['infantry', 'support'], embarkSeconds: 2.8, disembarkSeconds: 2.4, blockedExitPolicy: 'retain-cargo', destructionPolicy: 'catastrophic-loss' },
    supportLinks: ['ru.support.supply-column', 'ru.support.pontoon-bridge'],
    counters: ['massing', 'mobility'], vulnerabilities: ['anti-armor', 'mines'],
    playerUse: 'Move larger support groups in one lift and accept higher exposure risk when concentrating vehicles on predictable routes.',
  }),
  supportProfile({
    id: 'ru.support.regimental-command', faction: 'russia', rosterNodeId: 'ru.command-group', roleId: 'command',
    displayName: 'Russian Regimental Command Group', tier: 0, producer: 'ru.regimental-command', requires: ['ru.regimental-command'],
    cost: { metal: 95, fuel: 20, intel: 35 }, capacityCost: 3,
    mechanics: { commandRadius: 270, commandBudget: 6, retaskCooldownMultiplier: 1, linkMode: 'echeloned', reserveRelease: true },
    supportLinks: ['ru.support.forward-ammunition', 'ru.support.off-map-fires'],
    counters: ['prepared-defense', 'reserve-control'], vulnerabilities: ['decapitation', 'route-disruption'],
    playerUse: 'Coordinate prepared sectors and release reserves from a larger command footprint, keeping the group protected because its loss slows the whole formation.',
  }),
  supportProfile({
    id: 'ru.support.repair-tractor', faction: 'russia', rosterNodeId: 'ru.repair-tractor', roleId: 'recovery',
    displayName: 'Russian Armored Repair Tractor', tier: 2, producer: 'ru.armored-park', requires: ['ru.armored-park', 'ru.replacement-depth'],
    cost: { metal: 170, fuel: 95, intel: 10 }, capacityCost: 4,
    mechanics: { repairRateMultiplier: 1.15, fieldRepairCap: 0.7, towSpeedMultiplier: 0.42, maximumContributors: 3, modifierHook: 'ru.replacement-depth' },
    supportLinks: ['ru.support.supply-column', 'ru.support.mass-transport'],
    counters: ['attrition', 'formation-recovery'], vulnerabilities: ['fires', 'anti-armor'],
    playerUse: 'Restore multiple damaged vehicles behind prepared lines and rely on replacement depth rather than exposing the tractor during the assault.',
  }),
  supportProfile({
    id: 'ru.support.pontoon-bridge', faction: 'russia', rosterNodeId: 'ru.assault-engineers', roleId: 'bridging',
    displayName: 'Russian Pontoon Bridge Detachment', tier: 2, producer: 'ru.engineer-battalion', requires: ['ru.engineer-battalion'],
    cost: { metal: 205, fuel: 120, intel: 5 }, capacityCost: 5,
    mechanics: { maximumSpanCells: 7, deploySeconds: 20, recoverSeconds: 16, movementLayers: ['ground'], loadClass: 'heavy', crossings: 3 },
    supportLinks: ['ru.support.mass-transport', 'ru.support.regimental-command'],
    counters: ['river-obstacles', 'operational-mass'], vulnerabilities: ['fires', 'reconnaissance'],
    playerUse: 'Open a high-capacity prepared crossing for successive echelons, accepting a longer deployment window that requires air defense and counter-battery cover.',
  }),
  supportProfile({
    id: 'ru.support.off-map-fires', faction: 'russia', rosterNodeId: 'ru.command-group', roleId: 'off-map-support',
    displayName: 'Russian Off-map Fires Coordination', tier: 0, producer: 'ru.regimental-command', requires: ['ru.regimental-command'],
    cost: { metal: 70, fuel: 0, intel: 55 }, capacityCost: 2,
    mechanics: { targetingMode: 'region', commandPointCost: 3, callDelaySeconds: 8, cooldownSeconds: 85, requiresObservedContact: false, effectFamily: 'prepared-area-support' },
    supportLinks: ['ru.support.regimental-command', 'ru.support.forward-ammunition'],
    counters: ['area-denial', 'fortifications'], vulnerabilities: ['displacement', 'counter-battery'],
    playerUse: 'Prepare broad area support against a designated sector, trading precision and reaction speed for persistence and reduced contact-quality dependence.',
  }),
];

export const SHARED_SUPPORT_SYSTEMS = deepFreeze({
  schemaVersion: SHARED_SUPPORT_SCHEMA_VERSION,
  profiles: PROFILES,
});

export const SUPPORT_PROFILE_IDS = Object.freeze(PROFILES.map((profile) => profile.id));
const PROFILE_IDS = new Set(SUPPORT_PROFILE_IDS);
const PROFILES_BY_ID = new Map(PROFILES.map((profile) => [profile.id, profile]));

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated].sort();
}

function nonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function validateMechanics(errors, profile) {
  const path = profile.id;
  const mechanics = profile.mechanics;
  if (!mechanics || typeof mechanics !== 'object' || Array.isArray(mechanics)) {
    errors.push(`${path}: mechanics must be an object`);
    return;
  }
  if (profile.roleId === 'logistics') {
    if (!(mechanics.stockCapacity > 0) || !(mechanics.deliveryRadius > 0) || !(mechanics.throughputPerSecond > 0)) errors.push(`${path}: logistics capacities must be positive`);
    if (!Array.isArray(mechanics.resources) || mechanics.resources.some((item) => !RESOURCE_TYPES.has(item))) errors.push(`${path}: logistics resources are invalid`);
  } else if (profile.roleId === 'resupply') {
    if (!(mechanics.transferRatePerSecond > 0) || !(mechanics.serviceRadius > 0) || !Number.isInteger(mechanics.maximumReceivers) || mechanics.maximumReceivers <= 0) errors.push(`${path}: resupply rates are invalid`);
    if (!Array.isArray(mechanics.resources) || mechanics.resources.some((item) => !RESOURCE_TYPES.has(item))) errors.push(`${path}: resupply resources are invalid`);
  } else if (profile.roleId === 'transport') {
    if (!Number.isInteger(mechanics.capacity) || mechanics.capacity <= 0) errors.push(`${path}: transport capacity must be positive`);
    if (!TRANSPORT_BLOCKED_POLICIES.has(mechanics.blockedExitPolicy)) errors.push(`${path}: transport blocked-exit policy must match UFR-026`);
    if (!TRANSPORT_DESTRUCTION_POLICIES.has(mechanics.destructionPolicy)) errors.push(`${path}: transport destruction policy must match UFR-026`);
  } else if (profile.roleId === 'command') {
    if (!(mechanics.commandRadius > 0) || !Number.isInteger(mechanics.commandBudget) || mechanics.commandBudget <= 0) errors.push(`${path}: command envelope is invalid`);
  } else if (profile.roleId === 'recovery') {
    if (!(mechanics.repairRateMultiplier > 0) || !(mechanics.fieldRepairCap > 0 && mechanics.fieldRepairCap <= 1) || !(mechanics.towSpeedMultiplier > 0 && mechanics.towSpeedMultiplier <= 1)) errors.push(`${path}: recovery envelope is invalid`);
    if (typeof mechanics.modifierHook !== 'string' || !mechanics.modifierHook) errors.push(`${path}: recovery modifierHook is required`);
  } else if (profile.roleId === 'bridging') {
    if (!Number.isInteger(mechanics.maximumSpanCells) || mechanics.maximumSpanCells <= 0 || !(mechanics.deploySeconds > 0) || !Array.isArray(mechanics.movementLayers) || !mechanics.movementLayers.includes('ground')) errors.push(`${path}: bridge deployment envelope is invalid`);
  } else if (profile.roleId === 'off-map-support') {
    if (!TARGETING_MODES.has(mechanics.targetingMode) || !Number.isInteger(mechanics.commandPointCost) || mechanics.commandPointCost <= 0 || !(mechanics.callDelaySeconds >= 0) || !(mechanics.cooldownSeconds > 0)) errors.push(`${path}: off-map support envelope is invalid`);
  }
}

export function validateSharedSupportSystems(data = SHARED_SUPPORT_SYSTEMS) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return Object.freeze(['support systems must be an object']);
  if (data.schemaVersion !== SHARED_SUPPORT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${SHARED_SUPPORT_SCHEMA_VERSION}`);
  if (!Array.isArray(data.profiles)) return Object.freeze([...errors, 'profiles must be an array']);
  for (const duplicate of duplicates(data.profiles.map((profile) => profile?.id))) errors.push(`duplicate support profile id: ${duplicate}`);

  for (const profile of data.profiles) {
    const path = profile?.id || '<missing-support-id>';
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      errors.push('support profiles must be objects');
      continue;
    }
    if (profile.schemaVersion !== SHARED_SUPPORT_SCHEMA_VERSION) errors.push(`${path}: invalid schemaVersion`);
    if (!ID_PATTERN.test(profile.id || '')) errors.push(`${path}: id must be stable`);
    if (!PROFILE_FACTIONS.has(profile.faction)) errors.push(`${path}: invalid faction`);
    if (!ROLE_IDS.has(profile.roleId)) errors.push(`${path}: invalid roleId`);
    if (!profile.id?.startsWith(FACTION_PREFIX[profile.faction] || '<invalid>')) errors.push(`${path}: wrong faction prefix`);
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) errors.push(`${path}: displayName is required`);
    if (!Number.isInteger(profile.tier) || profile.tier < 0 || profile.tier > 3) errors.push(`${path}: tier must be an integer from 0 to 3`);
    if (!Number.isInteger(profile.capacityCost) || profile.capacityCost <= 0) errors.push(`${path}: capacityCost must be positive`);
    for (const resource of ['metal', 'fuel', 'intel']) if (!nonNegativeFinite(profile.cost?.[resource])) errors.push(`${path}: cost.${resource} must be non-negative and finite`);

    const faction = FACTION_TECH_TREES.factions[profile.faction];
    const nodes = new Map(faction?.nodes?.map((node) => [node.id, node]) || []);
    const rosterNode = nodes.get(profile.rosterNodeId);
    if (profile.doctrine !== faction?.doctrine) errors.push(`${path}: doctrine must match UFR-070`);
    if (rosterNode?.kind !== 'roster') errors.push(`${path}: rosterNodeId must reference a UFR-070 roster node`);
    else {
      if (profile.tier !== rosterNode.tier) errors.push(`${path}: tier must match UFR-070`);
      if (profile.producer !== rosterNode.producer) errors.push(`${path}: producer must match UFR-070`);
      if (JSON.stringify(profile.requires) !== JSON.stringify(rosterNode.requires)) errors.push(`${path}: requires must match UFR-070 order and values`);
    }
    if (!Array.isArray(profile.supportLinks) || profile.supportLinks.some((id) => id === profile.id || !PROFILE_IDS.has(id))) errors.push(`${path}: supportLinks are invalid`);
    if (!Array.isArray(profile.counters) || profile.counters.length === 0 || profile.counters.some((item) => typeof item !== 'string' || !item)) errors.push(`${path}: counters are invalid`);
    if (!Array.isArray(profile.vulnerabilities) || profile.vulnerabilities.length === 0 || profile.vulnerabilities.some((item) => typeof item !== 'string' || !item)) errors.push(`${path}: vulnerabilities are invalid`);
    if (typeof profile.playerUse !== 'string' || profile.playerUse.trim().length < 50) errors.push(`${path}: playerUse must contain actionable guidance`);
    validateMechanics(errors, profile);
  }

  for (const faction of SUPPORT_FACTIONS) {
    const profiles = data.profiles.filter((profile) => profile.faction === faction);
    for (const roleId of SUPPORT_ROLE_IDS) if (!profiles.some((profile) => profile.roleId === roleId)) errors.push(`${faction}: missing support role ${roleId}`);
  }
  if (data.profiles.filter((profile) => profile.faction === 'ukraine').length !== data.profiles.filter((profile) => profile.faction === 'russia').length) errors.push('factions must expose equally complete support catalogs');
  return Object.freeze([...new Set(errors)].sort());
}

export function getSupportProfile(profileId) {
  const profile = PROFILES_BY_ID.get(profileId);
  if (!profile) throw new RangeError(`Unknown support profile: ${profileId}`);
  return profile;
}

export function getFactionSupportProfiles(faction) {
  if (!PROFILE_FACTIONS.has(faction)) throw new RangeError(`Unknown support faction: ${faction}`);
  return Object.freeze(PROFILES.filter((profile) => profile.faction === faction).map((profile) => profile.id));
}

export function availableSupportProfiles(faction, completedNodeIds = []) {
  if (!PROFILE_FACTIONS.has(faction)) throw new RangeError(`Unknown support faction: ${faction}`);
  if (!Array.isArray(completedNodeIds)) throw new TypeError('completedNodeIds must be an array');
  const completed = new Set(completedNodeIds);
  return Object.freeze(PROFILES.filter((profile) => profile.faction === faction && profile.requires.every((id) => completed.has(id))).map((profile) => profile.id));
}

export function summarizeSupportTaskGroup(profileIds = []) {
  if (!Array.isArray(profileIds)) throw new TypeError('profileIds must be an array');
  for (const duplicate of duplicates(profileIds)) throw new TypeError(`profileIds contains duplicate profile id: ${duplicate}`);
  const profiles = profileIds.map(getSupportProfile);
  const factions = [...new Set(profiles.map((profile) => profile.faction))];
  if (factions.length > 1) throw new TypeError('support task groups cannot mix factions');
  const roles = [...new Set(profiles.map((profile) => profile.roleId))].sort();
  const capabilities = [...new Set(profiles.flatMap((profile) => Object.keys(profile.mechanics)))].sort();
  const linkedPairs = new Set(profiles.flatMap((profile) => profile.supportLinks.filter((id) => profileIds.includes(id)).map((id) => [profile.id, id].sort().join('|')))).size;
  return deepFreeze({
    faction: factions[0] ?? null,
    profileIds: [...profileIds],
    roles,
    capabilities,
    totalCapacityCost: profiles.reduce((total, profile) => total + profile.capacityCost, 0),
    totalCost: profiles.reduce((total, profile) => ({
      metal: total.metal + profile.cost.metal,
      fuel: total.fuel + profile.cost.fuel,
      intel: total.intel + profile.cost.intel,
    }), { metal: 0, fuel: 0, intel: 0 }),
    supportLinkPairs: linkedPairs,
    sustainmentReady: roles.includes('logistics') && roles.includes('resupply'),
    mobilityReady: roles.includes('transport') && roles.includes('bridging'),
    preservationReady: roles.includes('recovery') && roles.includes('logistics'),
    commandReady: roles.includes('command') && roles.includes('off-map-support'),
    combinedSupportReady: SUPPORT_ROLE_IDS.every((roleId) => roles.includes(roleId)),
    missingRoles: SUPPORT_ROLE_IDS.filter((roleId) => !roles.includes(roleId)),
  });
}

const validationErrors = validateSharedSupportSystems();
if (validationErrors.length) throw new Error(`Invalid shared support systems: ${validationErrors.join('; ')}`);
