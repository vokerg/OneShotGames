import { MOVEMENT_LAYERS } from './navigation-grid.js';
import { DIAGONAL_POLICIES } from './pathfinder.js';
import { requestWaypointRoute } from './waypoint-route.js';

export const PATH_REQUEST_RESULTS = Object.freeze({
  READY: 'ready',
  THROTTLED: 'throttled',
});

const WORLD_EPSILON = 1e-6;

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
}

function assertGrid(grid) {
  if (
    !grid ||
    typeof grid.worldToCell !== 'function' ||
    typeof grid.cellToWorldCenter !== 'function'
  ) {
    throw new TypeError('Navigation path service requires a navigation-grid compatible object.');
  }
  assertPositiveInteger(grid.width, 'Navigation grid width');
  assertPositiveInteger(grid.height, 'Navigation grid height');
  assertPositiveInteger(grid.tileSize, 'Navigation grid tile size');
}

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function normalizeFootprint(footprint = { width: 1, height: 1 }) {
  assertPositiveInteger(footprint.width, 'Path footprint width');
  assertPositiveInteger(footprint.height, 'Path footprint height');
  return Object.freeze({ width: footprint.width, height: footprint.height });
}

function normalizeIgnoreBlockerIds(ignoreBlockerIds = []) {
  if (!Array.isArray(ignoreBlockerIds)) {
    throw new TypeError('Path ignoreBlockerIds must be an array.');
  }
  return Object.freeze([...new Set(ignoreBlockerIds.map(String))].sort());
}

function normalizeOptions(grid, options = {}) {
  const maxVisited = options.maxVisited ?? grid.width * grid.height;
  assertPositiveInteger(maxVisited, 'Path search maxVisited');
  return Object.freeze({
    layer: options.layer ?? MOVEMENT_LAYERS.GROUND,
    footprint: normalizeFootprint(options.footprint),
    ignoreBlockerIds: normalizeIgnoreBlockerIds(options.ignoreBlockerIds),
    diagonalPolicy: options.diagonalPolicy ?? DIAGONAL_POLICIES.NO_CORNER_CUT,
    maxVisited,
  });
}

function numberKey(value) {
  return Object.is(value, -0) ? '0' : String(value);
}

function clampedDestination(grid, destination) {
  return {
    x: Math.min(Math.max(destination.x, 0), grid.width * grid.tileSize - WORLD_EPSILON),
    y: Math.min(Math.max(destination.y, 0), grid.height * grid.tileSize - WORLD_EPSILON),
  };
}

function cellKey(grid, point) {
  try {
    const cell = grid.worldToCell(point.x, point.y);
    return `${cell.x},${cell.y}`;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `world:${numberKey(point.x)},${numberKey(point.y)}`;
  }
}

function cacheKey(grid, revision, start, destination, options) {
  const clamped = clampedDestination(grid, destination);
  return JSON.stringify([
    revision,
    cellKey(grid, start),
    cellKey(grid, clamped),
    numberKey(clamped.x),
    numberKey(clamped.y),
    options.layer,
    options.footprint.width,
    options.footprint.height,
    options.ignoreBlockerIds,
    options.diagonalPolicy,
    options.maxVisited,
  ]);
}

function freezeRouteTemplate(route) {
  return Object.freeze({
    status: route.status,
    destination: route.destination,
    goalCell: route.goalCell,
    waypoints: route.waypoints,
    cost: route.cost,
    visited: route.visited,
  });
}

function instantiateRoute(template) {
  return {
    status: template.status,
    destination: template.destination,
    goalCell: template.goalCell,
    waypoints: template.waypoints,
    nextIndex: 0,
    cost: template.cost,
    visited: template.visited,
  };
}

export class NavigationPathService {
  #grid = null;
  #revision = null;
  #cache = new Map();
  #lastPlanTick = new Map();
  #maxEntries;
  #minRepathTicks;
  #metrics = {
    requests: 0,
    searches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    throttled: 0,
    invalidations: 0,
    evictions: 0,
    totalVisited: 0,
    maxVisited: 0,
  };

  constructor({ maxEntries = 256, minRepathTicks = 6 } = {}) {
    assertPositiveInteger(maxEntries, 'Path cache maxEntries');
    assertNonNegativeInteger(minRepathTicks, 'Path minimum repath ticks');
    this.#maxEntries = maxEntries;
    this.#minRepathTicks = minRepathTicks;
  }

  get revision() {
    return this.#revision;
  }

  setGrid(grid, revision) {
    assertGrid(grid);
    assertNonNegativeInteger(revision, 'Navigation revision');
    if (this.#grid === grid && this.#revision === revision) return false;

    if (this.#grid !== null) this.#metrics.invalidations += 1;
    this.#grid = grid;
    this.#revision = revision;
    this.#cache.clear();
    return true;
  }

  requestRoute(
    start,
    destination,
    options = {},
    { requestId = null, tick = 0, force = false } = {},
  ) {
    if (!this.#grid) {
      throw new Error('Navigation path service requires setGrid() before route requests.');
    }
    assertPoint(start, 'Route start');
    assertPoint(destination, 'Route destination');
    assertNonNegativeInteger(tick, 'Navigation request tick');
    if (typeof force !== 'boolean') {
      throw new TypeError('Navigation request force must be a boolean.');
    }

    const normalized = normalizeOptions(this.#grid, options);
    const normalizedRequestId = requestId == null ? null : String(requestId);
    this.#metrics.requests += 1;

    if (!force && normalizedRequestId !== null) {
      const lastTick = this.#lastPlanTick.get(normalizedRequestId);
      if (lastTick !== undefined && tick - lastTick < this.#minRepathTicks) {
        this.#metrics.throttled += 1;
        return Object.freeze({
          status: PATH_REQUEST_RESULTS.THROTTLED,
          route: null,
          cacheHit: false,
          retryTick: lastTick + this.#minRepathTicks,
          revision: this.#revision,
        });
      }
    }

    const key = cacheKey(this.#grid, this.#revision, start, destination, normalized);
    let template = this.#cache.get(key);
    let cacheHit = true;

    if (template) {
      this.#metrics.cacheHits += 1;
    } else {
      cacheHit = false;
      this.#metrics.cacheMisses += 1;
      this.#metrics.searches += 1;
      const route = requestWaypointRoute(this.#grid, start, destination, normalized);
      template = freezeRouteTemplate(route);

      if (this.#cache.size >= this.#maxEntries) {
        const oldestKey = this.#cache.keys().next().value;
        this.#cache.delete(oldestKey);
        this.#metrics.evictions += 1;
      }

      this.#cache.set(key, template);
      this.#metrics.totalVisited += route.visited;
      this.#metrics.maxVisited = Math.max(this.#metrics.maxVisited, route.visited);
    }

    if (normalizedRequestId !== null) {
      this.#lastPlanTick.set(normalizedRequestId, tick);
    }

    return Object.freeze({
      status: PATH_REQUEST_RESULTS.READY,
      route: instantiateRoute(template),
      cacheHit,
      retryTick: tick,
      revision: this.#revision,
    });
  }

  releaseRequest(requestId) {
    if (requestId === null || requestId === undefined) return false;
    return this.#lastPlanTick.delete(String(requestId));
  }

  retainRequests(requestIds = []) {
    if (!Array.isArray(requestIds)) {
      throw new TypeError('Retained path request ids must be an array.');
    }
    const retained = new Set(
      requestIds
        .filter((requestId) => requestId !== null && requestId !== undefined)
        .map(String),
    );
    let released = 0;
    for (const requestId of this.#lastPlanTick.keys()) {
      if (retained.has(requestId)) continue;
      this.#lastPlanTick.delete(requestId);
      released += 1;
    }
    return released;
  }

  metrics() {
    return Object.freeze({
      ...this.#metrics,
      cacheEntries: this.#cache.size,
      trackedRequests: this.#lastPlanTick.size,
      revision: this.#revision,
    });
  }
}

export function createNavigationPathService(options) {
  return new NavigationPathService(options);
}
