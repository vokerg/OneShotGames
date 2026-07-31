import { MOVEMENT_LAYERS } from './navigation-grid.js';
import { DIAGONAL_POLICIES } from './pathfinder.js';
import { requestWaypointRoute } from './waypoint-route.js';

export const PATH_REQUEST_RESULTS = Object.freeze({ READY: 'ready', THROTTLED: 'throttled' });
const WORLD_EPSILON = 1e-6;

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
}
function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
}
function point(value, label) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new TypeError(`${label} must contain finite x and y coordinates.`);
}
function normalizeOptions(grid, options = {}) {
  const footprint = options.footprint ?? { width: 1, height: 1 };
  positiveInteger(footprint.width, 'Path footprint width');
  positiveInteger(footprint.height, 'Path footprint height');
  const maxVisited = options.maxVisited ?? grid.width * grid.height;
  positiveInteger(maxVisited, 'Path search maxVisited');
  return Object.freeze({
    layer: options.layer ?? MOVEMENT_LAYERS.GROUND,
    footprint: Object.freeze({ width: footprint.width, height: footprint.height }),
    ignoreBlockerIds: Object.freeze([...new Set((options.ignoreBlockerIds ?? []).map(String))].sort()),
    diagonalPolicy: options.diagonalPolicy ?? DIAGONAL_POLICIES.NO_CORNER_CUT,
    maxVisited,
  });
}
function numberKey(value) { return Object.is(value, -0) ? '0' : String(value); }
function clampedDestination(grid, destination) {
  return {
    x: Math.min(Math.max(destination.x, 0), grid.width * grid.tileSize - WORLD_EPSILON),
    y: Math.min(Math.max(destination.y, 0), grid.height * grid.tileSize - WORLD_EPSILON),
  };
}
function cellKey(grid, value) {
  try {
    const cell = grid.worldToCell(value.x, value.y);
    return `${cell.x},${cell.y}`;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return `world:${numberKey(value.x)},${numberKey(value.y)}`;
  }
}
function routeTemplate(route) {
  return Object.freeze({ status: route.status, destination: route.destination, goalCell: route.goalCell, waypoints: route.waypoints, cost: route.cost, visited: route.visited });
}
function routeInstance(template) { return { ...template, nextIndex: 0 }; }

export class NavigationPathService {
  #grid = null;
  #revision = null;
  #cache = new Map();
  #lastPlanTick = new Map();
  #maxEntries;
  #minRepathTicks;
  #metrics = { requests: 0, searches: 0, cacheHits: 0, cacheMisses: 0, throttled: 0, invalidations: 0, evictions: 0, totalVisited: 0, maxVisited: 0 };

  constructor({ maxEntries = 256, minRepathTicks = 6 } = {}) {
    positiveInteger(maxEntries, 'Path cache maxEntries');
    nonNegativeInteger(minRepathTicks, 'Path minimum repath ticks');
    this.#maxEntries = maxEntries;
    this.#minRepathTicks = minRepathTicks;
  }

  setGrid(grid, revision) {
    if (!grid || typeof grid.worldToCell !== 'function') throw new TypeError('Navigation path service requires a navigation-grid compatible object.');
    nonNegativeInteger(revision, 'Navigation revision');
    if (this.#grid === grid && this.#revision === revision) return false;
    if (this.#grid) this.#metrics.invalidations += 1;
    this.#grid = grid;
    this.#revision = revision;
    this.#cache.clear();
    return true;
  }

  requestRoute(start, destination, options = {}, { requestId = null, tick = 0, force = false } = {}) {
    if (!this.#grid) throw new Error('Navigation path service requires setGrid() before route requests.');
    point(start, 'Route start');
    point(destination, 'Route destination');
    nonNegativeInteger(tick, 'Navigation request tick');
    const normalized = normalizeOptions(this.#grid, options);
    const id = requestId == null ? null : String(requestId);
    this.#metrics.requests += 1;
    const lastTick = id == null ? undefined : this.#lastPlanTick.get(id);
    if (!force && lastTick !== undefined && tick - lastTick < this.#minRepathTicks) {
      this.#metrics.throttled += 1;
      return Object.freeze({ status: PATH_REQUEST_RESULTS.THROTTLED, route: null, cacheHit: false, retryTick: lastTick + this.#minRepathTicks, revision: this.#revision });
    }
    const target = clampedDestination(this.#grid, destination);
    const key = JSON.stringify([this.#revision, cellKey(this.#grid, start), cellKey(this.#grid, target), numberKey(target.x), numberKey(target.y), normalized.layer, normalized.footprint.width, normalized.footprint.height, normalized.ignoreBlockerIds, normalized.diagonalPolicy, normalized.maxVisited]);
    let template = this.#cache.get(key);
    let cacheHit = true;
    if (template) this.#metrics.cacheHits += 1;
    else {
      cacheHit = false;
      this.#metrics.cacheMisses += 1;
      this.#metrics.searches += 1;
      const route = requestWaypointRoute(this.#grid, start, destination, normalized);
      template = routeTemplate(route);
      if (this.#cache.size >= this.#maxEntries) {
        this.#cache.delete(this.#cache.keys().next().value);
        this.#metrics.evictions += 1;
      }
      this.#cache.set(key, template);
      this.#metrics.totalVisited += route.visited;
      this.#metrics.maxVisited = Math.max(this.#metrics.maxVisited, route.visited);
    }
    if (id != null) this.#lastPlanTick.set(id, tick);
    return Object.freeze({ status: PATH_REQUEST_RESULTS.READY, route: routeInstance(template), cacheHit, retryTick: tick, revision: this.#revision });
  }

  releaseRequest(requestId) { return requestId == null ? false : this.#lastPlanTick.delete(String(requestId)); }
  metrics() { return Object.freeze({ ...this.#metrics, cacheEntries: this.#cache.size, trackedRequests: this.#lastPlanTick.size, revision: this.#revision }); }
}

export function createNavigationPathService(options) { return new NavigationPathService(options); }
