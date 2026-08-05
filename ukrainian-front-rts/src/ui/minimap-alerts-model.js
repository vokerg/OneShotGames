import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from '../config.js';

export const MINIMAP_ALERT_KINDS = Object.freeze({
  ATTACK: 'attack',
  OBJECTIVE: 'objective',
  PRODUCTION: 'production',
  INFO: 'info',
});

export const MINIMAP_ENTITY_FILTERS = Object.freeze({
  UNITS: 'units',
  BUILDINGS: 'buildings',
  RESOURCES: 'resources',
  ALLIES: 'allies',
  NEUTRALS: 'neutrals',
});

export const DEFAULT_MINIMAP_FILTERS = Object.freeze({
  units: true,
  buildings: true,
  resources: true,
  allies: true,
  neutrals: true,
});

const ALERT_PRIORITY = Object.freeze({
  attack: 3,
  objective: 2,
  production: 1,
  info: 0,
});

const TERRAIN_COLUMNS = Math.round(WORLD.w / 32);
const TERRAIN_ROWS = Math.round(WORLD.h / 32);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function normalizePosition(point) {
  if (!finitePoint(point)) return null;
  return Object.freeze({
    x: clamp(Number(point.x), 0, WORLD.w),
    y: clamp(Number(point.y), 0, WORLD.h),
  });
}

export function worldToMinimap(point, size = { width: 220, height: 138 }) {
  if (!finitePoint(point)) throw new TypeError('World point must contain finite x and y coordinates.');
  if (!Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new TypeError('Minimap size must be positive.');
  }
  return Object.freeze({
    x: clamp(point.x / WORLD.w, 0, 1) * size.width,
    y: clamp(point.y / WORLD.h, 0, 1) * size.height,
  });
}

export function minimapToWorld(point, size = { width: 220, height: 138 }) {
  if (!finitePoint(point)) throw new TypeError('Minimap point must contain finite x and y coordinates.');
  if (!Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new TypeError('Minimap size must be positive.');
  }
  return Object.freeze({
    x: clamp(point.x / size.width, 0, 1) * WORLD.w,
    y: clamp(point.y / size.height, 0, 1) * WORLD.h,
  });
}

export function cameraViewportRect(game, viewport = {}) {
  const width = Number(viewport.width) || 0;
  const height = Number(viewport.height) || 0;
  const zoom = Number(game?.camera?.z) || 1;
  const left = clamp((0 - (Number(game?.camera?.x) || 0)) / zoom, 0, WORLD.w);
  const top = clamp((0 - (Number(game?.camera?.y) || 0)) / zoom, 0, WORLD.h);
  const right = clamp((width - (Number(game?.camera?.x) || 0)) / zoom, 0, WORLD.w);
  const bottom = clamp((height - (Number(game?.camera?.y) || 0)) / zoom, 0, WORLD.h);
  return Object.freeze({
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  });
}

function relationship(entity) {
  if (entity?.relationship === 'neutral' || entity?.team === 'neutral') return 'neutral';
  if (entity?.relationship === 'ally' || entity?.team === TEAM.UA) return 'ally';
  return 'enemy';
}

function entityKind(entity, game) {
  if ((game?.units || []).includes(entity) || UNIT_TYPES[entity?.type]) return 'unit';
  if ((game?.buildings || []).includes(entity) || BUILDING_TYPES[entity?.type]) return 'building';
  return 'marker';
}

function sightRadius(game, entity) {
  const stats = UNIT_TYPES[entity?.type]
    ? (entity.team === TEAM.UA && typeof game?.unitStats === 'function' ? game.unitStats(entity.type) : UNIT_TYPES[entity.type])
    : BUILDING_TYPES[entity?.type];
  return Math.max(32, Number(stats?.sight) || 180);
}

function legacyCanSee(game, point) {
  return [...(game?.units || []), ...(game?.buildings || [])]
    .filter((entity) => relationship(entity) === 'ally' && entity.hp > 0)
    .some((entity) => Math.hypot(entity.x - point.x, entity.y - point.y) <= sightRadius(game, entity));
}

export function canPlayerSee(game, point) {
  if (!finitePoint(point)) return false;
  if (typeof game?.canPlayerSee === 'function') return Boolean(game.canPlayerSee(point));
  const query = game?.visibilityQuery || game?.visibility;
  if (query && typeof query.canSee === 'function') {
    const observers = [...(game.units || []), ...(game.buildings || [])]
      .filter((entity) => relationship(entity) === 'ally' && entity.hp > 0);
    return observers.some((observer) => query.canSee(observer, point, {
      observerHeight: Number(observer.visibilityHeight) || 1,
      targetHeight: 1,
    }));
  }
  return legacyCanSee(game, point);
}

function normalizeFilters(filters = {}) {
  return Object.freeze({ ...DEFAULT_MINIMAP_FILTERS, ...filters });
}

function includeEntity(entity, kind, filters, visible) {
  const relation = relationship(entity);
  if (kind === 'unit' && !filters.units) return false;
  if (kind === 'building' && !filters.buildings) return false;
  if (relation === 'ally' && !filters.allies) return false;
  if (relation === 'neutral' && !filters.neutrals) return false;
  if (relation === 'enemy' && !visible) return false;
  return true;
}

function terrainCells(game, exploredCells) {
  const terrain = Array.isArray(game?.terrain) ? game.terrain : [];
  return Object.freeze(Array.from({ length: TERRAIN_COLUMNS * TERRAIN_ROWS }, (_, index) => {
    const column = index % TERRAIN_COLUMNS;
    const row = Math.floor(index / TERRAIN_COLUMNS);
    const center = { x: column * 32 + 16, y: row * 32 + 16 };
    const visible = canPlayerSee(game, center);
    const key = `${column},${row}`;
    if (visible) exploredCells?.add(key);
    return Object.freeze({
      column,
      row,
      terrain: Number(terrain[index]) || 0,
      visibility: visible ? 'visible' : exploredCells?.has(key) ? 'explored' : 'hidden',
    });
  }));
}

function entityMarkers(game, filters) {
  const entities = [...(game?.buildings || []), ...(game?.units || [])];
  return Object.freeze(entities
    .filter((entity) => entity && entity.hp > 0 && finitePoint(entity))
    .map((entity) => {
      const kind = entityKind(entity, game);
      const visible = relationship(entity) !== 'enemy' || canPlayerSee(game, entity);
      if (!includeEntity(entity, kind, filters, visible)) return null;
      return Object.freeze({
        id: String(entity.id),
        kind,
        relationship: relationship(entity),
        type: entity.type || 'unknown',
        x: entity.x,
        y: entity.y,
        selected: Boolean(entity.selected || game?.selected?.has?.(entity.id)),
      });
    })
    .filter(Boolean));
}

function resourceMarkers(game, filters) {
  if (!filters.resources || !filters.neutrals) return Object.freeze([]);
  return Object.freeze((game?.nodes || [])
    .filter((node) => finitePoint(node) && (node.amount == null || node.amount > 0))
    .map((node, index) => Object.freeze({
      id: String(node.id ?? `resource:${index}`),
      kind: 'resource',
      relationship: 'neutral',
      type: node.kind || 'resource',
      x: node.x,
      y: node.y,
      selected: false,
    })));
}

function roadPoints(game) {
  return Object.freeze((game?.road || [])
    .map((point) => Array.isArray(point)
      ? { x: Number(point[0]), y: Number(point[1]) }
      : { x: Number(point?.x), y: Number(point?.y) })
    .filter(finitePoint)
    .map((point) => Object.freeze(point)));
}

export function createMinimapSnapshot(game, {
  filters,
  alerts = [],
  exploredCells = new Set(),
  viewport = {},
} = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const snapshot = {
    schema: 'fields-of-resolve.minimap-snapshot',
    version: 1,
    world: { width: WORLD.w, height: WORLD.h },
    grid: { columns: TERRAIN_COLUMNS, rows: TERRAIN_ROWS, tileSize: 32 },
    terrain: terrainCells(game, exploredCells),
    road: roadPoints(game),
    markers: Object.freeze([
      ...entityMarkers(game, normalizedFilters),
      ...resourceMarkers(game, normalizedFilters),
    ]),
    pings: Object.freeze(alerts
      .filter((alert) => finitePoint(alert.worldPosition))
      .map((alert) => Object.freeze({
        id: alert.id,
        kind: alert.kind,
        priority: alert.priority,
        worldPosition: alert.worldPosition,
        createdAt: alert.createdAt,
        expiresAt: alert.expiresAt,
      }))),
    viewport: cameraViewportRect(game, viewport),
    filters: normalizedFilters,
  };
  return deepFreeze(snapshot);
}

export function classifyMinimapAlert(message = '') {
  const text = String(message).toLowerCase();
  if (/under attack|taking fire|incoming|damaged|hostile/.test(text)) return MINIMAP_ALERT_KINDS.ATTACK;
  if (/objective|secured|captured|complete|victory/.test(text)) return MINIMAP_ALERT_KINDS.OBJECTIVE;
  if (/deployed|produced|trained|production|rally/.test(text)) return MINIMAP_ALERT_KINDS.PRODUCTION;
  return MINIMAP_ALERT_KINDS.INFO;
}

export class MinimapAlertQueue {
  #alerts = [];
  #nextSequence = 1;

  constructor({ maxAlerts = 8, durationMs = 8000, dedupeMs = 1200 } = {}) {
    if (!Number.isInteger(maxAlerts) || maxAlerts < 1) throw new TypeError('Alert queue maxAlerts must be a positive integer.');
    this.maxAlerts = maxAlerts;
    this.durationMs = Math.max(250, Number(durationMs) || 8000);
    this.dedupeMs = Math.max(0, Number(dedupeMs) || 0);
  }

  push({ kind = MINIMAP_ALERT_KINDS.INFO, message, worldPosition = null, source = null, createdAt = 0 } = {}) {
    if (!Object.values(MINIMAP_ALERT_KINDS).includes(kind)) throw new RangeError(`Unknown minimap alert kind: ${kind}`);
    if (typeof message !== 'string' || !message.trim()) throw new TypeError('Minimap alert message is required.');
    const time = Number(createdAt) || 0;
    const position = normalizePosition(worldPosition);
    const dedupeKey = `${kind}:${source ?? ''}:${message.trim()}`;
    const duplicate = this.#alerts.find((alert) => alert.dedupeKey === dedupeKey && time - alert.createdAt <= this.dedupeMs);
    if (duplicate) return duplicate;
    const alert = deepFreeze({
      id: `minimap-alert-${this.#nextSequence++}`,
      kind,
      priority: ALERT_PRIORITY[kind],
      message: message.trim(),
      source,
      worldPosition: position,
      createdAt: time,
      expiresAt: time + this.durationMs,
      dedupeKey,
    });
    this.#alerts.unshift(alert);
    this.#alerts = this.#alerts
      .sort((left, right) => right.priority - left.priority || right.createdAt - left.createdAt || left.id.localeCompare(right.id))
      .slice(0, this.maxAlerts);
    return alert;
  }

  remove(id) {
    const previous = this.#alerts.length;
    this.#alerts = this.#alerts.filter((alert) => alert.id !== id);
    return this.#alerts.length !== previous;
  }

  prune(now = 0) {
    const time = Number(now) || 0;
    this.#alerts = this.#alerts.filter((alert) => alert.expiresAt > time);
    return this.snapshot(time);
  }

  snapshot(now = 0) {
    const time = Number(now) || 0;
    return Object.freeze(this.#alerts
      .filter((alert) => alert.expiresAt > time)
      .map((alert) => deepFreeze({ ...alert, remainingMs: Math.max(0, alert.expiresAt - time) })));
  }

  clear() {
    this.#alerts = [];
  }
}
