import { BUILDING_TYPES, MISSIONS, UNIT_TYPES } from '../config.js';
import { TARGET_DOMAINS } from '../combat/combat-schema.js';
import {
  FACTION_TECH_TREES,
  validateFactionTechTrees,
} from './faction-tech-trees.js';
import {
  UKRAINIAN_INFANTRY_BRANCH,
  validateUkrainianInfantryBranch,
} from './ukrainian-infantry.js';

export const RUNTIME_CONTENT_SCHEMA_VERSION = 1;
export const RUNTIME_RESOURCE_IDS = Object.freeze(['metal', 'fuel', 'intel']);

export const LEGACY_RUNTIME_UNIT_ID_MIGRATIONS = Object.freeze({
  uaZelenskyy: 'uaCommandVarta',
  uaZaluzhnyi: 'uaCommandVarta',
  ruPutin: 'ruCommandBastion',
  ruPrigozhin: 'ruCommandBastion',
});

export const RUNTIME_CANONICAL_ROSTER_MAP = Object.freeze({
  uaEngineer: 'ua.combat-engineers',
  uaInfantry: 'ua.line-infantry',
  uaDrone: 'ua.recon-drone',
  uaMedic: 'ua.casevac-team',
  uaIfv: 'ua.protected-mobility',
  uaTank: 'ua.tank',
  uaArtillery: 'ua.self-propelled-artillery',
  uaCommandVarta: 'ua.command-team',
  ruEngineer: 'ru.engineer-sappers',
  ruInfantry: 'ru.motor-rifle-squad',
  ruDrone: 'ru.recon-uav',
  ruMedic: 'ru.medical-team',
  ruIfv: 'ru.apc',
  ruTank: 'ru.tank',
  ruArtillery: 'ru.self-propelled-gun',
  ruCommandBastion: 'ru.command-group',
});

export const DECLARATIVE_ROSTER_OWNERS = Object.freeze({
  'UFR-071 Ukrainian infantry': Object.freeze([
    'ua.combat-engineers', 'ua.line-infantry', 'ua.casevac-team', 'ua.command-team',
  ]),
  'UFR-072 Ukrainian mobility and armor': Object.freeze(['ua.protected-mobility', 'ua.tank']),
  'UFR-073/UFR-076 Ukrainian reconnaissance and fires': Object.freeze([
    'ua.recon-drone', 'ua.self-propelled-artillery',
  ]),
  'UFR-075 Russian infantry': Object.freeze([
    'ru.engineer-sappers', 'ru.motor-rifle-squad', 'ru.medical-team', 'ru.command-group',
  ]),
  'UFR-077 Russian mobility and armor': Object.freeze(['ru.apc', 'ru.tank']),
  'UFR-078 Russian reconnaissance and fires': Object.freeze(['ru.recon-uav', 'ru.self-propelled-gun']),
});

export const RUNTIME_BUILDING_CANONICAL_PRODUCERS = Object.freeze({
  hq: Object.freeze(['ua.command-post']),
  barracks: Object.freeze(['ua.infantry-center']),
  workshop: Object.freeze(['ua.motor-pool', 'ua.uas-ew-cell', 'ua.fires-center']),
  depot: Object.freeze(['ua.logistics-hub']),
});

const FICTIONAL_COMMAND_CHARACTERS = Object.freeze({
  uaCommandVarta: Object.freeze({
    sourceLegacyId: 'uaZelenskyy',
    name: 'Commander Varta',
    short: 'Varta',
    role: 'Fictional Ukrainian brigade command team',
    title: 'Brigade Operations Command',
    abilities: Object.freeze(['rally', 'combinedArms']),
  }),
  ruCommandBastion: Object.freeze({
    sourceLegacyId: 'ruPutin',
    name: 'Commander Bastion',
    short: 'Bastion',
    role: 'Fictional Russian regimental command group',
    title: 'Regimental Operations Command',
    abilities: Object.freeze([]),
  }),
});

const RUSSIAN_RUNTIME_ECONOMY = Object.freeze({
  ruEngineer: Object.freeze({ cost: { metal: 60 }, pop: 1 }),
  ruInfantry: Object.freeze({ cost: { metal: 75 }, pop: 2 }),
  ruDrone: Object.freeze({ cost: { metal: 70, fuel: 40 }, pop: 2 }),
  ruMedic: Object.freeze({ cost: { metal: 65, intel: 10 }, pop: 2 }),
  ruIfv: Object.freeze({ cost: { metal: 175, fuel: 95 }, pop: 4 }),
  ruTank: Object.freeze({ cost: { metal: 220, fuel: 130 }, pop: 5 }),
  ruArtillery: Object.freeze({ cost: { metal: 205, fuel: 120 }, pop: 5 }),
  ruCommandBastion: Object.freeze({ cost: { intel: 180 }, pop: 4 }),
});

const TARGETING_BY_RUNTIME_ID = Object.freeze({
  uaDrone: Object.freeze([TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE]),
  uaArtillery: Object.freeze([TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE]),
  ruDrone: Object.freeze([TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE]),
  ruArtillery: Object.freeze([TARGET_DOMAINS.GROUND, TARGET_DOMAINS.STRUCTURE]),
});
const PUBLIC_FIGURE_TOKENS = Object.freeze([
  'zelenskyy', 'zaluzhnyi', 'putin', 'prigozhin',
  'volodymyr zelenskyy', 'valerii zaluzhnyi', 'vladimir putin', 'yevgeny prigozhin',
]);
const STRICT_UNIT_ID_FIELDS = new Set(['type', 'unitType', 'unitId', 'heroId']);
const STRICT_UNIT_ID_ARRAY_FIELDS = new Set(['heroes', 'trainableHeroes', 'enemyHeroes', 'unitTypes']);
const VALID_TARGET_DOMAINS = new Set(Object.values(TARGET_DOMAINS));

let reconciled = false;
let reconciliationSnapshot = null;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function canonicalRosterNodes() {
  return new Map(
    Object.values(FACTION_TECH_TREES.factions)
      .flatMap((faction) => faction.nodes)
      .filter((node) => node.kind === 'roster')
      .map((node) => [node.id, node]),
  );
}

function normalizeCost(cost = {}) {
  return Object.fromEntries(RUNTIME_RESOURCE_IDS.map((resource) => [resource, Number(cost[resource] || 0)]));
}

function ownerByCanonicalId(owners = DECLARATIVE_ROSTER_OWNERS) {
  const result = new Map();
  for (const [owner, ids] of Object.entries(owners)) {
    for (const id of ids) if (!result.has(id)) result.set(id, owner);
  }
  return result;
}

function replaceLegacyCommandCharacters() {
  for (const [runtimeId, character] of Object.entries(FICTIONAL_COMMAND_CHARACTERS)) {
    if (UNIT_TYPES[runtimeId]) continue;
    const legacy = UNIT_TYPES[character.sourceLegacyId];
    if (!legacy) throw new Error(`Missing legacy runtime command unit: ${character.sourceLegacyId}`);
    UNIT_TYPES[runtimeId] = {
      ...legacy,
      name: character.name,
      short: character.short,
      role: character.role,
      title: character.title,
      abilities: [...character.abilities],
      fictional: true,
    };
  }
  for (const legacyId of Object.keys(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) delete UNIT_TYPES[legacyId];
}

function normalizeRussianEconomy() {
  for (const [id, economy] of Object.entries(RUSSIAN_RUNTIME_ECONOMY)) {
    if (!UNIT_TYPES[id]) throw new Error(`Missing Russian runtime unit: ${id}`);
    UNIT_TYPES[id].cost = { ...economy.cost };
    UNIT_TYPES[id].pop = economy.pop;
  }
}

function projectCanonicalMetadata() {
  const nodes = canonicalRosterNodes();
  const owners = ownerByCanonicalId();
  for (const [runtimeId, canonicalId] of Object.entries(RUNTIME_CANONICAL_ROSTER_MAP)) {
    const unit = UNIT_TYPES[runtimeId];
    const node = nodes.get(canonicalId);
    if (!unit) throw new Error(`Missing active runtime unit: ${runtimeId}`);
    if (!node) throw new Error(`Missing canonical roster node: ${canonicalId}`);
    unit.runtimeContentSchemaVersion = RUNTIME_CONTENT_SCHEMA_VERSION;
    unit.runtimeId = runtimeId;
    unit.canonicalId = canonicalId;
    unit.canonicalProducerId = node.producer;
    unit.canonicalRequires = [...node.requires];
    unit.contentOwner = owners.get(canonicalId) ?? null;
    unit.cost = normalizeCost(unit.cost);
    unit.commandCapacityCost = Number(unit.pop || 0);
    unit.targetDomains = [...(TARGETING_BY_RUNTIME_ID[runtimeId] || [TARGET_DOMAINS.GROUND])];
  }
  for (const [buildingId, producers] of Object.entries(RUNTIME_BUILDING_CANONICAL_PRODUCERS)) {
    if (!BUILDING_TYPES[buildingId]) throw new Error(`Missing runtime building projection: ${buildingId}`);
    BUILDING_TYPES[buildingId].canonicalProducerIds = [...producers];
  }
}

function migrateMissionReferences() {
  for (const mission of MISSIONS) {
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
      const migrated = (mission[field] ?? []).map((id) => LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id] ?? id);
      mission[field] = [...new Set(migrated)];
    }
    mission.objectives = (mission.objectives ?? []).map((objective) =>
      objective === 'Assemble both Ukrainian command heroes'
        ? 'Assemble the Ukrainian command team'
        : objective);
  }
}

export function migrateRuntimeUnitId(id) {
  if (typeof id !== 'string' || !id) {
    return Object.freeze({
      status: 'unsupported', id: null, legacyId: id ?? null,
      error: 'Runtime unit ID must be a non-empty string.',
    });
  }
  const migrated = LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id];
  if (migrated) return Object.freeze({ status: 'migrated', id: migrated, legacyId: id, error: null });
  if (RUNTIME_CANONICAL_ROSTER_MAP[id]) return Object.freeze({ status: 'current', id, legacyId: null, error: null });
  const canonicalMatch = Object.entries(RUNTIME_CANONICAL_ROSTER_MAP)
    .find(([, canonicalId]) => canonicalId === id)?.[0];
  if (canonicalMatch) return Object.freeze({ status: 'migrated', id: canonicalMatch, legacyId: id, error: null });
  return Object.freeze({
    status: 'unsupported', id: null, legacyId: id,
    error: `Unsupported runtime unit ID: ${id}. Update the save or configuration to a current stable ID.`,
  });
}

export function migrateRuntimeUnitIds(ids = []) {
  if (!Array.isArray(ids)) throw new TypeError('Runtime unit IDs must be an array.');
  const migratedIds = [];
  const migrations = [];
  for (const id of ids) {
    const result = migrateRuntimeUnitId(id);
    migrations.push(result);
    if (result.status === 'unsupported') {
      return deepFreeze({ status: 'unsupported', ids: [], migrations, error: result.error });
    }
    if (!migratedIds.includes(result.id)) migratedIds.push(result.id);
  }
  return deepFreeze({
    status: migrations.some((entry) => entry.status === 'migrated') ? 'migrated' : 'current',
    ids: migratedIds,
    migrations,
    error: null,
  });
}

export function migrateRuntimeContentReferences(value) {
  const errors = [];
  const migrations = [];

  function migrate(current, key = null, path = '$') {
    if (STRICT_UNIT_ID_FIELDS.has(key)) {
      const result = migrateRuntimeUnitId(current);
      migrations.push(Object.freeze({ path, ...result }));
      if (result.status === 'unsupported') { errors.push(`${path}: ${result.error}`); return current; }
      return result.id;
    }
    if (STRICT_UNIT_ID_ARRAY_FIELDS.has(key)) {
      const result = migrateRuntimeUnitIds(current);
      migrations.push(...result.migrations.map((entry) => Object.freeze({ path, ...entry })));
      if (result.status === 'unsupported') { errors.push(`${path}: ${result.error}`); return current; }
      return [...result.ids];
    }
    if (Array.isArray(current)) return current.map((entry, index) => migrate(entry, null, `${path}[${index}]`));
    if (!current || typeof current !== 'object') return current;
    const migrated = {};
    for (const childKey of Object.keys(current).sort()) {
      migrated[childKey] = migrate(current[childKey], childKey, `${path}.${childKey}`);
    }
    return migrated;
  }

  const migratedValue = migrate(value);
  return deepFreeze({
    status: errors.length ? 'unsupported' : migrations.some((entry) => entry.status === 'migrated') ? 'migrated' : 'current',
    value: migratedValue,
    migrations,
    errors,
  });
}

export function validateStableRosterOwnership(owners = DECLARATIVE_ROSTER_OWNERS) {
  const claimed = new Map();
  const errors = [];
  for (const [owner, ids] of Object.entries(owners || {})) {
    if (!Array.isArray(ids)) { errors.push(`${owner}: roster ownership must be an array`); continue; }
    for (const id of ids) {
      if (claimed.has(id)) errors.push(`${id}: duplicate stable roster ownership in ${claimed.get(id)} and ${owner}`);
      else claimed.set(id, owner);
    }
  }
  return deepFreeze(errors.sort());
}

export function validateActiveRuntimeContent({
  unitTypes = UNIT_TYPES,
  buildingTypes = BUILDING_TYPES,
  missions = MISSIONS,
  owners = DECLARATIVE_ROSTER_OWNERS,
} = {}) {
  const errors = [];
  errors.push(...validateFactionTechTrees().map((error) => `UFR-070: ${error}`));
  errors.push(...validateUkrainianInfantryBranch().map((error) => `UFR-071: ${error}`));
  errors.push(...validateStableRosterOwnership(owners));

  const rosterNodes = canonicalRosterNodes();
  const canonicalIds = new Set();
  const allowedResources = new Set(RUNTIME_RESOURCE_IDS);
  const knownRuntimeIds = new Set(Object.keys(RUNTIME_CANONICAL_ROSTER_MAP));
  const ownerIndex = ownerByCanonicalId(owners);

  for (const legacyId of Object.keys(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    if (unitTypes[legacyId]) errors.push(`legacy public-figure unit ID remains active: ${legacyId}`);
  }
  for (const id of Object.keys(unitTypes)) if (!knownRuntimeIds.has(id)) errors.push(`${id}: missing canonical roster mapping`);

  for (const [id, canonicalId] of Object.entries(RUNTIME_CANONICAL_ROSTER_MAP)) {
    const unit = unitTypes[id];
    const node = rosterNodes.get(canonicalId);
    if (!unit) { errors.push(`${id}: runtime unit is missing`); continue; }
    const publicText = `${id} ${unit.name ?? ''} ${unit.short ?? ''} ${unit.role ?? ''}`.toLowerCase();
    for (const token of PUBLIC_FIGURE_TOKENS) {
      if (publicText.includes(token)) errors.push(`${id}: active runtime content contains public-figure token ${token}`);
    }
    if (canonicalIds.has(canonicalId)) errors.push(`${canonicalId}: multiple active runtime IDs project one canonical roster identity`);
    canonicalIds.add(canonicalId);
    if (!node) errors.push(`${id}: canonical roster node ${canonicalId} does not exist`);
    if (unit.canonicalId !== canonicalId) errors.push(`${id}: canonicalId must be ${canonicalId}`);
    if (unit.canonicalProducerId !== node?.producer) errors.push(`${id}: canonical producer must be ${node?.producer}`);
    if (JSON.stringify(unit.canonicalRequires) !== JSON.stringify(node?.requires || [])) errors.push(`${id}: ordered prerequisites drift from ${canonicalId}`);
    if (unit.contentOwner !== ownerIndex.get(canonicalId)) errors.push(`${id}: content owner drift for ${canonicalId}`);
    if (!Number.isInteger(unit.commandCapacityCost) || unit.commandCapacityCost <= 0 || unit.commandCapacityCost !== unit.pop) {
      errors.push(`${id}: command-capacity cost must be a positive integer equal to pop`);
    }
    const costKeys = Object.keys(unit.cost ?? {});
    if (JSON.stringify(costKeys) !== JSON.stringify(RUNTIME_RESOURCE_IDS)) errors.push(`${id}: cost must use exactly metal, fuel, intel`);
    if (costKeys.some((resource) => !allowedResources.has(resource) || !Number.isFinite(unit.cost[resource]) || unit.cost[resource] < 0)) {
      errors.push(`${id}: resource costs must be non-negative finite values`);
    }
    if (RUNTIME_RESOURCE_IDS.every((resource) => unit.cost[resource] === 0)) errors.push(`${id}: runtime unit must have a non-zero cost`);
    if (!Array.isArray(unit.targetDomains) || !unit.targetDomains.length || unit.targetDomains.some((domain) => !VALID_TARGET_DOMAINS.has(domain))) {
      errors.push(`${id}: invalid targetDomains`);
    }
  }

  for (const [buildingId, canonicalProducers] of Object.entries(RUNTIME_BUILDING_CANONICAL_PRODUCERS)) {
    const building = buildingTypes[buildingId];
    if (!building) { errors.push(`${buildingId}: runtime building is missing`); continue; }
    if (JSON.stringify(building.canonicalProducerIds) !== JSON.stringify(canonicalProducers)) errors.push(`${buildingId}: canonical producer projection drift`);
    for (const runtimeId of building.produces ?? []) {
      const unit = unitTypes[runtimeId];
      if (!unit) errors.push(`${buildingId}: produces unknown runtime unit ${runtimeId}`);
      else if (!canonicalProducers.includes(unit.canonicalProducerId)) {
        errors.push(`${buildingId}: ${runtimeId} maps to producer ${unit.canonicalProducerId}, outside the runtime building projection`);
      }
    }
  }

  const missionIds = new Set();
  for (const mission of missions) {
    if (missionIds.has(mission.id)) errors.push(`duplicate mission ID: ${mission.id}`);
    missionIds.add(mission.id);
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
      const references = mission[field] ?? [];
      if (!Array.isArray(references)) { errors.push(`${mission.id}: ${field} must be an array`); continue; }
      if (new Set(references).size !== references.length) errors.push(`${mission.id}: ${field} contains duplicate runtime IDs`);
      for (const id of references) {
        if (!unitTypes[id]) errors.push(`${mission.id}: ${field} references unknown unit ${id}`);
        else if (!unitTypes[id].hero || unitTypes[id].fictional !== true) errors.push(`${mission.id}: ${field} reference ${id} is not a fictional command character`);
        if (LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id]) errors.push(`${mission.id}: ${field} retains legacy ID ${id}`);
      }
    }
  }

  const infantryIds = new Set();
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units ?? []) {
    if (infantryIds.has(unit.id)) errors.push(`UFR-071 duplicate stable roster ownership: ${unit.id}`);
    infantryIds.add(unit.id);
  }
  return deepFreeze([...new Set(errors)].sort());
}

export function reconcileActiveRuntimeContent() {
  if (reconciled) return reconciliationSnapshot;
  replaceLegacyCommandCharacters();
  normalizeRussianEconomy();
  projectCanonicalMetadata();
  migrateMissionReferences();
  const errors = validateActiveRuntimeContent();
  if (errors.length) throw new Error(`Runtime content reconciliation failed:\n- ${errors.join('\n- ')}`);
  reconciled = true;
  reconciliationSnapshot = deepFreeze({
    schemaVersion: RUNTIME_CONTENT_SCHEMA_VERSION,
    migratedLegacyIds: cloneJson(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS),
    runtimeUnitIds: Object.keys(UNIT_TYPES).sort(),
    missionIds: MISSIONS.map((mission) => mission.id),
    canonicalRosterMap: cloneJson(RUNTIME_CANONICAL_ROSTER_MAP),
    buildingProjections: cloneJson(RUNTIME_BUILDING_CANONICAL_PRODUCERS),
  });
  return reconciliationSnapshot;
}
