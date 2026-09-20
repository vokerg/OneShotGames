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

function geometry(renderer, type, x, y) {
  const stats = BUILDING_TYPES[type];
  if (!stats) return null;
  const zoom = renderer.g.camera.z;
  const screen = renderer.sp(x, y);
  return Object.freeze({
    stats,
    zoom,
    screen,
    width: stats.w * zoom,
    height: stats.h * zoom,
    drawX: Math.round(screen.x),
    drawY: Math.round(screen.y + stats.h * zoom / 2),
    scale: buildingAtlasScale(stats, zoom),
  });
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
    const view = geometry(this, building?.type, building?.x, building?.y);
    rememberBuilding(this, building, buildingId, view);
    const runtime = buildingAtlasRuntimeFor(state.runtimes, buildingId);
    if (!buildingId || !view || !runtime) return fallbackBuilding.call(this, building);

    const visualState = buildingAtlasStateForEntity(building);
    const animationId = buildingAtlasAnimationId(building.type, building.team, visualState);
    const resolved = runtime.drawAnimation(this.x, animationId, {
      x: view.drawX,
      y: view.drawY,
      scale: view.scale,
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

    const view = geometry(this, identity.type, position.x, position.y);
    if (!view) return typeof fallbackWreck === 'function' ? fallbackWreck.call(this, wreck) : null;
    const wreckId = String(wreck.id ?? `${sourceId}:rubble`);
    if (!cache.wreckStartedAt.has(wreckId)) cache.wreckStartedAt.set(wreckId, Number(this.g.time) || 0);
    const elapsedMs = Math.max(0, ((Number(this.g.time) || 0) - cache.wreckStartedAt.get(wreckId)) * 1000);
    const visualState = elapsedMs < DESTRUCTION_DURATION_MS ? 'destruction' : 'rubble';
    const resolved = runtime.drawAnimation(
      this.x,
      `${identity.buildingId}.${visualState}`,
      { x: view.drawX, y: view.drawY, scale: view.scale, elapsedMs },
    );
    return resolved;
  }

  RendererClass.prototype.building = atlasBuilding;
  RendererClass.prototype.buildingWreck = atlasBuildingWreck;
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
      delete RendererClass.prototype.buildingAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype, INSTALLATION, { value: installation, configurable: true });
  return installation;
}
