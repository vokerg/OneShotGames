import { AI_DIFFICULTY_IDS, DEFAULT_AI_DIFFICULTY_ID } from '../ai/ai-difficulty-profiles.js';
import { TEAM } from '../config.js';
import {
  DEFAULT_SKIRMISH_SETUP,
  SKIRMISH_DIFFICULTY_IDS,
  SKIRMISH_FACTION_IDS,
  SKIRMISH_FACTIONS,
  SKIRMISH_MAP_IDS,
  SKIRMISH_MAPS,
} from './skirmish-catalog.js';

export {
  DEFAULT_SKIRMISH_SETUP,
  SKIRMISH_DIFFICULTY_IDS,
  SKIRMISH_FACTION_IDS,
  SKIRMISH_FACTIONS,
  SKIRMISH_MAP_IDS,
  SKIRMISH_MAPS,
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertDifficultyCatalogParity() {
  const catalogIds = [...SKIRMISH_DIFFICULTY_IDS];
  const runtimeIds = [...AI_DIFFICULTY_IDS];
  if (catalogIds.length !== runtimeIds.length || catalogIds.some((id, index) => id !== runtimeIds[index])) {
    throw new Error('Skirmish difficulty catalog must match the authoritative AI difficulty profiles.');
  }
  if (DEFAULT_SKIRMISH_SETUP.difficultyId !== DEFAULT_AI_DIFFICULTY_ID) {
    throw new Error('Skirmish default difficulty must match the authoritative AI default.');
  }
}

assertDifficultyCatalogParity();

export function getSkirmishMap(mapId) {
  const map = SKIRMISH_MAPS.find((candidate) => candidate.id === mapId);
  if (!map) throw new RangeError(`Unknown skirmish map: ${mapId}`);
  return map;
}

export function normalizeSkirmishSetup(value = {}) {
  const mapId = value.mapId ?? DEFAULT_SKIRMISH_SETUP.mapId;
  const playerFactionId = value.playerFactionId ?? DEFAULT_SKIRMISH_SETUP.playerFactionId;
  const opponentFactionId = value.opponentFactionId ?? SKIRMISH_FACTIONS[playerFactionId]?.opponent;
  const difficultyId = value.difficultyId ?? DEFAULT_SKIRMISH_SETUP.difficultyId;
  if (!SKIRMISH_FACTION_IDS.includes(playerFactionId)) throw new RangeError(`Unknown player faction: ${playerFactionId}`);
  if (!SKIRMISH_FACTION_IDS.includes(opponentFactionId)) throw new RangeError(`Unknown opponent faction: ${opponentFactionId}`);
  if (playerFactionId === opponentFactionId) throw new RangeError('Skirmish factions must be different.');
  if (!AI_DIFFICULTY_IDS.includes(difficultyId)) throw new RangeError(`Unknown AI difficulty: ${difficultyId}`);
  const resources = value.startingResources ?? DEFAULT_SKIRMISH_SETUP.startingResources;
  const startingResources = {};
  for (const id of ['metal', 'fuel', 'intel']) {
    const amount = Number(resources[id] ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`startingResources.${id} must be finite and non-negative.`);
    startingResources[id] = Math.floor(amount);
  }
  getSkirmishMap(mapId);
  return deepFreeze({ mapId, playerFactionId, opponentFactionId, difficultyId, startingResources });
}

export function skirmishMissionForSetup(value = {}) {
  const setup = normalizeSkirmishSetup(value);
  const map = getSkirmishMap(setup.mapId);
  const playerFaction = SKIRMISH_FACTIONS[setup.playerFactionId];
  const opponentFaction = SKIRMISH_FACTIONS[setup.opponentFactionId];
  return deepFreeze({
    id: `skirmish:${map.id}`,
    mode: 'skirmish',
    region: map.region,
    title: `Skirmish — ${map.title}`,
    story: `${playerFaction.label} versus ${opponentFaction.label}. Destroy the opposing command post while preserving your own force economy.`,
    objectives: ['Destroy the opposing command post'],
    objectiveDefinitions: [{
      id: 'skirmish-destroy-enemy-hq',
      type: 'destroy',
      label: 'Destroy the opposing command post',
      count: 1,
      target: { collection: 'buildings', type: 'hq', team: TEAM.RU },
    }],
    start: setup.startingResources,
    heroes: [],
    trainableHeroes: [],
    enemyHeroes: [],
    waves: { firstDelay: 999999, interval: 999999, maxActive: 0, maxWaves: 0 },
    skirmish: setup,
  });
}
