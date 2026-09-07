import { TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  DEFAULT_TERRAIN_RULES,
  MOVEMENT_LAYERS,
  TERRAIN_TYPES,
} from '../navigation/navigation-grid.js';

export const RUNTIME_TERRAIN_BY_VALUE = Object.freeze({
  1: TERRAIN_TYPES.MUD,
  2: TERRAIN_TYPES.SHELTERBELT,
  3: TERRAIN_TYPES.RUBBLE,
  4: TERRAIN_TYPES.WATER,
  5: TERRAIN_TYPES.ROAD,
  6: TERRAIN_TYPES.BLOCKED,
});

export const RUNTIME_TERRAIN_RULES = Object.freeze({
  [TERRAIN_TYPES.OPEN]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.OPEN],
  [TERRAIN_TYPES.ROAD]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.ROAD],
  [TERRAIN_TYPES.MUD]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.MUD],
  [TERRAIN_TYPES.RUBBLE]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.RUBBLE],
  [TERRAIN_TYPES.WATER]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.WATER],
  [TERRAIN_TYPES.BRIDGE]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.BRIDGE],
  [TERRAIN_TYPES.SHELTERBELT]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.SHELTERBELT],
  [TERRAIN_TYPES.BLOCKED]: DEFAULT_TERRAIN_RULES[TERRAIN_TYPES.BLOCKED],
});

const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function distanceSquaredToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }
  const amount = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  const x = start.x + dx * amount;
  const y = start.y + dy * amount;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function normalizePolyline(points) {
  if (!Array.isArray(points)) throw new TypeError('Road polyline must be an array.');
  return points.map((point, index) => {
    const normalized = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
    if (!finitePoint(normalized)) throw new TypeError(`Road point ${index} must contain finite x and y coordinates.`);
    return Object.freeze({ x: normalized.x, y: normalized.y });
  });
}

function normalizeCellList(cells, label) {
  if (cells === undefined) return Object.freeze([]);
  if (!Array.isArray(cells)) throw new TypeError(`${label} must be an array.`);
  return Object.freeze(cells.map((cell, index) => {
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
      throw new TypeError(`${label} entry ${index} must contain integer x and y coordinates.`);
    }
    return Object.freeze({ x: cell.x, y: cell.y });
  }));
}

export function runtimeTerrainEntries(terrain, width = WORLD.w / WORLD.tile) {
  if (!Array.isArray(terrain)) throw new TypeError('Runtime terrain must be an array.');
  if (!Number.isInteger(width) || width <= 0) throw new TypeError('Runtime terrain width must be a positive integer.');
  const entries = [];
  for (let index = 0; index < terrain.length; index += 1) {
    const type = RUNTIME_TERRAIN_BY_VALUE[terrain[index]];
    if (!type) continue;
    entries.push(Object.freeze({
      x: index % width,
      y: Math.floor(index / width),
      type,
    }));
  }
  return Object.freeze(entries);
}

export function roadCellsFromPolyline(
  points,
  {
    width = WORLD.w / WORLD.tile,
    height = WORLD.h / WORLD.tile,
    tileSize = WORLD.tile,
    halfWidth = 25,
  } = {},
) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('Road raster dimensions must be positive integers.');
  }
  if (!Number.isFinite(tileSize) || tileSize <= 0 || !Number.isFinite(halfWidth) || halfWidth < 0) {
    throw new TypeError('Road tile size must be positive and half-width must be non-negative.');
  }
  const polyline = normalizePolyline(points);
  if (polyline.length === 0) return Object.freeze([]);

  const threshold = halfWidth ** 2;
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = { x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 };
      let distanceSquared = Number.POSITIVE_INFINITY;
      if (polyline.length === 1) {
        distanceSquared = distanceSquaredToSegment(center, polyline[0], polyline[0]);
      } else {
        for (let index = 1; index < polyline.length; index += 1) {
          distanceSquared = Math.min(
            distanceSquared,
            distanceSquaredToSegment(center, polyline[index - 1], polyline[index]),
          );
        }
      }
      if (distanceSquared <= threshold) cells.push(Object.freeze({ x, y }));
    }
  }
  return Object.freeze(cells);
}

export function runtimeNavigationTerrainData(game) {
  if (!game || !Array.isArray(game.terrain)) throw new TypeError('Runtime navigation terrain requires game terrain data.');
  return Object.freeze({
    terrain: runtimeTerrainEntries(game.terrain),
    shelterbelts: normalizeCellList(game.shelterbelts, 'Runtime shelterbelts'),
    roads: roadCellsFromPolyline(game.road ?? []),
    bridges: normalizeCellList(game.bridges, 'Runtime bridges'),
  });
}

function movementLayerForStats(stats) {
  if (stats?.movementLayer) return stats.movementLayer;
  return stats?.air ? MOVEMENT_LAYERS.AIR : MOVEMENT_LAYERS.GROUND;
}

function statsForUnit(game, unit) {
  if (unit.team === TEAM.UA && typeof game.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit.type];
}

function movementTarget(unit) {
  const order = unit.order;
  if (finitePoint(order)) return Object.freeze({ x: order.x, y: order.y });
  if (finitePoint(order?.target)) return Object.freeze({ x: order.target.x, y: order.target.y });
  if (finitePoint(unit.target)) return Object.freeze({ x: unit.target.x, y: unit.target.y });
  return null;
}

export function terrainMovementMultiplier(grid, unit, stats) {
  if (!grid?.movementProfileAtWorld || !finitePoint(unit)) return 1;
  try {
    const profile = grid.movementProfileAtWorld(unit.x, unit.y, movementLayerForStats(stats));
    if (!profile.passable) return 0;
    return Number.isFinite(profile.speedMultiplier) && profile.speedMultiplier >= 0
      ? profile.speedMultiplier
      : 1;
  } catch {
    return 1;
  }
}

export function scaleTerrainDisplacement(
  unit,
  before,
  multiplier,
  {
    target = null,
    minX = 18,
    maxX = WORLD.w - 18,
    minY = 18,
    maxY = WORLD.h - 18,
  } = {},
) {
  if (!finitePoint(unit) || !finitePoint(before)) throw new TypeError('Terrain displacement requires finite unit and before positions.');
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new TypeError('Terrain displacement multiplier must be non-negative and finite.');
  const dx = unit.x - before.x;
  const dy = unit.y - before.y;
  const moved = Math.hypot(dx, dy);
  if (moved === 0 || multiplier === 1) return Object.freeze({ moved, adjusted: moved, multiplier });

  let adjusted = moved * multiplier;
  if (finitePoint(target)) adjusted = Math.min(adjusted, Math.hypot(target.x - before.x, target.y - before.y));
  unit.x = clamp(before.x + (dx / moved) * adjusted, minX, maxX);
  unit.y = clamp(before.y + (dy / moved) * adjusted, minY, maxY);
  return Object.freeze({ moved, adjusted: Math.hypot(unit.x - before.x, unit.y - before.y), multiplier });
}

export function updateUnitWithTerrainMovement(game, unit, stepSeconds, grid) {
  if (!game || typeof game.updateUnit !== 'function') throw new TypeError('Terrain movement requires a game updateUnit method.');
  if (!unit || !Number.isFinite(stepSeconds) || stepSeconds < 0) {
    throw new TypeError('Terrain movement requires a unit and non-negative finite step duration.');
  }
  const stats = statsForUnit(game, unit);
  const before = Object.freeze({ x: unit.x, y: unit.y });
  const target = movementTarget(unit);
  const multiplier = terrainMovementMultiplier(grid, unit, stats);
  game.updateUnit(unit, stepSeconds);
  const displacement = scaleTerrainDisplacement(unit, before, multiplier, { target });
  unit.terrainMovementMultiplier = multiplier;
  return Object.freeze({ multiplier, displacement });
}
