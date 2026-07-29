export const MOVEMENT_LAYERS = Object.freeze({
  GROUND: 'ground',
  AMPHIBIOUS: 'amphibious',
  AIR: 'air',
});

export const TERRAIN_TYPES = Object.freeze({
  OPEN: 'open',
  ROAD: 'road',
  MUD: 'mud',
  RUBBLE: 'rubble',
  WATER: 'water',
  BRIDGE: 'bridge',
  BLOCKED: 'blocked',
});

export const DEFAULT_TERRAIN_RULES = Object.freeze({
  [TERRAIN_TYPES.OPEN]: Object.freeze({ ground: 1, amphibious: 1, air: 1 }),
  [TERRAIN_TYPES.ROAD]: Object.freeze({ ground: 0.75, amphibious: 0.75, air: 1 }),
  [TERRAIN_TYPES.MUD]: Object.freeze({ ground: 1.6, amphibious: 1.25, air: 1 }),
  [TERRAIN_TYPES.RUBBLE]: Object.freeze({ ground: 1.35, amphibious: 1.35, air: 1 }),
  [TERRAIN_TYPES.WATER]: Object.freeze({ ground: null, amphibious: 1.2, air: 1 }),
  [TERRAIN_TYPES.BRIDGE]: Object.freeze({ ground: 1, amphibious: 1, air: 1 }),
  [TERRAIN_TYPES.BLOCKED]: Object.freeze({ ground: null, amphibious: null, air: 1 }),
});

const KNOWN_MOVEMENT_LAYERS = new Set(Object.values(MOVEMENT_LAYERS));

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
}

function assertCell(cell, width, height, label = 'cell') {
  if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    throw new TypeError(`${label} must contain integer x and y coordinates.`);
  }
  if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) {
    throw new RangeError(`${label} (${cell.x}, ${cell.y}) is outside the navigation grid.`);
  }
}

function normalizeFootprint(footprint = { width: 1, height: 1 }) {
  assertPositiveInteger(footprint.width, 'Footprint width');
  assertPositiveInteger(footprint.height, 'Footprint height');
  return Object.freeze({ width: footprint.width, height: footprint.height });
}

function normalizeLayers(layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new TypeError('Dynamic blocker layers must be a non-empty array.');
  }
  const unique = [...new Set(layers)];
  for (const layer of unique) {
    if (!KNOWN_MOVEMENT_LAYERS.has(layer)) throw new Error(`Unknown movement layer: ${layer}`);
  }
  return Object.freeze(unique.sort());
}

function blockerKey(x, y) {
  return `${x},${y}`;
}

export class NavigationGrid {
  #terrain;
  #dynamicBlockers = new Map();

  constructor({ width, height, tileSize = 32, defaultTerrain = TERRAIN_TYPES.OPEN, terrainRules = DEFAULT_TERRAIN_RULES }) {
    assertPositiveInteger(width, 'Navigation grid width');
    assertPositiveInteger(height, 'Navigation grid height');
    assertPositiveInteger(tileSize, 'Navigation tile size');
    if (!terrainRules[defaultTerrain]) throw new Error(`Unknown default terrain type: ${defaultTerrain}`);

    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.terrainRules = terrainRules;
    this.#terrain = Array.from({ length: width * height }, () => defaultTerrain);
  }

  index(x, y) {
    assertCell({ x, y }, this.width, this.height);
    return y * this.width + x;
  }

  worldToCell(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('World coordinates must be finite numbers.');
    const cell = { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) };
    assertCell(cell, this.width, this.height, 'World position');
    return Object.freeze(cell);
  }

  cellToWorldCenter(x, y) {
    assertCell({ x, y }, this.width, this.height);
    return Object.freeze({
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
    });
  }

  setTerrain(x, y, terrain) {
    if (!this.terrainRules[terrain]) throw new Error(`Unknown terrain type: ${terrain}`);
    this.#terrain[this.index(x, y)] = terrain;
  }

  getTerrain(x, y) {
    return this.#terrain[this.index(x, y)];
  }

  movementCost(x, y, layer = MOVEMENT_LAYERS.GROUND) {
    const terrain = this.getTerrain(x, y);
    const cost = this.terrainRules[terrain]?.[layer];
    if (cost === undefined) throw new Error(`Unknown movement layer: ${layer}`);
    return cost;
  }

  cellsForFootprint(origin, footprint = { width: 1, height: 1 }) {
    assertCell(origin, this.width, this.height, 'Footprint origin');
    const normalized = normalizeFootprint(footprint);
    const cells = [];
    for (let y = origin.y; y < origin.y + normalized.height; y += 1) {
      for (let x = origin.x; x < origin.x + normalized.width; x += 1) {
        assertCell({ x, y }, this.width, this.height, 'Footprint cell');
        cells.push(Object.freeze({ x, y }));
      }
    }
    return Object.freeze(cells);
  }

  addDynamicBlocker(
    id,
    origin,
    footprint = { width: 1, height: 1 },
    layers = [MOVEMENT_LAYERS.GROUND, MOVEMENT_LAYERS.AMPHIBIOUS],
  ) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Dynamic blocker id must be a non-empty string.');
    if (this.#dynamicBlockers.has(id)) throw new Error(`Dynamic blocker already exists: ${id}`);
    const cells = this.cellsForFootprint(origin, footprint);
    this.#dynamicBlockers.set(id, Object.freeze({ id, cells, layers: normalizeLayers(layers) }));
  }

  removeDynamicBlocker(id) {
    return this.#dynamicBlockers.delete(id);
  }

  blockerIdsAt(x, y, layer = MOVEMENT_LAYERS.GROUND) {
    assertCell({ x, y }, this.width, this.height);
    if (!KNOWN_MOVEMENT_LAYERS.has(layer)) throw new Error(`Unknown movement layer: ${layer}`);
    const key = blockerKey(x, y);
    return [...this.#dynamicBlockers.values()]
      .filter((blocker) => blocker.layers.includes(layer) && blocker.cells.some((cell) => blockerKey(cell.x, cell.y) === key))
      .map((blocker) => blocker.id)
      .sort();
  }

  isPassable(x, y, { layer = MOVEMENT_LAYERS.GROUND, footprint = { width: 1, height: 1 }, ignoreBlockerIds = [] } = {}) {
    const ignored = new Set(ignoreBlockerIds);
    return this.cellsForFootprint({ x, y }, footprint).every((cell) => {
      if (this.movementCost(cell.x, cell.y, layer) === null) return false;
      return this.blockerIdsAt(cell.x, cell.y, layer).every((id) => ignored.has(id));
    });
  }

  applyMapData({ terrain = [], bridges = [], blockers = [] } = {}) {
    if (!Array.isArray(terrain) || !Array.isArray(bridges) || !Array.isArray(blockers)) {
      throw new TypeError('Navigation map data terrain, bridges, and blockers must be arrays.');
    }

    for (const cell of terrain) {
      if (!cell || typeof cell.type !== 'string') throw new TypeError('Terrain entries require x, y, and type.');
      this.setTerrain(cell.x, cell.y, cell.type);
    }
    for (const cell of bridges) this.setTerrain(cell.x, cell.y, TERRAIN_TYPES.BRIDGE);
    for (const blocker of blockers) {
      if (!blocker || !blocker.origin) throw new TypeError('Blocker entries require id and origin.');
      this.addDynamicBlocker(blocker.id, blocker.origin, blocker.footprint, blocker.layers);
    }
    return this;
  }

  snapshot() {
    return Object.freeze({
      width: this.width,
      height: this.height,
      tileSize: this.tileSize,
      terrain: Object.freeze([...this.#terrain]),
      blockers: Object.freeze(
        [...this.#dynamicBlockers.values()]
          .map((blocker) => Object.freeze({
            id: blocker.id,
            cells: blocker.cells,
            layers: blocker.layers,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    });
  }
}

export function createNavigationGrid(options) {
  return new NavigationGrid(options);
}

export function createNavigationGridFromMapData(mapData, options = {}) {
  if (!mapData || typeof mapData !== 'object' || Array.isArray(mapData)) {
    throw new TypeError('Navigation map data must be an object.');
  }
  const { width, height, tileSize, defaultTerrain, terrain, bridges, blockers } = mapData;
  return new NavigationGrid({
    width,
    height,
    tileSize,
    defaultTerrain,
    ...options,
  }).applyMapData({ terrain, bridges, blockers });
}
