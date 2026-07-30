import { combineSmokeDensity, smokeBlocksVision } from '../core/smoke-policy.js';

export const VISIBILITY_BLOCKERS = Object.freeze({
  TERRAIN: 'terrain',
  ELEVATION: 'elevation',
  BUILDING: 'building',
  SMOKE: 'smoke',
});

const cellKey = (x, y) => `${x},${y}`;

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

export function traceGridCells(origin, target, tileSize = 32) {
  assertPoint(origin, 'Origin');
  assertPoint(target, 'Target');
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new TypeError('Tile size must be positive.');

  const x0 = Math.floor(origin.x / tileSize);
  const y0 = Math.floor(origin.y / tileSize);
  const x1 = Math.floor(target.x / tileSize);
  const y1 = Math.floor(target.y / tileSize);
  const cells = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;

  while (true) {
    cells.push(Object.freeze({ x, y }));
    if (x === x1 && y === y1) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
  return Object.freeze(cells);
}

export function createVisibilityField({ width, height, tileSize = 32, terrain = [], elevation = [], blockers = [], smoke = [] }) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('Visibility field width and height must be positive integers.');
  }
  const size = width * height;
  const smokeDensity = new Map();
  for (const cell of smoke) {
    const key = cellKey(cell.x, cell.y);
    smokeDensity.set(key, combineSmokeDensity(smokeDensity.get(key) || 0, cell.density ?? 1));
  }
  return Object.freeze({
    width,
    height,
    tileSize,
    terrainSet: new Set(terrain.map((cell) => cellKey(cell.x, cell.y))),
    blockerSet: new Set(blockers.map((cell) => cellKey(cell.x, cell.y))),
    smokeSet: new Set(smokeDensity.keys()),
    smokeDensity,
    heights: Array.from({ length: size }, (_, index) => Number(elevation[index] || 0)),
  });
}

export function resolveLineOfSight(
  field,
  origin,
  target,
  { observerHeight = 1, targetHeight = 1, smokeBlocks = true, smokeThreshold } = {},
) {
  if (!field) throw new TypeError('Visibility field is required.');
  assertPoint(origin, 'Origin');
  assertPoint(target, 'Target');
  const cells = traceGridCells(origin, target, field.tileSize);
  const originCell = cells[0];
  const targetCell = cells[cells.length - 1];
  const originIndex = originCell.y * field.width + originCell.x;
  const targetIndex = targetCell.y * field.width + targetCell.x;
  const startElevation = Number(field.heights[originIndex] || 0) + observerHeight;
  const endElevation = Number(field.heights[targetIndex] || 0) + targetHeight;

  for (let index = 1; index < cells.length - 1; index += 1) {
    const cell = cells[index];
    if (cell.x < 0 || cell.y < 0 || cell.x >= field.width || cell.y >= field.height) {
      return Object.freeze({ visible: false, reason: VISIBILITY_BLOCKERS.TERRAIN, cell });
    }
    const key = cellKey(cell.x, cell.y);
    if (field.terrainSet.has(key)) return Object.freeze({ visible: false, reason: VISIBILITY_BLOCKERS.TERRAIN, cell });
    if (field.blockerSet.has(key)) return Object.freeze({ visible: false, reason: VISIBILITY_BLOCKERS.BUILDING, cell });
    const density = field.smokeDensity?.get(key) ?? (field.smokeSet.has(key) ? 1 : 0);
    if (smokeBlocks && smokeBlocksVision(density, smokeThreshold)) {
      return Object.freeze({ visible: false, reason: VISIBILITY_BLOCKERS.SMOKE, cell, smokeDensity: density });
    }

    const progress = index / (cells.length - 1);
    const sightHeight = startElevation + (endElevation - startElevation) * progress;
    const cellElevation = Number(field.heights[cell.y * field.width + cell.x] || 0);
    if (cellElevation > sightHeight) {
      return Object.freeze({ visible: false, reason: VISIBILITY_BLOCKERS.ELEVATION, cell });
    }
  }

  return Object.freeze({ visible: true, reason: null, cell: null });
}

export function createVisibilityQuery(field) {
  return Object.freeze({
    canSee(origin, target, options) {
      return resolveLineOfSight(field, origin, target, options).visible;
    },
    inspect(origin, target, options) {
      return resolveLineOfSight(field, origin, target, options);
    },
    visibleEntities(observer, entities, options) {
      return entities.filter((entity) => resolveLineOfSight(field, observer, entity, options).visible);
    },
  });
}
