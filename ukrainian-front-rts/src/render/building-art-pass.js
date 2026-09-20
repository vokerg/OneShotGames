import { BUILDING_TYPES } from '../config.js';
import {
  buildingAtlasAnimationId,
  buildingAtlasElapsedMs,
  buildingAtlasRuntimeFor,
  buildingAtlasScale,
  buildingAtlasStateForEntity,
  loadBuildingAtlasSet,
  resolveBuildingAtlasId,
} from './building-atlas-runtime.js';

const INSTALLATION = Symbol.for('fields-of-resolve.building-art-pass');
const CACHE = new WeakMap();
const DESTRUCTION_DURATION_MS = 420;

function statusRecord(state) {
  return Object.freeze({
    state: state.status,
    ready: state.status === 'ready',
    degraded: false,
    error: state.error ? String(state.error.message ?? state.error) : null,
  });
}

function presentationCache(renderer) {
  let cache = CACHE.get(renderer);
  const missionToken = `${renderer.g?.missionIndex ?? ''}:${renderer.g?.mission?.id ?? renderer.g?.mission?.region ?? ''}`;
  const time = Number(renderer.g?.time) || 0;
  if (!cache || cache.missionToken !== missionToken || time + 1e-9 < cache.lastTime) {
    cache = { missionToken, lastTime: time, identities: new Map(), wreckStartedAt: new Map() };
    CACHE.set(renderer, cache);
  } else {
    cache.lastTime = time;
  }
  return cache;
}

function normalizedRotation(value) {
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) return 0;
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return normalized;
}

function geometry(renderer, type, x, y, rotation = 0) {
  const stats = BUILDING_TYPES[type];
  if (!stats) return null;
  const zoom = renderer.g.camera.z;
  const screen = renderer.sp(x, y);
  const normalized = normalizedRotation(rotation);
  const quarterTurn = normalized === 90 || normalized === 270;
  return Object.freeze({
    stats,
    zoom,
    screen,
    rotation: normalized,
    rotationRadians: normalized * Math.PI / 180,
    width: (quarterTurn ? stats.h : stats.w) * zoom,
    height: (quarterTurn ? stats.w : stats.h) * zoom,
    localAnchorY: stats.h * zoom / 2,
    scale: buildingAtlasScale(stats, zoom),
  });
}

function drawAtlasAnimation(renderer, runtime, animationId, view, options = {}) {
  const drawOptions = {
    scale: view.scale,
    elapsedMs: options.elapsedMs ?? 0,
    alpha: options.alpha ?? 1,
  };
  if (!view.rotation) {
    return runtime.drawAnimation(renderer.x, animationId, {
      ...drawOptions,
      x: Math.round(view.screen.x),
      y: Math.round(view.screen.y + view.localAnchorY),
    });
  }
  const context = renderer.x;
  context.save();
  try {
    context.translate(Math.round(view.screen.x), Math.round(view.screen.y));
    context.rotate(view.rotationRadians);
    return runtime.drawAnimation(context, animationId, {
      ...drawOptions,
      x: 0,
      y: Math.round(view.localAnchorY),
    });
  } finally {
    context.restore();
  }
}

function drawSelectionAndHealth(renderer, building, view) {
  const context = renderer.x;
  if (building.selected) {
    context.strokeStyle = '#ffe47a';
    context.lineWidth = 3;
    context.strokeRect(
      view.screen.x - view.width / 2 - 5,
      view.screen.y - view.height / 2 - 5,
      view.width + 10,
      view.height + 10,
    );
  }
  renderer.health(
    building,
    view.screen.x - view.width / 2,
    view.screen.y - view.height / 2 - 11,
    view.width,
  );
}

function rememberBuilding(renderer, building, buildingId, view) {
  if (building?.id == null || !buildingId || !view) return;
  presentationCache(renderer).identities.set(String(building.id), Object.freeze({
    buildingId,
    type: building.type,
    team: building.team,
    rotation: view.rotation,
    width: view.stats.w,
    height: view.stats.h,
  }));
}

export function installBuildingArtPass(RendererClass, { loadAtlases = loadBuildingAtlasSet } = {}) {
  if (typeof RendererClass !== 'function' || !RendererClass.prototype) throw new TypeError('Building art pass requires a Renderer class.');
  if (typeof loadAtlases !== 'function') throw new TypeError('loadAtlases must be a function.');
  if (RendererClass.prototype[INSTALLATION]) return RendererClass.prototype[INSTALLATION];

  const fallbackBuilding = RendererClass.prototype.building;
  const fallbackWreck = RendererClass.prototype.buildingWreck;
  if (typeof fallbackBuilding !== 'function') throw new TypeError('Renderer must expose building() before building atlas installation.');

  const state = { status: 'loading', runtimes: null, error: null };
  Promise.resolve()
    .then(() => loadAtlases())
    .then((runtimes) => {
      state.runtimes = runtimes;
      state.status = 'ready';
    })
    .catch((error) => {
      state.error = error;
      state.status = 'error';
    });

  function atlasBuilding(building) {
    const buildingId = resolveBuildingAtlasId(building?.type, building?.team);
    const view = geometry(this, building?.type, building?.x, building?.y, building?.rotation);
    rememberBuilding(this, building, buildingId, view);
    const runtime = buildingAtlasRuntimeFor(state.runtimes, buildingId);
    if (!buildingId || !view || !runtime) return fallbackBuilding.call(this, building);

    const visualState = buildingAtlasStateForEntity(building);
    const animationId = buildingAtlasAnimationId(building.type, building.team, visualState);
    const resolved = drawAtlasAnimation(this, runtime, animationId, view, {
      elapsedMs: buildingAtlasElapsedMs(building, visualState, this.g.time),
    });
    drawSelectionAndHealth(this, building, view);
    return resolved;
  }

  function atlasBuildingWreck(wreck) {
    const cache = presentationCache(this);
    const sourceId = wreck?.sourceEntityId == null ? null : String(wreck.sourceEntityId);
    const identity = sourceId ? cache.identities.get(sourceId) : null;
    const runtime = buildingAtlasRuntimeFor(state.runtimes, identity?.buildingId);
    const position = wreck?.position ?? wreck;
    if (!identity || !runtime || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
      return typeof fallbackWreck === 'function' ? fallbackWreck.call(this, wreck) : null;
    }

    const view = geometry(this, identity.type, position.x, position.y, identity.rotation);
    if (!view) return typeof fallbackWreck === 'function' ? fallbackWreck.call(this, wreck) : null;
    const wreckId = String(wreck.id ?? `${sourceId}:rubble`);
    if (!cache.wreckStartedAt.has(wreckId)) cache.wreckStartedAt.set(wreckId, Number(this.g.time) || 0);
    const elapsedMs = Math.max(0, ((Number(this.g.time) || 0) - cache.wreckStartedAt.get(wreckId)) * 1000);
    const visualState = elapsedMs < DESTRUCTION_DURATION_MS ? 'destruction' : 'rubble';
    const resolved = drawAtlasAnimation(
      this,
      runtime,
      `${identity.buildingId}.${visualState}`,
      view,
      { elapsedMs },
    );
    return resolved;
  }

  RendererClass.prototype.building = atlasBuilding;
  RendererClass.prototype.buildingWreck = atlasBuildingWreck;
  RendererClass.prototype.drawBuildingAtlasPreview = function drawBuildingAtlasPreview(building, {
    state: visualState = 'placement',
    alpha = 0.82,
  } = {}) {
    const buildingId = resolveBuildingAtlasId(building?.type, building?.team);
    const runtime = buildingAtlasRuntimeFor(state.runtimes, buildingId);
    const view = geometry(this, building?.type, building?.x, building?.y, building?.rotation);
    if (!buildingId || !runtime || !view) return null;
    const animationId = buildingAtlasAnimationId(building.type, building.team, visualState);
    return drawAtlasAnimation(this, runtime, animationId, view, { alpha });
  };
  RendererClass.prototype.buildingAtlasStatus = function buildingAtlasStatus() {
    return statusRecord(state);
  };

  const installation = Object.freeze({
    status: () => statusRecord(state),
    restore() {
      if (RendererClass.prototype.building === atlasBuilding) RendererClass.prototype.building = fallbackBuilding;
      if (RendererClass.prototype.buildingWreck === atlasBuildingWreck) {
        if (typeof fallbackWreck === 'function') RendererClass.prototype.buildingWreck = fallbackWreck;
        else delete RendererClass.prototype.buildingWreck;
      }
      delete RendererClass.prototype.drawBuildingAtlasPreview;
      delete RendererClass.prototype.buildingAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype, INSTALLATION, { value: installation, configurable: true });
  return installation;
}
