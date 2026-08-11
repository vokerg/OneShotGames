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
  SHELTERBELT: 'shelterbelt',
  BLOCKED: 'blocked',
});

export const TERRAIN_MOVEMENT_BANDS = Object.freeze({
  FAST: 'fast',
  NORMAL: 'normal',
  SLOW: 'slow',
  VERY_SLOW: 'very-slow',
  IMPASSABLE: 'impassable',
});

export const DEFAULT_TERRAIN_RULES = Object.freeze({
  [TERRAIN_TYPES.OPEN]: Object.freeze({ ground: 1, amphibious: 1, air: 1 }),
  [TERRAIN_TYPES.ROAD]: Object.freeze({ ground: 0.75, amphibious: 0.75, air: 1 }),
  [TERRAIN_TYPES.MUD]: Object.freeze({ ground: 1.6, amphibious: 1.25, air: 1 }),
  [TERRAIN_TYPES.RUBBLE]: Object.freeze({ ground: 1.35, amphibious: 1.35, air: 1 }),
  [TERRAIN_TYPES.WATER]: Object.freeze({ ground: null, amphibious: 1.2, air: 1 }),
  [TERRAIN_TYPES.BRIDGE]: Object.freeze({ ground: 1, amphibious: 1, air: 1 }),
  [TERRAIN_TYPES.SHELTERBELT]: Object.freeze({ ground: 1.15, amphibious: 1.15, air: 1 }),
  [TERRAIN_TYPES.BLOCKED]: Object.freeze({ ground: null, amphibious: null, air: 1 }),
});

export const TERRAIN_PRESENTATION = Object.freeze({
  [TERRAIN_TYPES.OPEN]: Object.freeze({ label: 'Open ground', detail: 'Standard movement' }),
  [TERRAIN_TYPES.ROAD]: Object.freeze({ label: 'Road', detail: 'Faster movement' }),
  [TERRAIN_TYPES.MUD]: Object.freeze({ label: 'Mud', detail: 'Severely reduced movement' }),
  [TERRAIN_TYPES.RUBBLE]: Object.freeze({ label: 'Rubble', detail: 'Reduced movement' }),
  [TERRAIN_TYPES.WATER]: Object.freeze({ label: 'Water', detail: 'Ground units cannot cross' }),
  [TERRAIN_TYPES.BRIDGE]: Object.freeze({ label: 'Bridge', detail: 'Ground crossing' }),
  [TERRAIN_TYPES.SHELTERBELT]: Object.freeze({ label: 'Shelterbelt', detail: 'Slightly reduced movement' }),
  [TERRAIN_TYPES.BLOCKED]: Object.freeze({ label: 'Blocked terrain', detail: 'Impassable' }),
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

export function movementBandForCost(cost) {
  if (cost === null) return TERRAIN_MOVEMENT_BANDS.IMPASSABLE;
  if (!Number.isFinite(cost) || cost <= 0) throw new TypeError('Terrain movement cost must be null or a positive finite number.');
  if (cost < 1) return TERRAIN_MOVEMENT_BANDS.FAST;
  if (cost === 1) return TERRAIN_MOVEMENT_BANDS.NORMAL;
  if (cost < 1.5) return TERRAIN_MOVEMENT_BANDS.SLOW;
  return TERRAIN_MOVEMENT_BANDS.VERY_SLOW;
}

export function terrainMovementProfile(terrain, layer = MOVEMENT_LAYERS.GROUND, terrainRules = DEFAULT_TERRAIN_RULES) {
  if (!KNOWN_MOVEMENT_LAYERS.has(layer)) throw new Error(`Unknown movement layer: ${layer}`);
  const rule = terrainRules[terrain];
  if (!rule) throw new Error(`Unknown terrain type: ${terrain}`);
  const cost = rule[layer];
  if (cost === undefined) throw new Error(`Terrain ${terrain} does not define movement layer: ${layer}`);
  const presentation = TERRAIN_PRESENTATION[terrain] ?? Object.freeze({
    label: terrain,
    detail: cost === null ? 'Impassable' : 'Modified movement',
  });
  return Object.freeze({
    terrain,
    layer,
    label: presentation.label,
    detail: presentation.detail,
    cost,
    passable: cost !== null,
    speedMultiplier: cost === null ? 0 : 1 / cost,
    band: movementBandForCost(cost),
  });
}

export class NavigationGrid {
  #terrain;
  #dynamicBlockers = new Map();
  #blockerCellsByLayer = new Map(Object.values(MOVEMENT_LAYERS).map((layer) => [layer, new Map()]));

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

  movementProfile(x, y, layer = MOVEMENT_LAYERS.GROUND) {
    return terrainMovementProfile(this.getTerrain(x, y), layer, this.terrainRules);
  }

  movementProfileAtWorld(x, y, layer = MOVEMENT_LAYERS.GROUND) {
    const cell = this.worldToCell(x, y);
    return Object.freeze({ ...this.movementProfile(cell.x, cell.y, layer), cell });
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
    const normalizedLayers = normalizeLayers(layers);
    const blocker = Object.freeze({ id, cells, layers: normalizedLayers });
    this.#dynamicBlockers.set(id, blocker);

    for (const layer of normalizedLayers) {
      const layerCells = this.#blockerCellsByLayer.get(layer);
      for (const cell of cells) {
        const cellIndex = cell.y * this.width + cell.x;
        let blockerIds = layerCells.get(cellIndex);
        if (!blockerIds) {
          blockerIds = new Set();
          layerCells.set(cellIndex, blockerIds);
        }
        blockerIds.add(id);
      }
    }
  }

  removeDynamicBlocker(id) {
    const blocker = this.#dynamicBlockers.get(id);
    if (!blocker) return false;
    this.#dynamicBlockers.delete(id);
    for (const layer of blocker.layers) {
      const layerCells = this.#blockerCellsByLayer.get(layer);
      for (const cell of blocker.cells) {
        const cellIndex = cell.y * this.width + cell.x;
        const blockerIds = layerCells.get(cellIndex);
        if (!blockerIds) continue;
        blockerIds.delete(id);
        if (blockerIds.size === 0) layerCells.delete(cellIndex);
      }
    }
    return true;
  }

  blockerIdsAt(x, y, layer = MOVEMENT_LAYERS.GROUND) {
    assertCell({ x, y }, this.width, this.height);
    if (!KNOWN_MOVEMENT_LAYERS.has(layer)) throw new Error(`Unknown movement layer: ${layer}`);
    const blockerIds = this.#blockerCellsByLayer.get(layer).get(y * this.width + x);
    return blockerIds ? [...blockerIds].sort() : [];
  }

  isPassable(x, y, { layer = MOVEMENT_LAYERS.GROUND, footprint = { width: 1, height: 1 }, ignoreBlockerIds = [] } = {}) {
    assertCell({ x, y }, this.width, this.height);
    if (!KNOWN_MOVEMENT_LAYERS.has(layer)) throw new Error(`Unknown movement layer: ${layer}`);
    const normalized = normalizeFootprint(footprint);
    const maxX = x + normalized.width;
    const maxY = y + normalized.height;
    if (maxX > this.width || maxY > this.height) {
      throw new RangeError(`Footprint cell (${maxX - 1}, ${maxY - 1}) is outside the navigation grid.`);
    }

    const ignored = ignoreBlockerIds.length ? new Set(ignoreBlockerIds) : null;
    const layerCells = this.#blockerCellsByLayer.get(layer);
    for (let cellY = y; cellY < maxY; cellY += 1) {
      const rowOffset = cellY * this.width;
      for (let cellX = x; cellX < maxX; cellX += 1) {
        const terrain = this.#terrain[rowOffset + cellX];
        if (this.terrainRules[terrain]?.[layer] === null) return false;
        const blockerIds = layerCells.get(rowOffset + cellX);
        if (!blockerIds) continue;
        for (const blockerId of blockerIds) {
          if (!ignored?.has(blockerId)) return false;
        }
      }
    }
    return true;
  }

  applyMapData({ terrain = [], shelterbelts = [], roads = [], bridges = [], blockers = [] } = {}) {
    if (
      !Array.isArray(terrain) ||
      !Array.isArray(shelterbelts) ||
      !Array.isArray(roads) ||
      !Array.isArray(bridges) ||
      !Array.isArray(blockers)
    ) {
      throw new TypeError('Navigation map data terrain, shelterbelts, roads, bridges, and blockers must be arrays.');
    }

    for (const cell of terrain) {
      if (!cell || typeof cell.type !== 'string') throw new TypeError('Terrain entries require x, y, and type.');
      this.setTerrain(cell.x, cell.y, cell.type);
    }
    for (const cell of shelterbelts) this.setTerrain(cell.x, cell.y, TERRAIN_TYPES.SHELTERBELT);
    for (const cell of roads) this.setTerrain(cell.x, cell.y, TERRAIN_TYPES.ROAD);
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
  const {
    width,
    height,
    tileSize,
    defaultTerrain,
    terrain,
    shelterbelts,
    roads,
    bridges,
    blockers,
  } = mapData;
  return new NavigationGrid({
    width,
    height,
    tileSize,
    defaultTerrain,
    ...options,
  }).applyMapData({ terrain, shelterbelts, roads, bridges, blockers });
}
