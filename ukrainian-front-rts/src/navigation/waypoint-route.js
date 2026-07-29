import { DIAGONAL_POLICIES, PATH_STATUSES, findPath } from './pathfinder.js';

const WORLD_EPSILON = 1e-6;

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertRoute(route) {
  if (!route || !Array.isArray(route.waypoints) || !Number.isInteger(route.nextIndex)) {
    throw new TypeError('Waypoint following requires a route returned by requestWaypointRoute().');
  }
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y });
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function clampWorldPoint(grid, point) {
  return freezePoint({
    x: Math.min(Math.max(point.x, 0), grid.width * grid.tileSize - WORLD_EPSILON),
    y: Math.min(Math.max(point.y, 0), grid.height * grid.tileSize - WORLD_EPSILON),
  });
}

function createRoute(status, {
  destination,
  goalCell = null,
  waypoints = [],
  cost = null,
  visited = 0,
} = {}) {
  return {
    status,
    destination: destination ? freezePoint(destination) : null,
    goalCell: goalCell ? freezePoint(goalCell) : null,
    waypoints: Object.freeze(waypoints.map(freezePoint)),
    nextIndex: 0,
    cost,
    visited,
  };
}

export function requestWaypointRoute(grid, start, destination, {
  layer,
  footprint,
  ignoreBlockerIds,
  diagonalPolicy = DIAGONAL_POLICIES.NO_CORNER_CUT,
  maxVisited,
} = {}) {
  if (!grid || typeof grid.worldToCell !== 'function' || typeof grid.cellToWorldCenter !== 'function') {
    throw new TypeError('Waypoint routing requires a navigation-grid compatible object.');
  }
  assertPoint(start, 'Route start');
  assertPoint(destination, 'Route destination');

  const clampedDestination = clampWorldPoint(grid, destination);
  let startCell;
  try {
    startCell = grid.worldToCell(start.x, start.y);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return createRoute(PATH_STATUSES.START_BLOCKED, { destination: clampedDestination });
  }
  const goalCell = grid.worldToCell(clampedDestination.x, clampedDestination.y);
  const options = { diagonalPolicy };
  if (layer !== undefined) options.layer = layer;
  if (footprint !== undefined) options.footprint = footprint;
  if (ignoreBlockerIds !== undefined) options.ignoreBlockerIds = ignoreBlockerIds;
  if (maxVisited !== undefined) options.maxVisited = maxVisited;

  const pathResult = findPath(grid, startCell, goalCell, options);
  if (pathResult.status !== PATH_STATUSES.FOUND) {
    return createRoute(pathResult.status, {
      destination: clampedDestination,
      goalCell,
      cost: pathResult.cost,
      visited: pathResult.visited,
    });
  }

  const waypoints = pathResult.path
    .slice(1)
    .map((cell) => grid.cellToWorldCenter(cell.x, cell.y));
  if (!waypoints.length || !samePoint(waypoints.at(-1), clampedDestination)) {
    waypoints.push(clampedDestination);
  }

  return createRoute(PATH_STATUSES.FOUND, {
    destination: clampedDestination,
    goalCell,
    waypoints,
    cost: pathResult.cost,
    visited: pathResult.visited,
  });
}

export function currentWaypoint(route) {
  assertRoute(route);
  return route.waypoints[route.nextIndex] ?? null;
}

export function followWaypointRoute(route, unit, dt, moveToward) {
  assertRoute(route);
  if (!unit || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) {
    throw new TypeError('Waypoint following requires a unit with finite x and y coordinates.');
  }
  if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Waypoint delta time must be a non-negative number.');
  if (typeof moveToward !== 'function') throw new TypeError('Waypoint following requires a moveToward callback.');
  if (route.status !== PATH_STATUSES.FOUND) return false;

  const waypoint = currentWaypoint(route);
  if (!waypoint) return true;
  if (moveToward(unit, waypoint.x, waypoint.y, dt)) route.nextIndex += 1;
  return route.nextIndex >= route.waypoints.length;
}
