import { BUILDING_TYPES, MISSIONS, UNIT_TYPES } from '../config.js';
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
  uaZaluzhnyi: 'uaCommandSapsan',
  ruPutin: 'ruCommandBastion',
  ruPrigozhin: 'ruCommandGranit',
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
  uaCommandSapsan: 'ua.command-team',
  ruEngineer: 'ru.engineer-sappers',
  ruInfantry: 'ru.motor-rifle-squad',
  ruDrone: 'ru.recon-uav',
  ruMedic: 'ru.medical-team',
  ruIfv: 'ru.apc',
  ruTank: 'ru.tank',
  ruArtillery: 'ru.self-propelled-gun',
  ruCommandBastion: 'ru.command-group',
  ruCommandGranit: 'ru.assault-group',
});

const RUNTIME_BUILDING_CANONICAL_PRODUCERS = Object.freeze({
  hq: Object.freeze(['ua.command-post']),
  barracks: Object.freeze(['ua.infantry-center']),
  workshop: Object.freeze(['ua.motor-pool', 'ua.uas-ew-cell', 'ua.fires-center']),
  depot: Object.freeze(['ua.logistics-hub']),
});

const FICTIONAL_COMMAND_CHARACTERS = Object.freeze({
  uaCommandVarta: Object.freeze({
    legacyId: 'uaZelenskyy',
    name: 'Commander Varta',
    short: 'Varta',
    role: 'National defence coordination',
    title: 'National Command',
  }),
  uaCommandSapsan: Object.freeze({
    legacyId: 'uaZaluzhnyi',
    name: 'Commander Sapsan',
    short: 'Sapsan',
    role: 'Joint-force operational coordination',
    title: 'Strategic Command',
  }),
  ruCommandBastion: Object.freeze({
    legacyId: 'ruPutin',
    name: 'General Bastion',
    short: 'Bastion',
    role: 'Echeloned national command',
    title: 'National Command',
  }),
  ruCommandGranit: Object.freeze({
    legacyId: 'ruPrigozhin',
    name: 'Commander Granit',
    short: 'Granit',
    role: 'Independent assault-group command',
    title: 'Assault Command',
  }),
});

const RUSSIAN_RUNTIME_ECONOMY = Object.freeze({
  ruEngineer: Object.freeze({ cost: Object.freeze({ metal: 60 }), pop: 1 }),
  ruInfantry: Object.freeze({ cost: Object.freeze({ metal: 75 }), pop: 2 }),
  ruDrone: Object.freeze({ cost: Object.freeze({ metal: 70, fuel: 40 }), pop: 2 }),
  ruMedic: Object.freeze({ cost: Object.freeze({ metal: 65, intel: 10 }), pop: 2 }),
  ruIfv: Object.freeze({ cost: Object.freeze({ metal: 175, fuel: 95 }), pop: 4 }),
  ruTank: Object.freeze({ cost: Object.freeze({ metal: 220, fuel: 130 }), pop: 5 }),
  ruArtillery: Object.freeze({ cost: Object.freeze({ metal: 205, fuel: 120 }), pop: 5 }),
  ruCommandBastion: Object.freeze({ cost: Object.freeze({ intel: 180 }), pop: 4 }),
  ruCommandGranit: Object.freeze({ cost: Object.freeze({ intel: 200 }), pop: 4 }),
});

const PUBLIC_FIGURE_TOKENS = Object.freeze([
  'zelenskyy',
  'zaluzhnyi',
  'putin',
  'prigozhin',
  'volodymyr zelenskyy',
  'valerii zaluzhnyi',
  'vladimir putin',
  'yevgeny prigozhin',
]);

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

function factionForRuntimeId(id) {
  if (id.startsWith('ua')) return 'ukraine';
  if (id.startsWith('ru')) return 'russia';
  return null;
}

function canonicalRosterNodes() {
  return new Map(
    Object.values(FACTION_TECH_TREES.factions)
      .flatMap((faction) => faction.nodes)
      .filter((node) => node.kind === 'roster')
      .map((node) => [node.id, node]),
  );
}

function replaceLegacyCommandCharacters() {
  for (const [runtimeId, character] of Object.entries(FICTIONAL_COMMAND_CHARACTERS)) {
    const legacy = UNIT_TYPES[character.legacyId];
    if (!legacy && UNIT_TYPES[runtimeId]) continue;
    if (!legacy) throw new Error(`Missing legacy runtime command unit: ${character.legacyId}`);
    UNIT_TYPES[runtimeId] = {
      ...legacy,
      name: character.name,
      short: character.short,
      role: character.role,
      title: character.title,
      fictional: true,
      legacyId: character.legacyId,
    };
    delete UNIT_TYPES[character.legacyId];
  }
}

function normalizeRussianEconomy() {
  for (const [id, economy] of Object.entries(RUSSIAN_RUNTIME_ECONOMY)) {
    if (!UNIT_TYPES[id]) throw new Error(`Missing Russian runtime unit: ${id}`);
    UNIT_TYPES[id].cost = { ...economy.cost };
    UNIT_TYPES[id].pop = economy.pop;
  }
}

function migrateMissionReferences() {
  for (const mission of MISSIONS) {
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
      mission[field] = (mission[field] ?? []).map((id) => LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id] ?? id);
    }
  }
}

export function migrateRuntimeUnitId(id) {
  if (typeof id !== 'string' || !id) {
    return Object.freeze({
      status: 'unsupported',
      id: null,
      legacyId: id ?? null,
      error: 'Runtime unit ID must be a non-empty string.',
    });
  }
  const migrated = LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id];
  if (migrated) {
    return Object.freeze({ status: 'migrated', id: migrated, legacyId: id, error: null });
  }
  if (UNIT_TYPES[id] || FICTIONAL_COMMAND_CHARACTERS[id]) {
    return Object.freeze({ status: 'current', id, legacyId: null, error: null });
  }
  return Object.freeze({
    status: 'unsupported',
    id: null,
    legacyId: id,
    error: `Unsupported runtime unit ID: ${id}. Update the save or configuration to a current stable ID.`,
  });
}

export function migrateRuntimeContentReferences(value) {
  if (typeof value === 'string') return LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[value] ?? value;
  if (Array.isArray(value)) return value.map(migrateRuntimeContentReferences);
  if (!value || typeof value !== 'object') return value;
  const migrated = {};
  for (const key of Object.keys(value).sort()) {
    migrated[key] = migrateRuntimeContentReferences(value[key]);
  }
  return migrated;
}

export function validateActiveRuntimeContent() {
  const errors = [];
  errors.push(...validateFactionTechTrees().map((error) => `UFR-070: ${error}`));
  errors.push(...validateUkrainianInfantryBranch().map((error) => `UFR-071: ${error}`));

  const rosterNodes = canonicalRosterNodes();
  const allowedResources = new Set(RUNTIME_RESOURCE_IDS);
  const missionReferenceFields = ['heroes', 'trainableHeroes', 'enemyHeroes'];

  for (const legacyId of Object.keys(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    if (UNIT_TYPES[legacyId]) errors.push(`legacy public-figure unit ID remains active: ${legacyId}`);
  }

  for (const [id, unit] of Object.entries(UNIT_TYPES)) {
    if (!unit || typeof unit !== 'object') {
      errors.push(`${id}: runtime unit must be an object`);
      continue;
    }
    const publicText = `${id} ${unit.name ?? ''} ${unit.short ?? ''} ${unit.role ?? ''}`.toLowerCase();
    for (const token of PUBLIC_FIGURE_TOKENS) {
      if (publicText.includes(token)) errors.push(`${id}: active runtime content contains public-figure token ${token}`);
    }
    const canonicalId = RUNTIME_CANONICAL_ROSTER_MAP[id];
    if (!canonicalId) {
      errors.push(`${id}: missing canonical roster mapping`);
    } else {
      const node = rosterNodes.get(canonicalId);
      if (!node) errors.push(`${id}: canonical roster node ${canonicalId} does not exist`);
      const faction = factionForRuntimeId(id);
      if (node && !node.id.startsWith(faction === 'ukraine' ? 'ua.' : 'ru.')) {
        errors.push(`${id}: canonical roster node ${canonicalId} belongs to the wrong faction`);
      }
    }
    if (!Number.isInteger(unit.pop) || unit.pop <= 0) errors.push(`${id}: command-capacity cost must be a positive integer`);
    const costs = Object.entries(unit.cost ?? {});
    if (!costs.length) errors.push(`${id}: runtime unit must have a non-empty resource cost`);
    for (const [resource, amount] of costs) {
      if (!allowedResources.has(resource)) errors.push(`${id}: unsupported resource ${resource}`);
      if (!Number.isFinite(amount) || amount <= 0) errors.push(`${id}: ${resource} cost must be positive`);
    }
  }

  for (const [buildingId, building] of Object.entries(BUILDING_TYPES)) {
    const canonicalProducers = new Set(RUNTIME_BUILDING_CANONICAL_PRODUCERS[buildingId] ?? []);
    for (const runtimeId of building.produces ?? []) {
      if (!UNIT_TYPES[runtimeId]) errors.push(`${buildingId}: produces unknown runtime unit ${runtimeId}`);
      const canonicalId = RUNTIME_CANONICAL_ROSTER_MAP[runtimeId];
      const node = rosterNodes.get(canonicalId);
      if (node && !canonicalProducers.has(node.producer)) {
        errors.push(`${buildingId}: ${runtimeId} maps to producer ${node.producer}, outside the runtime building ownership set`);
      }
    }
  }

  const missionIds = new Set();
  for (const mission of MISSIONS) {
    if (missionIds.has(mission.id)) errors.push(`duplicate mission ID: ${mission.id}`);
    missionIds.add(mission.id);
    for (const field of missionReferenceFields) {
      const references = mission[field] ?? [];
      if (!Array.isArray(references)) {
        errors.push(`${mission.id}: ${field} must be an array`);
        continue;
      }
      for (const id of references) {
        if (!UNIT_TYPES[id]) errors.push(`${mission.id}: ${field} references unknown unit ${id}`);
        else if (!UNIT_TYPES[id].hero) errors.push(`${mission.id}: ${field} reference ${id} is not a command character`);
        if (LEGACY_RUNTIME_UNIT_ID_MIGRATIONS[id]) errors.push(`${mission.id}: ${field} retains legacy ID ${id}`);
      }
    }
  }

  const infantryOwners = new Set();
  for (const unit of UKRAINIAN_INFANTRY_BRANCH.units ?? []) {
    if (infantryOwners.has(unit.id)) errors.push(`UFR-071 duplicate stable roster ownership: ${unit.id}`);
    infantryOwners.add(unit.id);
  }

  return deepFreeze([...new Set(errors)].sort());
}

export function reconcileActiveRuntimeContent() {
  if (reconciled) return reconciliationSnapshot;
  replaceLegacyCommandCharacters();
  normalizeRussianEconomy();
  migrateMissionReferences();
  const errors = validateActiveRuntimeContent();
  if (errors.length) {
    throw new Error(`Runtime content reconciliation failed:\n- ${errors.join('\n- ')}`);
  }
  reconciled = true;
  reconciliationSnapshot = deepFreeze({
    schemaVersion: RUNTIME_CONTENT_SCHEMA_VERSION,
    migratedLegacyIds: cloneJson(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS),
    runtimeUnitIds: Object.keys(UNIT_TYPES).sort(),
    missionIds: MISSIONS.map((mission) => mission.id),
    canonicalRosterMap: cloneJson(RUNTIME_CANONICAL_ROSTER_MAP),
  });
  return reconciliationSnapshot;
}
