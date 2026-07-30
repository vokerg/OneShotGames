export const AUTHORED_MAP_FORMAT_VERSION = 1;

export const AUTHORED_TERRAIN_TYPES = Object.freeze([
  'open',
  'road',
  'mud',
  'rubble',
  'water',
  'bridge',
  'shelterbelt',
  'blocked',
]);

export const AUTHORED_MOVEMENT_LAYERS = Object.freeze(['ground', 'amphibious', 'air']);

const TERRAIN_TYPES = new Set(AUTHORED_TERRAIN_TYPES);
const MOVEMENT_LAYERS = new Set(AUTHORED_MOVEMENT_LAYERS);
const REGION_SHAPES = new Set(['rect', 'circle', 'polygon']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cellKey = (cell) => `${cell.x},${cell.y}`;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneJson(value, path, errors, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must contain only finite numbers.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      errors.push(`${path} must not contain circular references.`);
      return [];
    }
    seen.add(value);
    const result = value.map((child, index) => cloneJson(child, `${path}[${index}]`, errors, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      errors.push(`${path} must not contain circular references.`);
      return {};
    }
    seen.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
        errors.push(`${path}.${key} must be JSON-compatible.`);
        continue;
      }
      result[key] = cloneJson(child, `${path}.${key}`, errors, seen);
    }
    seen.delete(value);
    return result;
  }
  errors.push(`${path} must be JSON-compatible.`);
  return null;
}

function requireNonEmptyString(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${path} must be a non-empty string.`);
    return '';
  }
  return value.trim();
}

function requirePositiveInteger(value, path, errors) {
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${path} must be a positive integer.`);
    return 0;
  }
  return value;
}

function normalizeCell(value, path, gridWidth, gridHeight, errors) {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) {
    errors.push(`${path} must contain integer x and y cell coordinates.`);
    return Object.freeze({ x: 0, y: 0 });
  }
  if (value.x < 0 || value.y < 0 || value.x >= gridWidth || value.y >= gridHeight) {
    errors.push(`${path} (${value.x}, ${value.y}) is outside the ${gridWidth}x${gridHeight} map grid.`);
  }
  return Object.freeze({ x: value.x, y: value.y });
}

function normalizeCellArray(value, path, gridWidth, gridHeight, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${path} must be ${allowEmpty ? 'an' : 'a non-empty'} array of cells.`);
    return Object.freeze([]);
  }
  const seen = new Set();
  const result = value.map((cell, index) => {
    const normalized = normalizeCell(cell, `${path}[${index}]`, gridWidth, gridHeight, errors);
    const key = cellKey(normalized);
    if (seen.has(key)) errors.push(`${path}[${index}] duplicates cell (${key}).`);
    seen.add(key);
    return normalized;
  });
  return Object.freeze(result);
}

function normalizeTerrain(source, gridWidth, gridHeight, errors) {
  const terrain = isRecord(source) ? source : {};
  if (!isRecord(source)) errors.push('terrain must be an object.');
  if (terrain.encoding !== 'rows') errors.push('terrain.encoding must be "rows".');

  const defaultTerrain = requireNonEmptyString(terrain.default, 'terrain.default', errors);
  if (defaultTerrain && !TERRAIN_TYPES.has(defaultTerrain)) {
    errors.push(`terrain.default uses unknown terrain type: ${defaultTerrain}.`);
  }

  const legend = isRecord(terrain.legend) ? terrain.legend : {};
  if (!isRecord(terrain.legend) || Object.keys(legend).length === 0) {
    errors.push('terrain.legend must be a non-empty symbol-to-terrain object.');
  }
  const normalizedLegend = {};
  for (const symbol of Object.keys(legend).sort()) {
    if ([...symbol].length !== 1) errors.push(`terrain.legend key "${symbol}" must be one character.`);
    const type = requireNonEmptyString(legend[symbol], `terrain.legend.${symbol}`, errors);
    if (type && !TERRAIN_TYPES.has(type)) errors.push(`terrain.legend.${symbol} uses unknown terrain type: ${type}.`);
    normalizedLegend[symbol] = type;
  }
  if (defaultTerrain && !Object.values(normalizedLegend).includes(defaultTerrain)) {
    errors.push('terrain.legend must include terrain.default.');
  }

  const rows = Array.isArray(terrain.rows) ? terrain.rows : [];
  if (!Array.isArray(terrain.rows)) errors.push('terrain.rows must be an array of strings.');
  if (rows.length !== gridHeight) errors.push(`terrain.rows must contain exactly ${gridHeight} rows.`);

  const cells = [];
  const normalizedRows = [];
  for (let y = 0; y < gridHeight; y += 1) {
    const row = rows[y];
    if (typeof row !== 'string') {
      errors.push(`terrain.rows[${y}] must be a string.`);
      normalizedRows.push('');
      for (let x = 0; x < gridWidth; x += 1) cells.push(defaultTerrain || 'open');
      continue;
    }
    if ([...row].length !== gridWidth) errors.push(`terrain.rows[${y}] must contain exactly ${gridWidth} symbols.`);
    normalizedRows.push(row);
    const symbols = [...row];
    for (let x = 0; x < gridWidth; x += 1) {
      const symbol = symbols[x];
      if (!(symbol in normalizedLegend)) {
        errors.push(`terrain.rows[${y}][${x}] uses unknown symbol: ${symbol ?? '<missing>'}.`);
        cells.push(defaultTerrain || 'open');
      } else {
        cells.push(normalizedLegend[symbol]);
      }
    }
  }

  return Object.freeze({
    encoding: 'rows',
    default: defaultTerrain,
    legend: Object.freeze(normalizedLegend),
    rows: Object.freeze(normalizedRows),
    cells: Object.freeze(cells),
  });
}

function normalizeHeights(source, gridWidth, gridHeight, errors) {
  if (source === undefined) {
    return Object.freeze({ encoding: 'rows', cells: Object.freeze(Array(gridWidth * gridHeight).fill(0)) });
  }
  if (!isRecord(source)) {
    errors.push('heights must be an object when supplied.');
    return Object.freeze({ encoding: 'rows', cells: Object.freeze(Array(gridWidth * gridHeight).fill(0)) });
  }
  if (source.encoding !== 'rows') errors.push('heights.encoding must be "rows".');
  const rows = Array.isArray(source.rows) ? source.rows : [];
  if (!Array.isArray(source.rows)) errors.push('heights.rows must be an array of numeric rows.');
  if (rows.length !== gridHeight) errors.push(`heights.rows must contain exactly ${gridHeight} rows.`);

  const cells = [];
  for (let y = 0; y < gridHeight; y += 1) {
    const row = rows[y];
    if (!Array.isArray(row)) {
      errors.push(`heights.rows[${y}] must be an array.`);
      for (let x = 0; x < gridWidth; x += 1) cells.push(0);
      continue;
    }
    if (row.length !== gridWidth) errors.push(`heights.rows[${y}] must contain exactly ${gridWidth} values.`);
    for (let x = 0; x < gridWidth; x += 1) {
      const height = row[x];
      if (!Number.isInteger(height)) errors.push(`heights.rows[${y}][${x}] must be an integer elevation level.`);
      cells.push(Number.isInteger(height) ? height : 0);
    }
  }
  return Object.freeze({ encoding: 'rows', cells: Object.freeze(cells) });
}

function normalizePassability(source, gridWidth, gridHeight, errors) {
  if (source === undefined) return Object.freeze([]);
  if (!Array.isArray(source)) {
    errors.push('passability must be an array when supplied.');
    return Object.freeze([]);
  }
  const seen = new Set();
  return Object.freeze(source.map((entry, index) => {
    const path = `passability[${index}]`;
    if (!isRecord(entry)) errors.push(`${path} must be an object.`);
    const cell = normalizeCell(entry?.cell, `${path}.cell`, gridWidth, gridHeight, errors);
    const key = cellKey(cell);
    if (seen.has(key)) errors.push(`${path} duplicates a passability override for cell (${key}).`);
    seen.add(key);
    const layers = isRecord(entry?.layers) ? entry.layers : {};
    if (!isRecord(entry?.layers) || Object.keys(layers).length === 0) errors.push(`${path}.layers must be a non-empty object.`);
    const normalizedLayers = {};
    for (const layer of Object.keys(layers).sort()) {
      if (!MOVEMENT_LAYERS.has(layer)) errors.push(`${path}.layers uses unknown movement layer: ${layer}.`);
      if (typeof layers[layer] !== 'boolean') errors.push(`${path}.layers.${layer} must be boolean.`);
      normalizedLayers[layer] = Boolean(layers[layer]);
    }
    return Object.freeze({ cell, layers: Object.freeze(normalizedLayers) });
  }));
}

function normalizeCellFeatures(source, family, gridWidth, gridHeight, errors) {
  if (source === undefined) return Object.freeze([]);
  if (!Array.isArray(source)) {
    errors.push(`${family} must be an array when supplied.`);
    return Object.freeze([]);
  }
  const ids = new Set();
  const occupied = new Set();
  return Object.freeze(source.map((entry, index) => {
    const path = `${family}[${index}]`;
    if (!isRecord(entry)) errors.push(`${path} must be an object.`);
    const id = requireNonEmptyString(entry?.id, `${path}.id`, errors);
    if (ids.has(id)) errors.push(`${path}.id duplicates ${family} id: ${id}.`);
    ids.add(id);
    const cells = normalizeCellArray(entry?.cells, `${path}.cells`, gridWidth, gridHeight, errors);
    for (const cell of cells) {
      const key = cellKey(cell);
      if (occupied.has(key)) errors.push(`${path}.cells overlaps another ${family} feature at (${key}).`);
      occupied.add(key);
    }
    const metadata = cloneJson(entry?.metadata ?? {}, `${path}.metadata`, errors);
    return Object.freeze({ id, cells, metadata: deepFreeze(metadata) });
  }));
}

function normalizeFootprint(value, path, errors) {
  if (value === undefined) return Object.freeze({ width: 1, height: 1 });
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return Object.freeze({ width: 1, height: 1 });
  }
  return Object.freeze({
    width: requirePositiveInteger(value.width, `${path}.width`, errors),
    height: requirePositiveInteger(value.height, `${path}.height`, errors),
  });
}

function normalizeProps(source, gridWidth, gridHeight, errors) {
  if (source === undefined) return Object.freeze([]);
  if (!Array.isArray(source)) {
    errors.push('props must be an array when supplied.');
    return Object.freeze([]);
  }
  const ids = new Set();
  return Object.freeze(source.map((entry, index) => {
    const path = `props[${index}]`;
    if (!isRecord(entry)) errors.push(`${path} must be an object.`);
    const id = requireNonEmptyString(entry?.id, `${path}.id`, errors);
    if (ids.has(id)) errors.push(`${path}.id duplicates prop id: ${id}.`);
    ids.add(id);
    const type = requireNonEmptyString(entry?.type, `${path}.type`, errors);
    const cell = normalizeCell(entry?.cell, `${path}.cell`, gridWidth, gridHeight, errors);
    const footprint = normalizeFootprint(entry?.footprint, `${path}.footprint`, errors);
    if (cell.x + footprint.width > gridWidth || cell.y + footprint.height > gridHeight) {
      errors.push(`${path}.footprint extends outside the map grid.`);
    }
    const blockingLayers = entry?.blockingLayers === undefined ? [] : entry.blockingLayers;
    if (!Array.isArray(blockingLayers)) errors.push(`${path}.blockingLayers must be an array.`);
    const normalizedLayers = [...new Set(Array.isArray(blockingLayers) ? blockingLayers : [])].sort();
    for (const layer of normalizedLayers) if (!MOVEMENT_LAYERS.has(layer)) errors.push(`${path}.blockingLayers uses unknown movement layer: ${layer}.`);
    const metadata = cloneJson(entry?.metadata ?? {}, `${path}.metadata`, errors);
    return Object.freeze({ id, type, cell, footprint, blockingLayers: Object.freeze(normalizedLayers), metadata: deepFreeze(metadata) });
  }));
}

function normalizeResources(source, gridWidth, gridHeight, errors) {
  if (source === undefined) return Object.freeze([]);
  if (!Array.isArray(source)) {
    errors.push('resources must be an array when supplied.');
    return Object.freeze([]);
  }
  const ids = new Set();
  return Object.freeze(source.map((entry, index) => {
    const path = `resources[${index}]`;
    if (!isRecord(entry)) errors.push(`${path} must be an object.`);
    const id = requireNonEmptyString(entry?.id, `${path}.id`, errors);
    if (ids.has(id)) errors.push(`${path}.id duplicates resource id: ${id}.`);
    ids.add(id);
    const type = requireNonEmptyString(entry?.type, `${path}.type`, errors);
    const cell = normalizeCell(entry?.cell, `${path}.cell`, gridWidth, gridHeight, errors);
    const amount = entry?.amount;
    if (!Number.isFinite(amount) || amount < 0) errors.push(`${path}.amount must be a non-negative finite number.`);
    const metadata = cloneJson(entry?.metadata ?? {}, `${path}.metadata`, errors);
    return Object.freeze({ id, type, cell, amount: Number.isFinite(amount) ? amount : 0, metadata: deepFreeze(metadata) });
  }));
}

function normalizeStarts(source, legacySpawns, gridWidth, gridHeight, errors) {
  if (source !== undefined && legacySpawns !== undefined) errors.push('Define starts or spawns, not both.');
  const selected = source ?? legacySpawns;
  if (!isRecord(selected) || Object.keys(selected).length === 0) {
    errors.push('starts must be a non-empty record of start groups.');
    return Object.freeze({});
  }
  const ids = new Set();
  const result = {};
  for (const group of Object.keys(selected).sort()) {
    requireNonEmptyString(group, 'start group id', errors);
    const entries = selected[group];
    if (!Array.isArray(entries) || entries.length === 0) errors.push(`starts.${group} must be a non-empty array.`);
    result[group] = Object.freeze((Array.isArray(entries) ? entries : []).map((entry, index) => {
      const path = `starts.${group}[${index}]`;
      if (!isRecord(entry)) errors.push(`${path} must be an object.`);
      const id = requireNonEmptyString(entry?.id, `${path}.id`, errors);
      if (ids.has(id)) errors.push(`${path}.id duplicates start id: ${id}.`);
      ids.add(id);
      const cell = normalizeCell(entry?.cell, `${path}.cell`, gridWidth, gridHeight, errors);
      const facing = entry?.facing ?? null;
      if (facing !== null && (!Number.isFinite(facing) || facing < 0 || facing >= 360)) {
        errors.push(`${path}.facing must be null or a finite angle in [0, 360).`);
      }
      const metadata = cloneJson(entry?.metadata ?? {}, `${path}.metadata`, errors);
      return Object.freeze({ id, cell, facing, metadata: deepFreeze(metadata) });
    }));
  }
  return Object.freeze(result);
}

function normalizeRegions(source, gridWidth, gridHeight, errors) {
  if (source === undefined) return Object.freeze({});
  if (!isRecord(source)) {
    errors.push('regions must be an object when supplied.');
    return Object.freeze({});
  }
  const result = {};
  for (const id of Object.keys(source).sort()) {
    const path = `regions.${id}`;
    requireNonEmptyString(id, 'region id', errors);
    const region = source[id];
    if (!isRecord(region)) errors.push(`${path} must be an object.`);
    const shape = requireNonEmptyString(region?.shape, `${path}.shape`, errors);
    if (shape && !REGION_SHAPES.has(shape)) errors.push(`${path}.shape must be rect, circle, or polygon.`);
    const metadata = deepFreeze(cloneJson(region?.metadata ?? {}, `${path}.metadata`, errors));
    if (shape === 'rect') {
      const origin = normalizeCell(region?.origin, `${path}.origin`, gridWidth, gridHeight, errors);
      const width = requirePositiveInteger(region?.width, `${path}.width`, errors);
      const height = requirePositiveInteger(region?.height, `${path}.height`, errors);
      if (origin.x + width > gridWidth || origin.y + height > gridHeight) errors.push(`${path} extends outside the map grid.`);
      result[id] = Object.freeze({ shape, origin, width, height, metadata });
    } else if (shape === 'circle') {
      const center = normalizeCell(region?.center, `${path}.center`, gridWidth, gridHeight, errors);
      const radius = region?.radius;
      if (!Number.isFinite(radius) || radius <= 0) errors.push(`${path}.radius must be a positive finite number.`);
      if (Number.isFinite(radius) && (center.x - radius < 0 || center.y - radius < 0 || center.x + radius >= gridWidth || center.y + radius >= gridHeight)) {
        errors.push(`${path} extends outside the map grid.`);
      }
      result[id] = Object.freeze({ shape, center, radius: Number.isFinite(radius) ? radius : 0, metadata });
    } else if (shape === 'polygon') {
      const points = normalizeCellArray(region?.points, `${path}.points`, gridWidth, gridHeight, errors);
      if (points.length < 3) errors.push(`${path}.points must contain at least three cells.`);
      result[id] = Object.freeze({ shape, points, metadata });
    } else {
      result[id] = Object.freeze({ shape, metadata });
    }
  }
  return Object.freeze(result);
}

function normalizeTriggers(source, errors) {
  if (source === undefined) return Object.freeze([]);
  if (!Array.isArray(source)) {
    errors.push('triggers must be an array when supplied.');
    return Object.freeze([]);
  }
  const ids = new Set();
  return Object.freeze(source.map((trigger, index) => {
    const path = `triggers[${index}]`;
    if (!isRecord(trigger)) errors.push(`${path} must be an object.`);
    const id = requireNonEmptyString(trigger?.id, `${path}.id`, errors);
    if (ids.has(id)) errors.push(`${path}.id duplicates trigger id: ${id}.`);
    ids.add(id);
    const normalized = cloneJson(trigger ?? {}, path, errors);
    if (isRecord(normalized)) normalized.id = id;
    return deepFreeze(normalized);
  }));
}

function flattenFeatureCells(features) {
  return Object.freeze(features.flatMap((feature) => feature.cells));
}

function applyFeatureTerrain(cells, features, terrainType, gridWidth) {
  for (const feature of features) {
    for (const cell of feature.cells) cells[cell.y * gridWidth + cell.x] = terrainType;
  }
}

function inspectAuthoredMap(source) {
  const errors = [];
  if (!isRecord(source)) {
    return { errors: ['map must be an object.'], value: null };
  }

  const formatVersion = source.formatVersion;
  if (formatVersion !== AUTHORED_MAP_FORMAT_VERSION) {
    errors.push(`formatVersion must be ${AUTHORED_MAP_FORMAT_VERSION}.`);
  }
  const id = requireNonEmptyString(source.id, 'id', errors);
  const name = requireNonEmptyString(source.name, 'name', errors);
  const width = requirePositiveInteger(source.width, 'width', errors);
  const height = requirePositiveInteger(source.height, 'height', errors);
  const tileSize = requirePositiveInteger(source.tileSize, 'tileSize', errors);
  if (tileSize && width % tileSize !== 0) errors.push('width must be an exact multiple of tileSize.');
  if (tileSize && height % tileSize !== 0) errors.push('height must be an exact multiple of tileSize.');
  const gridWidth = tileSize ? Math.max(0, Math.floor(width / tileSize)) : 0;
  const gridHeight = tileSize ? Math.max(0, Math.floor(height / tileSize)) : 0;

  const terrain = normalizeTerrain(source.terrain, gridWidth, gridHeight, errors);
  const heights = normalizeHeights(source.heights, gridWidth, gridHeight, errors);
  const passability = normalizePassability(source.passability, gridWidth, gridHeight, errors);
  const roads = normalizeCellFeatures(source.roads, 'roads', gridWidth, gridHeight, errors);
  const water = normalizeCellFeatures(source.water, 'water', gridWidth, gridHeight, errors);
  const bridges = normalizeCellFeatures(source.bridges, 'bridges', gridWidth, gridHeight, errors);
  if (source.props !== undefined && source.decorations !== undefined) {
    errors.push('Define props or decorations, not both.');
  }
  const props = normalizeProps(source.props ?? source.decorations, gridWidth, gridHeight, errors);
  const resources = normalizeResources(source.resources, gridWidth, gridHeight, errors);
  const starts = normalizeStarts(source.starts, source.spawns, gridWidth, gridHeight, errors);
  const regions = normalizeRegions(source.regions, gridWidth, gridHeight, errors);
  const triggers = normalizeTriggers(source.triggers, errors);
  const metadata = deepFreeze(cloneJson(source.metadata ?? {}, 'metadata', errors));

  const waterCells = new Set(flattenFeatureCells(water).map(cellKey));
  for (const bridge of bridges) {
    for (const cell of bridge.cells) {
      if (!waterCells.has(cellKey(cell))) errors.push(`bridges.${bridge.id} cell (${cellKey(cell)}) must overlap authored water.`);
    }
  }

  const finalTerrainCells = [...terrain.cells];
  applyFeatureTerrain(finalTerrainCells, roads, 'road', gridWidth);
  applyFeatureTerrain(finalTerrainCells, water, 'water', gridWidth);
  applyFeatureTerrain(finalTerrainCells, bridges, 'bridge', gridWidth);

  const navigationTerrain = [];
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const type = finalTerrainCells[y * gridWidth + x];
      if (type !== terrain.default) navigationTerrain.push(Object.freeze({ x, y, type }));
    }
  }
  const blockers = props
    .filter((prop) => prop.blockingLayers.length > 0)
    .map((prop) => Object.freeze({ id: prop.id, origin: prop.cell, footprint: prop.footprint, layers: prop.blockingLayers }));

  const value = deepFreeze({
    formatVersion: AUTHORED_MAP_FORMAT_VERSION,
    id,
    name,
    width,
    height,
    tileSize,
    grid: { width: gridWidth, height: gridHeight },
    terrain: {
      encoding: 'row-major',
      default: terrain.default,
      cells: finalTerrainCells,
    },
    heights,
    passability,
    roads,
    water,
    bridges,
    props,
    resources,
    starts,
    regions,
    triggers,
    metadata,
    navigation: {
      width: gridWidth,
      height: gridHeight,
      tileSize,
      defaultTerrain: terrain.default,
      terrain: navigationTerrain,
      shelterbelts: navigationTerrain.filter((cell) => cell.type === 'shelterbelt').map(({ x, y }) => ({ x, y })),
      roads: flattenFeatureCells(roads),
      bridges: flattenFeatureCells(bridges),
      blockers,
      passabilityOverrides: passability,
    },
  });

  return { errors, value };
}

export class AuthoredMapValidationError extends Error {
  constructor(errors) {
    super(`Authored map validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'AuthoredMapValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

export function validateAuthoredMap(source) {
  return Object.freeze([...inspectAuthoredMap(source).errors]);
}

export function loadAuthoredMap(source) {
  const result = inspectAuthoredMap(source);
  if (result.errors.length > 0) throw new AuthoredMapValidationError(result.errors);
  return result.value;
}
