export const TERRAIN_TILE_SCHEMA_VERSION = 1;
export const TERRAIN_TILE_SIZE = 32;
export const TERRAIN_VARIANT_COUNT = 2;
export const TERRAIN_ATLAS_ID = 'fields-of-resolve.terrain.v1';
export const TERRAIN_ATLAS_MANIFEST = './assets/atlases/terrain.atlas.json';

export const TERRAIN_SEMANTIC_IDS = Object.freeze([
  'open',
  'road',
  'mud',
  'rubble',
  'water',
  'bridge',
  'shelterbelt',
  'blocked',
]);

export const TERRAIN_VISUAL_FAMILIES = Object.freeze([
  'ground',
  'road',
  'mud',
  'rubble',
  'water',
  'bridge',
  'shelterbelt',
  'blocked',
  'settlement',
  'industrial',
  'field',
  'bank',
  'cliff',
]);

export const TERRAIN_ATLAS_PROVENANCE = Object.freeze({
  creator: 'Fields of Resolve contributors',
  createdAt: '2026-08-04',
  source: 'Original repository-authored vector terrain generator',
  license: 'CC0-1.0',
  redistribution: 'allowed',
  generatedTools: Object.freeze({
    used: false,
    details: 'No generative image system or external commercial asset was used.',
  }),
});

const SEMANTIC_SET = new Set(TERRAIN_SEMANTIC_IDS);
const FAMILY_SET = new Set(TERRAIN_VISUAL_FAMILIES);
const BIOME_ALIASES = Object.freeze({
  donbas: 'donbas',
  zaporizhzhia: 'zaporizhzhia',
  kherson: 'kherson',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const TERRAIN_BIOME_PROFILES = deepFreeze({
  donbas: {
    id: 'donbas',
    version: 1,
    palette: {
      ink: '#111512',
      groundDark: '#4d593c',
      ground: '#667649',
      groundLight: '#82915e',
      road: '#8b7954',
      mud: '#584b3b',
      rubble: '#777267',
      water: '#395a62',
      waterLight: '#577d82',
      bridge: '#8c7652',
      shelter: '#30462f',
      rock: '#595d51',
      settlement: '#77756b',
      industrial: '#626862',
      field: '#7f7a48',
      edge: '#2b3328',
    },
  },
  zaporizhzhia: {
    id: 'zaporizhzhia',
    version: 1,
    palette: {
      ink: '#111512',
      groundDark: '#625c3d',
      ground: '#7c754b',
      groundLight: '#93895e',
      road: '#9b8056',
      mud: '#67513d',
      rubble: '#827769',
      water: '#41646a',
      waterLight: '#64868a',
      bridge: '#977b54',
      shelter: '#394a31',
      rock: '#686452',
      settlement: '#81796b',
      industrial: '#6e6d62',
      field: '#92824d',
      edge: '#39362a',
    },
  },
  kherson: {
    id: 'kherson',
    version: 1,
    palette: {
      ink: '#111512',
      groundDark: '#52635a',
      ground: '#6c806b',
      groundLight: '#879987',
      road: '#8f8064',
      mud: '#536057',
      rubble: '#747a73',
      water: '#345c6d',
      waterLight: '#59869a',
      bridge: '#8c806c',
      shelter: '#315343',
      rock: '#596861',
      settlement: '#737d78',
      industrial: '#626e6e',
      field: '#718066',
      edge: '#283a35',
    },
  },
});

const LEGACY_FAMILY = Object.freeze({
  0: 'ground',
  1: 'rubble',
  2: 'shelterbelt',
});

const SEMANTIC_FAMILY = Object.freeze({
  open: 'ground',
  road: 'road',
  mud: 'mud',
  rubble: 'rubble',
  water: 'water',
  bridge: 'bridge',
  shelterbelt: 'shelterbelt',
  blocked: 'blocked',
});

const OPEN_SURFACES = new Set(['ground', 'field', 'settlement', 'industrial', 'bank']);
const BLOCKED_SURFACES = new Set(['blocked', 'cliff']);

const DIRECTIONS = Object.freeze([
  Object.freeze({ id: 'n', dx: 0, dy: -1, bit: 1 }),
  Object.freeze({ id: 'e', dx: 1, dy: 0, bit: 2 }),
  Object.freeze({ id: 's', dx: 0, dy: 1, bit: 4 }),
  Object.freeze({ id: 'w', dx: -1, dy: 0, bit: 8 }),
]);

const DIAGONALS = Object.freeze([
  Object.freeze({ id: 'ne', dx: 1, dy: -1, bit: 1, adjacent: 3 }),
  Object.freeze({ id: 'se', dx: 1, dy: 1, bit: 2, adjacent: 6 }),
  Object.freeze({ id: 'sw', dx: -1, dy: 1, bit: 4, adjacent: 12 }),
  Object.freeze({ id: 'nw', dx: -1, dy: -1, bit: 8, adjacent: 9 }),
]);

const OUTSIDE_CONNECT = new Set(['ground', 'blocked', 'cliff']);

function finiteInteger(value, label, { min = 0 } = {}) {
  if (!Number.isInteger(value) || value < min) {
    throw new TypeError(`${label} must be an integer >= ${min}.`);
  }
  return value;
}

function requireFamily(value, label = 'Terrain visual family') {
  if (!FAMILY_SET.has(value)) throw new RangeError(`${label} is unknown: ${value}.`);
  return value;
}

function requireSemantic(value, label = 'Terrain semantic ID') {
  if (!SEMANTIC_SET.has(value)) throw new RangeError(`${label} is unknown: ${value}.`);
  return value;
}

export function terrainBiomeId(value) {
  const id = BIOME_ALIASES[String(value ?? '').toLowerCase()];
  if (!id || !TERRAIN_BIOME_PROFILES[id]) {
    throw new RangeError(`Unknown terrain biome profile: ${value}.`);
  }
  return id;
}

export function stableTerrainHash(...parts) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (const character of String(part)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function terrainFamilyForSemantic(semantic, surface = null) {
  const id = requireSemantic(semantic);
  if (id === 'open' && surface != null) {
    const normalized = String(surface).toLowerCase();
    if (!OPEN_SURFACES.has(normalized)) {
      throw new RangeError(`Unsupported open-terrain visual surface: ${surface}.`);
    }
    return normalized;
  }
  if (id === 'blocked' && surface != null) {
    const normalized = String(surface).toLowerCase();
    if (!BLOCKED_SURFACES.has(normalized)) {
      throw new RangeError(`Unsupported blocked-terrain visual surface: ${surface}.`);
    }
    return normalized;
  }
  return SEMANTIC_FAMILY[id];
}

export function terrainTopology(mask) {
  finiteInteger(mask, 'Terrain cardinal mask');
  if (mask > 15) throw new RangeError('Terrain cardinal mask must be <= 15.');
  return Object.freeze([
    'isolated',
    'end-n',
    'end-e',
    'corner-ne',
    'end-s',
    'straight-ns',
    'corner-es',
    'tee-w',
    'end-w',
    'corner-wn',
    'straight-ew',
    'tee-s',
    'corner-sw',
    'tee-e',
    'tee-n',
    'cross',
  ][mask]);
}

export function terrainFrameId({ biome, family, cardinalMask, variant = 0 }) {
  const resolvedBiome = terrainBiomeId(biome);
  const resolvedFamily = requireFamily(family);
  finiteInteger(cardinalMask, 'Terrain cardinal mask');
  finiteInteger(variant, 'Terrain visual variant');
  if (cardinalMask > 15) throw new RangeError('Terrain cardinal mask must be <= 15.');
  if (variant >= TERRAIN_VARIANT_COUNT) {
    throw new RangeError(`Terrain visual variant must be < ${TERRAIN_VARIANT_COUNT}.`);
  }
  return `terrain.${resolvedBiome}.${resolvedFamily}.v${variant}.m${cardinalMask.toString(16).padStart(2, '0')}`;
}

export function terrainInnerCornerFrameId({ biome, innerCornerMask }) {
  const resolvedBiome = terrainBiomeId(biome);
  finiteInteger(innerCornerMask, 'Terrain inner-corner mask');
  if (innerCornerMask > 15) throw new RangeError('Terrain inner-corner mask must be <= 15.');
  return innerCornerMask
    ? `terrain.${resolvedBiome}.inner.m${innerCornerMask.toString(16).padStart(2, '0')}`
    : null;
}

function cellAt(projection, x, y) {
  if (x < 0 || y < 0 || x >= projection.width || y >= projection.height) return null;
  return projection.cells[y * projection.width + x] ?? null;
}

function sameFamily(projection, x, y, family) {
  const cell = cellAt(projection, x, y);
  if (cell) return cell.family === family;
  return OUTSIDE_CONNECT.has(family);
}

function neighborMasksUnchecked(projection, x, y) {
  const family = projection.cells[y * projection.width + x].family;
  let cardinalMask = 0;
  for (const direction of DIRECTIONS) {
    if (sameFamily(projection, x + direction.dx, y + direction.dy, family)) {
      cardinalMask |= direction.bit;
    }
  }
  let diagonalMask = 0;
  let innerCornerMask = 0;
  for (const diagonal of DIAGONALS) {
    const connected = sameFamily(projection, x + diagonal.dx, y + diagonal.dy, family);
    if (connected) diagonalMask |= diagonal.bit;
    if ((cardinalMask & diagonal.adjacent) === diagonal.adjacent && !connected) {
      innerCornerMask |= diagonal.bit;
    }
  }
  return Object.freeze({ cardinalMask, diagonalMask, innerCornerMask });
}

export function terrainNeighborMasks(projection, x, y) {
  validateTerrainProjection(projection);
  finiteInteger(x, 'Terrain x');
  finiteInteger(y, 'Terrain y');
  if (x >= projection.width || y >= projection.height) {
    throw new RangeError(`Terrain cell (${x}, ${y}) is outside ${projection.width}x${projection.height}.`);
  }
  return neighborMasksUnchecked(projection, x, y);
}

function pointSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx && !dy) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

function legacyRoadCells(width, height, road, tileSize) {
  const result = new Set();
  if (!Array.isArray(road) || road.length < 2) return result;
  const thresholdSquared = (tileSize * 0.82) ** 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x * tileSize + tileSize / 2;
      const py = y * tileSize + tileSize / 2;
      for (let index = 1; index < road.length; index += 1) {
        const previous = road[index - 1];
        const current = road[index];
        if (!Array.isArray(previous) || !Array.isArray(current)) continue;
        if (pointSegmentDistanceSquared(px, py, previous[0], previous[1], current[0], current[1]) <= thresholdSquared) {
          result.add(`${x},${y}`);
          break;
        }
      }
    }
  }
  return result;
}

function freezeProjection({ id, biome, width, height, cells }) {
  return deepFreeze({
    schemaVersion: TERRAIN_TILE_SCHEMA_VERSION,
    id,
    biome,
    width,
    height,
    tileSize: TERRAIN_TILE_SIZE,
    cells,
  });
}

export function projectLegacyTerrain({
  terrain,
  width,
  height,
  road = [],
  region = 'donbas',
  mapId = 'legacy-runtime',
  tileSize = TERRAIN_TILE_SIZE,
} = {}) {
  finiteInteger(width, 'Legacy terrain width', { min: 1 });
  finiteInteger(height, 'Legacy terrain height', { min: 1 });
  finiteInteger(tileSize, 'Legacy terrain tileSize', { min: 1 });
  if (!Array.isArray(terrain) || terrain.length !== width * height) {
    throw new TypeError(`Legacy terrain must contain exactly ${width * height} cells.`);
  }
  const biome = terrainBiomeId(region);
  const roadCells = legacyRoadCells(width, height, road, tileSize);
  const cells = terrain.map((value, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    let semantic;
    let family;
    if (typeof value === 'string') {
      semantic = requireSemantic(value, `Legacy terrain[${index}]`);
      family = terrainFamilyForSemantic(semantic);
    } else {
      family = LEGACY_FAMILY[value];
      if (!family) throw new RangeError(`Legacy terrain[${index}] uses unknown numeric value: ${value}.`);
      semantic = value === 1 ? 'rubble' : value === 2 ? 'shelterbelt' : 'open';
    }
    if (roadCells.has(`${x},${y}`)) {
      semantic = 'road';
      family = 'road';
    }
    return {
      x,
      y,
      semantic,
      family,
      surface: null,
      variant: stableTerrainHash(mapId, biome, x, y, family) % TERRAIN_VARIANT_COUNT,
    };
  });
  return freezeProjection({ id: mapId, biome, width, height, cells });
}

function presentationSurfaceMap(map) {
  const source = map?.metadata?.presentation?.surfaces;
  if (source == null) return new Map();
  if (Array.isArray(source)) {
    return new Map(source.map((entry, index) => {
      if (!entry || !Number.isInteger(entry.x) || !Number.isInteger(entry.y) || typeof entry.surface !== 'string') {
        throw new TypeError(`metadata.presentation.surfaces[${index}] must contain integer x/y and a surface string.`);
      }
      return [`${entry.x},${entry.y}`, entry.surface];
    }));
  }
  if (typeof source === 'object') {
    return new Map(Object.entries(source).map(([key, value]) => {
      if (typeof value !== 'string') {
        throw new TypeError(`metadata.presentation.surfaces.${key} must be a surface string.`);
      }
      return [key, value];
    }));
  }
  throw new TypeError('metadata.presentation.surfaces must be an array or cell-keyed object.');
}

export function projectAuthoredTerrain(map, { biome = null } = {}) {
  if (!map || typeof map !== 'object') throw new TypeError('Authored terrain projection requires a map object.');
  const width = map.grid?.width ?? map.width;
  const height = map.grid?.height ?? map.height;
  finiteInteger(width, 'Authored map width', { min: 1 });
  finiteInteger(height, 'Authored map height', { min: 1 });
  const terrain = map.terrain?.cells;
  if (!Array.isArray(terrain) || terrain.length !== width * height) {
    throw new TypeError(`Authored map terrain.cells must contain exactly ${width * height} semantic IDs.`);
  }
  const resolvedBiome = terrainBiomeId(biome ?? map.metadata?.presentation?.biome ?? map.metadata?.region ?? 'donbas');
  const surfaces = presentationSurfaceMap(map);
  const id = String(map.id ?? map.metadata?.id ?? 'authored-map');
  const cells = terrain.map((value, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const semantic = requireSemantic(value, `Authored terrain.cells[${index}]`);
    const surface = surfaces.get(`${x},${y}`) ?? null;
    const family = terrainFamilyForSemantic(semantic, surface);
    return {
      x,
      y,
      semantic,
      family,
      surface,
      variant: stableTerrainHash(id, resolvedBiome, x, y, family) % TERRAIN_VARIANT_COUNT,
    };
  });
  return freezeProjection({ id, biome: resolvedBiome, width, height, cells });
}

export function validateTerrainProjection(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Terrain projection must be an object.');
  if (value.schemaVersion !== TERRAIN_TILE_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported terrain projection schema version: ${value.schemaVersion}.`);
  }
  finiteInteger(value.width, 'Terrain projection width', { min: 1 });
  finiteInteger(value.height, 'Terrain projection height', { min: 1 });
  terrainBiomeId(value.biome);
  if (value.tileSize !== TERRAIN_TILE_SIZE) throw new TypeError(`Terrain projection tileSize must be ${TERRAIN_TILE_SIZE}.`);
  if (!Array.isArray(value.cells) || value.cells.length !== value.width * value.height) {
    throw new TypeError(`Terrain projection must contain exactly ${value.width * value.height} cells.`);
  }
  value.cells.forEach((cell, index) => {
    if (!cell || typeof cell !== 'object') throw new TypeError(`Terrain projection cell ${index} must be an object.`);
    requireSemantic(cell.semantic, `Terrain projection cell ${index} semantic`);
    requireFamily(cell.family, `Terrain projection cell ${index} family`);
    finiteInteger(cell.x, `Terrain projection cell ${index} x`);
    finiteInteger(cell.y, `Terrain projection cell ${index} y`);
    finiteInteger(cell.variant, `Terrain projection cell ${index} variant`);
    if (cell.variant >= TERRAIN_VARIANT_COUNT) {
      throw new RangeError(`Terrain projection cell ${index} variant must be < ${TERRAIN_VARIANT_COUNT}.`);
    }
    if (cell.x !== index % value.width || cell.y !== Math.floor(index / value.width)) {
      throw new RangeError(`Terrain projection cell ${index} coordinates do not match row-major order.`);
    }
  });
  return value;
}

function resolveTerrainTileFramesUnchecked(projection, x, y) {
  const cell = cellAt(projection, x, y);
  if (!cell) throw new RangeError(`Terrain cell (${x}, ${y}) is outside the projection.`);
  const masks = neighborMasksUnchecked(projection, x, y);
  return Object.freeze({
    cell,
    topology: terrainTopology(masks.cardinalMask),
    cardinalMask: masks.cardinalMask,
    diagonalMask: masks.diagonalMask,
    innerCornerMask: masks.innerCornerMask,
    baseFrame: terrainFrameId({
      biome: projection.biome,
      family: cell.family,
      cardinalMask: masks.cardinalMask,
      variant: cell.variant,
    }),
    cornerFrame: terrainInnerCornerFrameId({
      biome: projection.biome,
      innerCornerMask: masks.innerCornerMask,
    }),
  });
}

export function resolveTerrainTileFrames(projection, x, y) {
  validateTerrainProjection(projection);
  finiteInteger(x, 'Terrain x');
  finiteInteger(y, 'Terrain y');
  return resolveTerrainTileFramesUnchecked(projection, x, y);
}

export function resolveTerrainProjectionFrames(projection) {
  validateTerrainProjection(projection);
  return Object.freeze(projection.cells.map((cell) => (
    resolveTerrainTileFramesUnchecked(projection, cell.x, cell.y)
  )));
}
