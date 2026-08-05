export const BUILDING_ATLAS_SCHEMA_VERSION = 1;
export const BUILDING_ATLAS_SOURCE_SCHEMA = 'fields-of-resolve.building-art-source';
export const BUILDING_ATLAS_ID_PREFIX = 'fields-of-resolve.buildings';
export const BUILDING_ATLAS_FAMILY = 'production-buildings';

export const BUILDING_ATLAS_PROVENANCE = deepFreeze({
  creator: 'Fields of Resolve contributors',
  createdAt: '2026-08-04',
  source: 'Original deterministic repository-owned vector recipes',
  license: 'CC0-1.0',
  redistribution: 'allowed',
  generatedTools: {
    used: false,
    details: 'No generative image model or third-party visual source was used.',
    humanCorrections: 'Faction language, silhouettes, lifecycle readability, anchors, and palette use were designed for this project.',
  },
});

export const BUILDING_ATLAS_DIMENSIONS = deepFreeze({
  battlefield: { width: 96, height: 96, anchor: { x: 48, y: 88 } },
  icon: { width: 40, height: 40, anchor: { x: 20, y: 20 } },
});

export const BUILDING_ATLAS_ATTACHMENTS = Object.freeze([
  'entrance',
  'exit',
  'rally',
  'capture',
  'effect',
]);

export const BUILDING_ATLAS_STATES = deepFreeze({
  placement: { frames: 1, loop: 'hold', durationMs: 1000 },
  foundation: { frames: 1, loop: 'hold', durationMs: 1000 },
  frame: { frames: 1, loop: 'hold', durationMs: 1000 },
  fitout: { frames: 1, loop: 'hold', durationMs: 1000 },
  idle: { frames: 1, loop: 'loop', durationMs: 1000 },
  active: { frames: 1, loop: 'loop', durationMs: 320 },
  damaged: { frames: 1, loop: 'loop', durationMs: 600 },
  critical: { frames: 1, loop: 'loop', durationMs: 360 },
  destruction: { frames: 3, loop: 'once', durationMs: 120 },
  rubble: { frames: 1, loop: 'hold', durationMs: 1000 },
  icon: { frames: 1, loop: 'hold', durationMs: 1000 },
});

export const BUILDING_ATLAS_IDS = deepFreeze({
  ukraine: [
    'ua.command-post',
    'ua.logistics-hub',
    'ua.infantry-center',
    'ua.motor-pool',
    'ua.uas-ew-cell',
    'ua.fires-center',
    'ua.air-defense-site',
    'ua.engineer-park',
  ],
  russia: [
    'ru.regimental-command',
    'ru.supply-depot',
    'ru.motor-rifle-barracks',
    'ru.armored-park',
    'ru.uas-ew-battalion',
    'ru.fires-regiment',
    'ru.air-defense-battalion',
    'ru.engineer-battalion',
  ],
});

const ALL_IDS = new Set(Object.values(BUILDING_ATLAS_IDS).flat());
const STATE_IDS = new Set(Object.keys(BUILDING_ATLAS_STATES));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireBuilding(buildingId) {
  if (!ALL_IDS.has(buildingId)) throw new RangeError(`Unknown building atlas ID: ${buildingId}`);
  return buildingId;
}

function requireState(state) {
  if (!STATE_IDS.has(state)) throw new RangeError(`Unknown building atlas state: ${state}`);
  return state;
}

export function buildingAtlasFaction(buildingId) {
  requireBuilding(buildingId);
  return buildingId.startsWith('ua.') ? 'ukraine' : 'russia';
}

export function buildingAtlasId(faction) {
  if (!Object.hasOwn(BUILDING_ATLAS_IDS, faction)) throw new RangeError(`Unknown building atlas faction: ${faction}`);
  return `${BUILDING_ATLAS_ID_PREFIX}.${faction}.v${BUILDING_ATLAS_SCHEMA_VERSION}`;
}

export function buildingAtlasAnimation(buildingId, state = 'idle') {
  requireBuilding(buildingId);
  requireState(state);
  return `${buildingId}.${state}`;
}

export function buildingAtlasFrame(buildingId, state = 'idle', { phase = 0 } = {}) {
  const animation = buildingAtlasAnimation(buildingId, state);
  const count = BUILDING_ATLAS_STATES[state].frames;
  if (!Number.isInteger(phase) || phase < 0 || phase >= count) {
    throw new RangeError(`Building ${state} phase must be an integer from 0 through ${count - 1}.`);
  }
  return count === 1 ? animation : `${animation}.f${phase}`;
}

export function buildingAtlasManifestPath(buildingId) {
  return `assets/atlases/buildings-${buildingAtlasFaction(buildingId)}.atlas.json`;
}

export function buildingAtlasImagePath(buildingId) {
  return `assets/atlases/buildings-${buildingAtlasFaction(buildingId)}.svg`;
}
