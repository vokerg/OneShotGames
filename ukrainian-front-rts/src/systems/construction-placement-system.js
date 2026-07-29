import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import { MOVEMENT_LAYERS, TERRAIN_TYPES } from '../navigation/navigation-grid.js';

export const CONSTRUCTION_ROTATIONS = Object.freeze([0, 90]);

export const PLACEMENT_REASONS = Object.freeze({
  READY: 'ready',
  UNKNOWN_BUILDING: 'unknown-building',
  WORKER_UNAVAILABLE: 'worker-unavailable',
  OUT_OF_BOUNDS: 'out-of-bounds',
  TERRAIN_BLOCKED: 'terrain-blocked',
  BUILDING_OVERLAP: 'building-overlap',
  RESOURCE_OVERLAP: 'resource-overlap',
  UNIT_OVERLAP: 'unit-overlap',
  NO_ACCESS: 'no-access',
});

export const PLACEMENT_MESSAGES = Object.freeze({
  [PLACEMENT_REASONS.READY]: 'Construction site is valid.',
  [PLACEMENT_REASONS.UNKNOWN_BUILDING]: 'That structure cannot be constructed.',
  [PLACEMENT_REASONS.WORKER_UNAVAILABLE]: 'The assigned engineer is no longer available.',
  [PLACEMENT_REASONS.OUT_OF_BOUNDS]: 'Cannot build there: the full footprint must remain inside the battlefield.',
  [PLACEMENT_REASONS.TERRAIN_BLOCKED]:
    'Cannot build there: water, bridges, blocked terrain, and other unflattenable cells are not valid foundations.',
  [PLACEMENT_REASONS.BUILDING_OVERLAP]:
    'Cannot build there: the footprint overlaps an existing structure or navigation blocker.',
  [PLACEMENT_REASONS.RESOURCE_OVERLAP]:
    'Cannot build there: keep the full footprint clear of active resource sites.',
  [PLACEMENT_REASONS.UNIT_OVERLAP]:
    'Cannot build there: move units out of the construction footprint.',
  [PLACEMENT_REASONS.NO_ACCESS]:
    'Cannot build there: the assigned engineer has no reachable construction approach.',
});

const FLATTENABLE_TERRAIN = new Set([
  TERRAIN_TYPES.OPEN,
  TERRAIN_TYPES.ROAD,
  TERRAIN_TYPES.MUD,
  TERRAIN_TYPES.RUBBLE,
]);
const BLOCKED_LAYERS = new Set([MOVEMENT_LAYERS.GROUND, MOVEMENT_LAYERS.AMPHIBIOUS]);
const EPSILON = 1e-9;
const RESOURCE_CLEARANCE = 42;
const CARDINAL_STEPS = Object.freeze([
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
]);

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function normalizeRotation(rotation = 0) {
  const numeric = Number(rotation);
  const normalized = ((numeric % 180) + 180) % 180;
  if (!CONSTRUCTION_ROTATIONS.includes(normalized)) {
    throw new RangeError(`Construction rotation must be one of: ${CONSTRUCTION_ROTATIONS.join(', ')}.`);
  }
  return normalized;
}

function assertFinitePoint(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('Construction placement requires finite world coordinates.');
  }
}

function placementResult({
  valid,
  reason,
  type,
  rotation,
  origin = null,
  footprint = null,
  x = null,
  y = null,
  cells = [],
  flattenCells = [],
  approachCell = null,
  blocksPath = false,
  blockerIds = [],
} = {}) {
  const message = PLACEMENT_MESSAGES[reason] || 'Construction placement is invalid.';
  const warning = blocksPath
    ? 'Warning: this footprint severs a currently connected local ground route.'
    : '';
  return Object.freeze({
    valid: Boolean(valid),
    reason,
    message,
    warning,
    type,
    rotation,
    origin: origin ? Object.freeze({ ...origin }) : null,
    footprint: footprint ? Object.freeze({ ...footprint }) : null,
    x,
    y,
    cells: Object.freeze(cells.map((cell) => Object.freeze({ ...cell }))),
    flattenCells: Object.freeze(flattenCells.map((cell) => Object.freeze({ ...cell }))),
    approachCell: approachCell ? Object.freeze({ ...approachCell }) : null,
    blocksPath: Boolean(blocksPath),
    blockerIds: Object.freeze([...blockerIds].sort()),
  });
}

export function constructionFootprint(typeOrStats, rotation = 0, tileSize = WORLD.tile) {
  const stats = typeof typeOrStats === 'string' ? BUILDING_TYPES[typeOrStats] : typeOrStats;
  if (!stats || !Number.isFinite(stats.w) || !Number.isFinite(stats.h)) {
    throw new TypeError('Construction footprint requires building width and height.');
  }
  if (!Number.isInteger(tileSize) || tileSize <= 0) {
    throw new TypeError('Construction tile size must be a positive integer.');
  }
  const normalizedRotation = normalizeRotation(rotation);
  const base = {
    width: Math.max(1, Math.ceil(stats.w / tileSize)),
    height: Math.max(1, Math.ceil(stats.h / tileSize)),
  };
  return Object.freeze(
    normalizedRotation === 90
      ? { width: base.height, height: base.width }
      : base,
  );
}

export function supportsConstructionRotation(typeOrStats, tileSize = WORLD.tile) {
  const stats = typeof typeOrStats === 'string' ? BUILDING_TYPES[typeOrStats] : typeOrStats;
  if (!stats || stats.rotationLocked) return false;
  const zero = constructionFootprint(stats, 0, tileSize);
  const ninety = constructionFootprint(stats, 90, tileSize);
  return zero.width !== ninety.width || zero.height !== ninety.height;
}

export function snapConstructionPlacement(grid, typeOrStats, x, y, rotation = 0) {
  if (!grid || !Number.isInteger(grid.tileSize) || grid.tileSize <= 0) {
    throw new TypeError('Construction placement requires a navigation grid with a positive tileSize.');
  }
  assertFinitePoint(x, y);
  const normalizedRotation = normalizeRotation(rotation);
  const footprint = constructionFootprint(typeOrStats, normalizedRotation, grid.tileSize);
  const origin = {
    x: Math.round(x / grid.tileSize - footprint.width / 2),
    y: Math.round(y / grid.tileSize - footprint.height / 2),
  };
  const center = {
    x: (origin.x + footprint.width / 2) * grid.tileSize,
    y: (origin.y + footprint.height / 2) * grid.tileSize,
  };
  return Object.freeze({
    rotation: normalizedRotation,
    origin: Object.freeze(origin),
    footprint,
    x: center.x,
    y: center.y,
  });
}

function placementCells(grid, origin, footprint) {
  if (
    origin.x < 0 ||
    origin.y < 0 ||
    origin.x + footprint.width > grid.width ||
    origin.y + footprint.height > grid.height
  ) {
    return null;
  }
  return grid.cellsForFootprint(origin, footprint);
}

function cellBounds(grid, origin, footprint) {
  return {
    left: origin.x * grid.tileSize,
    top: origin.y * grid.tileSize,
    right: (origin.x + footprint.width) * grid.tileSize,
    bottom: (origin.y + footprint.height) * grid.tileSize,
  };
}

function circleIntersectsBounds(entity, radius, bounds) {
  const nearestX = Math.max(bounds.left, Math.min(entity.x, bounds.right));
  const nearestY = Math.max(bounds.top, Math.min(entity.y, bounds.bottom));
  return Math.hypot(entity.x - nearestX, entity.y - nearestY) < radius - EPSILON;
}

function activeWorker(game, workerId) {
  return (game.units || []).find(
    (unit) =>
      unit.id === workerId &&
      unit.team === TEAM.UA &&
      unit.hp > 0 &&
      UNIT_TYPES[unit.type]?.worker,
  ) || null;
}

function perimeterCells(grid, origin, footprint) {
  const cells = [];
  for (let x = origin.x - 1; x <= origin.x + footprint.width; x += 1) {
    cells.push({ x, y: origin.y - 1 });
    cells.push({ x, y: origin.y + footprint.height });
  }
  for (let y = origin.y; y < origin.y + footprint.height; y += 1) {
    cells.push({ x: origin.x - 1, y });
    cells.push({ x: origin.x + footprint.width, y });
  }
  const unique = new Map();
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height) continue;
    unique.set(keyOf(cell), cell);
  }
  return [...unique.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

function overlayGrid(grid, blockedCells) {
  const blocked = new Set(blockedCells.map(keyOf));
  return {
    width: grid.width,
    height: grid.height,
    tileSize: grid.tileSize,
    terrainRules: grid.terrainRules,
    worldToCell: (x, y) => grid.worldToCell(x, y),
    movementCost: (x, y, layer) => grid.movementCost(x, y, layer),
    isPassable(x, y, query = {}) {
      const footprint = query.footprint || { width: 1, height: 1 };
      let cells;
      try {
        cells = grid.cellsForFootprint({ x, y }, footprint);
      } catch {
        return false;
      }
      if (
        BLOCKED_LAYERS.has(query.layer || MOVEMENT_LAYERS.GROUND) &&
        cells.some((cell) => blocked.has(keyOf(cell)))
      ) {
        return false;
      }
      return grid.isPassable(x, y, query);
    },
  };
}

function traversable(grid, cell) {
  return grid.isPassable(cell.x, cell.y, {
    layer: MOVEMENT_LAYERS.GROUND,
    footprint: { width: 1, height: 1 },
  });
}

function flood(grid, start, targetKeys = null, bounds = null) {
  if (!traversable(grid, start)) return { visited: new Set(), target: null };
  const queue = [start];
  const visited = new Set([keyOf(start)]);
  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    const currentKey = keyOf(current);
    if (targetKeys?.has(currentKey)) return { visited, target: current };
    for (const step of CARDINAL_STEPS) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (next.x < 0 || next.y < 0 || next.x >= grid.width || next.y >= grid.height) continue;
      if (
        bounds &&
        (next.x < bounds.left ||
          next.x > bounds.right ||
          next.y < bounds.top ||
          next.y > bounds.bottom)
      ) {
        continue;
      }
      const nextKey = keyOf(next);
      if (visited.has(nextKey) || !traversable(grid, next)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }
  return { visited, target: null };
}

function perimeterComponentCount(grid, cells, bounds) {
  const remaining = new Map(
    cells.filter((cell) => traversable(grid, cell)).map((cell) => [keyOf(cell), cell]),
  );
  let components = 0;
  while (remaining.size) {
    const seed = remaining.values().next().value;
    const { visited } = flood(grid, seed, null, bounds);
    components += 1;
    for (const key of visited) remaining.delete(key);
  }
  return components;
}

function localRouteBounds(grid, blockedCells, margin = 5) {
  const xs = blockedCells.map((cell) => cell.x);
  const ys = blockedCells.map((cell) => cell.y);
  return {
    left: Math.max(0, Math.min(...xs) - margin),
    right: Math.min(grid.width - 1, Math.max(...xs) + margin),
    top: Math.max(0, Math.min(...ys) - margin),
    bottom: Math.min(grid.height - 1, Math.max(...ys) + margin),
  };
}

function routeImpact(grid, blockedCells, perimeter) {
  const proposed = overlayGrid(grid, blockedCells);
  const bounds = localRouteBounds(grid, blockedCells);
  const before = perimeterComponentCount(grid, perimeter, bounds);
  const after = perimeterComponentCount(proposed, perimeter, bounds);
  return {
    grid: proposed,
    blocksPath: after > before,
  };
}

function reachableApproach(grid, worker, perimeter) {
  let workerCell;
  try {
    workerCell = grid.worldToCell(worker.x, worker.y);
  } catch {
    return null;
  }
  const targets = new Set(
    perimeter.filter((cell) => traversable(grid, cell)).map(keyOf),
  );
  if (!targets.size) return null;
  return flood(grid, workerCell, targets).target;
}

export function buildingNavigationBlocker(building) {
  const placement = building?.placement;
  if (
    placement?.origin &&
    Number.isInteger(placement.origin.x) &&
    Number.isInteger(placement.origin.y) &&
    placement?.footprint &&
    Number.isInteger(placement.footprint.width) &&
    Number.isInteger(placement.footprint.height)
  ) {
    return {
      id: `building:${building.id}`,
      origin: { ...placement.origin },
      footprint: { ...placement.footprint },
      layers: [MOVEMENT_LAYERS.GROUND, MOVEMENT_LAYERS.AMPHIBIOUS],
    };
  }

  const stats = BUILDING_TYPES[building?.type];
  if (!stats) return null;
  const left = Math.max(0, Math.floor((building.x - stats.w / 2) / WORLD.tile));
  const top = Math.max(0, Math.floor((building.y - stats.h / 2) / WORLD.tile));
  const right = Math.min(WORLD.w / WORLD.tile, Math.ceil((building.x + stats.w / 2) / WORLD.tile));
  const bottom = Math.min(WORLD.h / WORLD.tile, Math.ceil((building.y + stats.h / 2) / WORLD.tile));
  if (right <= left || bottom <= top) return null;
  return {
    id: `building:${building.id}`,
    origin: { x: left, y: top },
    footprint: { width: right - left, height: bottom - top },
    layers: [MOVEMENT_LAYERS.GROUND, MOVEMENT_LAYERS.AMPHIBIOUS],
  };
}

export function evaluateConstructionPlacement(
  game,
  type,
  x,
  y,
  {
    rotation = game?.pendingBuild?.rotation ?? 0,
    workerId = game?.pendingBuild?.workerId,
    navigationState,
  } = {},
) {
  const stats = BUILDING_TYPES[type];
  if (!stats?.cost) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.UNKNOWN_BUILDING,
      type,
      rotation: normalizeRotation(rotation),
    });
  }
  if (!navigationState?.grid) {
    throw new TypeError('Construction placement requires a synchronized navigation state.');
  }

  const grid = navigationState.grid;
  const snapped = snapConstructionPlacement(grid, stats, x, y, rotation);
  const worker = activeWorker(game, workerId);
  if (!worker) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.WORKER_UNAVAILABLE,
      type,
      ...snapped,
    });
  }

  const cells = placementCells(grid, snapped.origin, snapped.footprint);
  if (!cells) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.OUT_OF_BOUNDS,
      type,
      ...snapped,
    });
  }

  const flattenCells = [];
  for (const cell of cells) {
    const terrain = grid.getTerrain(cell.x, cell.y);
    if (!FLATTENABLE_TERRAIN.has(terrain)) {
      return placementResult({
        valid: false,
        reason: PLACEMENT_REASONS.TERRAIN_BLOCKED,
        type,
        ...snapped,
        cells,
      });
    }
    if (terrain !== TERRAIN_TYPES.OPEN) flattenCells.push(cell);
  }

  const blockerIds = new Set();
  for (const cell of cells) {
    for (const id of grid.blockerIdsAt(cell.x, cell.y, MOVEMENT_LAYERS.GROUND)) {
      blockerIds.add(id);
    }
  }
  if (blockerIds.size) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.BUILDING_OVERLAP,
      type,
      ...snapped,
      cells,
      flattenCells,
      blockerIds: [...blockerIds],
    });
  }

  const bounds = cellBounds(grid, snapped.origin, snapped.footprint);
  if (
    (game.nodes || []).some(
      (node) => circleIntersectsBounds(node, RESOURCE_CLEARANCE, bounds),
    )
  ) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.RESOURCE_OVERLAP,
      type,
      ...snapped,
      cells,
      flattenCells,
    });
  }

  if (
    (game.units || []).some((unit) => {
      if (unit.hp <= 0) return false;
      const statsForUnit = UNIT_TYPES[unit.type];
      return circleIntersectsBounds(unit, (statsForUnit?.size || 10) + 4, bounds);
    })
  ) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.UNIT_OVERLAP,
      type,
      ...snapped,
      cells,
      flattenCells,
    });
  }

  const perimeter = perimeterCells(grid, snapped.origin, snapped.footprint);
  const impact = routeImpact(grid, cells, perimeter);
  const approachCell = reachableApproach(impact.grid, worker, perimeter);
  if (!approachCell) {
    return placementResult({
      valid: false,
      reason: PLACEMENT_REASONS.NO_ACCESS,
      type,
      ...snapped,
      cells,
      flattenCells,
      blocksPath: impact.blocksPath,
    });
  }

  return placementResult({
    valid: true,
    reason: PLACEMENT_REASONS.READY,
    type,
    ...snapped,
    cells,
    flattenCells,
    approachCell,
    blocksPath: impact.blocksPath,
  });
}

export function flattenConstructionTerrain(game, placement) {
  if (!placement?.valid || !Array.isArray(game?.terrain)) return [];
  const width = WORLD.w / WORLD.tile;
  return placement.flattenCells.map((cell) => {
    const index = cell.y * width + cell.x;
    const previous = game.terrain[index];
    game.terrain[index] = 0;
    return Object.freeze({ x: cell.x, y: cell.y, previous });
  });
}

export function createConstructionPlacementController(game, { synchronizeNavigation } = {}) {
  if (typeof synchronizeNavigation !== 'function') {
    throw new TypeError('Construction placement controller requires synchronizeNavigation(game).');
  }
  for (const method of [
    'beginBuild',
    'cancelBuild',
    'canPlaceBuilding',
    'placeBuilding',
    'addBuilding',
    'canAfford',
    'pay',
    'select',
    'fail',
  ]) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Construction placement controller requires game.${method}().`);
    }
  }

  const originalBeginBuild = game.beginBuild.bind(game);
  const originalCancelBuild = game.cancelBuild.bind(game);
  const originalCanPlaceBuilding = game.canPlaceBuilding.bind(game);
  const originalPlaceBuilding = game.placeBuilding.bind(game);
  let cachedPreviewKey = null;
  let cachedPreview = null;

  const invalidatePreviewCache = () => {
    cachedPreviewKey = null;
    cachedPreview = null;
  };

  const preview = (type, x, y, rotation, workerId) => {
    const navigationState = synchronizeNavigation(game);
    const stats = BUILDING_TYPES[type];
    const snapped = stats
      ? snapConstructionPlacement(navigationState.grid, stats, x, y, rotation)
      : null;
    const worker = activeWorker(game, workerId);
    let workerCell = null;
    if (worker) {
      try {
        workerCell = navigationState.grid.worldToCell(worker.x, worker.y);
      } catch {
        workerCell = null;
      }
    }
    const previewKey = [
      type,
      normalizeRotation(rotation),
      snapped?.origin.x ?? 'x',
      snapped?.origin.y ?? 'y',
      navigationState.revision ?? navigationState.signature ?? 'navigation',
      workerCell?.x ?? 'worker-x',
      workerCell?.y ?? 'worker-y',
      game.time ?? 'time',
    ].join('|');
    if (previewKey === cachedPreviewKey) return cachedPreview;
    cachedPreview = evaluateConstructionPlacement(game, type, x, y, {
      rotation,
      workerId,
      navigationState,
    });
    cachedPreviewKey = previewKey;
    return cachedPreview;
  };

  game.beginBuild = (type) => {
    const accepted = originalBeginBuild(type);
    if (!accepted) return false;
    game.pendingBuild = {
      ...game.pendingBuild,
      rotation: 0,
    };
    game.pendingBuildPreview = null;
    invalidatePreviewCache();
    return true;
  };

  game.rotatePendingBuild = () => {
    game.lastError = '';
    const pending = game.pendingBuild;
    if (!pending) return game.fail('Choose a structure before rotating its footprint.');
    const stats = BUILDING_TYPES[pending.type];
    if (!supportsConstructionRotation(stats)) {
      return game.fail('This structure has no alternate tile footprint.');
    }
    pending.rotation = pending.rotation === 90 ? 0 : 90;
    game.pendingBuildPreview = null;
    invalidatePreviewCache();
    return pending.rotation;
  };

  game.previewBuildingPlacement = (x, y) => {
    const pending = game.pendingBuild;
    if (!pending) {
      game.pendingBuildPreview = null;
      return null;
    }
    const result = preview(pending.type, x, y, pending.rotation, pending.workerId);
    game.pendingBuildPreview = result;
    return result;
  };

  game.canPlaceBuilding = (type, x, y, options = {}) =>
    preview(
      type,
      x,
      y,
      options.rotation ?? game.pendingBuild?.rotation ?? 0,
      options.workerId ?? game.pendingBuild?.workerId,
    ).valid;

  game.cancelBuild = () => {
    const cancelled = originalCancelBuild();
    game.pendingBuildPreview = null;
    invalidatePreviewCache();
    return cancelled;
  };

  game.placeBuilding = (x, y) => {
    game.lastError = '';
    const pending = game.pendingBuild;
    if (!pending) return game.fail('Choose a structure from an engineer command card first.');

    const worker = activeWorker(game, pending.workerId);
    if (!worker) {
      game.pendingBuild = null;
      game.pendingBuildPreview = null;
      return game.fail(PLACEMENT_MESSAGES[PLACEMENT_REASONS.WORKER_UNAVAILABLE]);
    }

    const stats = BUILDING_TYPES[pending.type];
    if (!game.canAfford(stats.cost)) {
      return game.fail('Resources changed; construction is no longer affordable.');
    }

    const result = preview(pending.type, x, y, pending.rotation, pending.workerId);
    game.pendingBuildPreview = result;
    if (!result.valid) return game.fail(result.message);

    game.pay(stats.cost);
    const flattenedTerrain = flattenConstructionTerrain(game, result);
    const building = game.addBuilding(
      pending.type,
      TEAM.UA,
      result.x,
      result.y,
      { underConstruction: true },
    );
    building.rotation = result.rotation;
    building.placement = {
      rotation: result.rotation,
      origin: { ...result.origin },
      footprint: { ...result.footprint },
      approachCell: { ...result.approachCell },
      flattenedTerrain,
      blocksPath: result.blocksPath,
    };

    worker.order = { kind: 'construct', target: building };
    worker.target = null;
    game.pendingBuild = null;
    game.pendingBuildPreview = null;
    invalidatePreviewCache();
    game.lastPlacementWarning = result.warning;
    game.select(building);
    return true;
  };

  return () => {
    game.beginBuild = originalBeginBuild;
    game.cancelBuild = originalCancelBuild;
    game.canPlaceBuilding = originalCanPlaceBuilding;
    game.placeBuilding = originalPlaceBuilding;
    delete game.rotatePendingBuild;
    delete game.previewBuildingPlacement;
    delete game.pendingBuildPreview;
    delete game.lastPlacementWarning;
    invalidatePreviewCache();
  };
}
