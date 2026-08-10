import { resolveUkrainianInfantryAtlasUnitId } from './ukrainian-infantry-atlas.js';
import { resolveRussianInfantryAtlasUnitId } from './russian-infantry-atlas.js';
import { resolveUkrainianVehicleAtlasUnitId } from './ukrainian-vehicle-atlas.js';
import { resolveRussianVehicleAtlasUnitId } from './russian-vehicle-atlas.js';
import { resolveSupportVisualUnitId } from './support-visual-atlas.js';

export const VISUAL_PERFORMANCE_BUDGETS = Object.freeze({
  viewportMarginPx: 192,
  frameSampleWindow: 120,
  targetFrameMs: 1000 / 60,
  warningP95FrameMs: 25,
  supportDecodedFrameLimit: 192,
});

const FALLBACK_GUARD = Symbol.for('fields-of-resolve.release-art-fallback-guard');
const PERFORMANCE_PATCH = Symbol.for('fields-of-resolve.visual-performance-patch');

function statsFor(renderer, entity) {
  try {
    return renderer?.g?.unitStats?.(entity?.type) ?? entity?.stats ?? null;
  } catch {
    return entity?.stats ?? null;
  }
}

export function classifyAtlasOwnedEntity(renderer, entity) {
  const stats = statsFor(renderer, entity);
  const type = entity?.type;
  const support = resolveSupportVisualUnitId(type, stats);
  if (support) return Object.freeze({ family: 'support', unitId: support });
  const uaVehicle = stats?.armor && !stats?.air ? resolveUkrainianVehicleAtlasUnitId(type, stats) : null;
  if (uaVehicle) return Object.freeze({ family: 'ukrainianVehicle', unitId: uaVehicle });
  const ruVehicle = stats?.armor && !stats?.air ? resolveRussianVehicleAtlasUnitId(type, stats) : null;
  if (ruVehicle) return Object.freeze({ family: 'russianVehicle', unitId: ruVehicle });
  if (!stats?.armor && !stats?.air) {
    const uaInfantry = resolveUkrainianInfantryAtlasUnitId(type, stats);
    if (uaInfantry) return Object.freeze({ family: 'ukrainianInfantry', unitId: uaInfantry });
    const ruInfantry = resolveRussianInfantryAtlasUnitId(type, stats);
    if (ruInfantry) return Object.freeze({ family: 'russianInfantry', unitId: ruInfantry });
  }
  return null;
}

function infantryAtlasReady(renderer, family) {
  const statusMethod = family === 'ukrainianInfantry'
    ? renderer?.ukrainianInfantryAtlasStatus
    : family === 'russianInfantry'
      ? renderer?.russianInfantryAtlasStatus
      : null;
  if (typeof statusMethod !== 'function') return false;
  return statusMethod.call(renderer)?.ready === true;
}

export function shouldSuppressProceduralFallback(renderer, entity) {
  const ownership = classifyAtlasOwnedEntity(renderer, entity);
  if (!ownership) return false;
  if (ownership.family === 'ukrainianInfantry' || ownership.family === 'russianInfantry') {
    return !infantryAtlasReady(renderer, ownership.family);
  }
  // Vehicle/support atlas wrappers are installed above this guard. If their
  // call reaches the guard, the production atlas could not provide the frame.
  return true;
}

export function installReleaseArtFallbackGuard(RendererClass) {
  if (!RendererClass?.prototype) throw new TypeError('RendererClass is required for release art fallback guard.');
  const prototype = RendererClass.prototype;
  if (prototype[FALLBACK_GUARD]) return prototype[FALLBACK_GUARD];
  const previousUnit = prototype.unit;
  const previousPortrait = prototype.portrait;
  if (typeof previousUnit !== 'function' || typeof previousPortrait !== 'function') {
    throw new TypeError('Renderer must expose unit and portrait methods before release fallback guarding.');
  }
  const counters = { suppressedUnits: 0, suppressedPortraits: 0 };
  const guardedUnit = function guardedReleaseUnit(entity) {
    if (shouldSuppressProceduralFallback(this, entity)) {
      counters.suppressedUnits += 1;
      return Object.freeze({ suppressedProceduralFallback: true });
    }
    return previousUnit.call(this, entity);
  };
  const guardedPortrait = function guardedReleasePortrait(entity) {
    if (entity && shouldSuppressProceduralFallback(this, entity)) {
      counters.suppressedPortraits += 1;
      this.px?.clearRect?.(0, 0, 144, 112);
      return Object.freeze({ suppressedProceduralFallback: true });
    }
    return previousPortrait.call(this, entity);
  };
  prototype.unit = guardedUnit;
  prototype.portrait = guardedPortrait;
  const installation = Object.freeze({
    status: () => Object.freeze({ ...counters }),
    restore() {
      if (prototype.unit === guardedUnit) prototype.unit = previousUnit;
      if (prototype.portrait === guardedPortrait) prototype.portrait = previousPortrait;
      delete prototype[FALLBACK_GUARD];
    },
  });
  Object.defineProperty(prototype, FALLBACK_GUARD, { value: installation, configurable: true });
  return installation;
}

export function viewportDimensions(renderer) {
  const width = Number(renderer?.viewportMetrics?.cssWidth ?? renderer?.c?.clientWidth ?? globalThis.innerWidth ?? 0);
  const height = Number(renderer?.viewportMetrics?.cssHeight ?? renderer?.c?.clientHeight ?? globalThis.innerHeight ?? 0);
  return Object.freeze({ width: Math.max(0, width), height: Math.max(0, height) });
}

export function isWorldPointVisible(renderer, x, y, margin = VISUAL_PERFORMANCE_BUDGETS.viewportMarginPx) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const screen = renderer.sp(x, y);
  const { width, height } = viewportDimensions(renderer);
  return screen.x >= -margin && screen.x <= width + margin && screen.y >= -margin && screen.y <= height + margin;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function nearestNeighbor(context) {
  if (context && 'imageSmoothingEnabled' in context) context.imageSmoothingEnabled = false;
}

export function installRendererPerformancePatch(RendererClass, {
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  margin = VISUAL_PERFORMANCE_BUDGETS.viewportMarginPx,
} = {}) {
  if (!RendererClass?.prototype) throw new TypeError('RendererClass is required for visual performance patch.');
  const prototype = RendererClass.prototype;
  if (prototype[PERFORMANCE_PATCH]) return prototype[PERFORMANCE_PATCH];
  const previous = {
    unit: prototype.unit,
    building: prototype.building,
    resourceNode: prototype.resourceNode,
    effects: prototype.effects,
    fog: prototype.fog,
    render: prototype.render,
  };
  for (const [name, method] of Object.entries(previous)) {
    if (typeof method !== 'function') throw new TypeError(`Renderer must expose ${name} before visual performance installation.`);
  }
  const frameSamples = [];
  let frame = null;
  let last = Object.freeze({
    frameMs: 0,
    p95FrameMs: 0,
    unitsDrawn: 0,
    unitsCulled: 0,
    buildingsDrawn: 0,
    buildingsCulled: 0,
    nodesDrawn: 0,
    nodesCulled: 0,
    projectilesDrawn: 0,
    projectilesCulled: 0,
    effectsDrawn: 0,
    effectsCulled: 0,
  });

  function count(kind, visible) {
    if (!frame) return;
    frame[`${kind}${visible ? 'Drawn' : 'Culled'}`] += 1;
  }

  prototype.unit = function performanceUnit(entity) {
    const visible = isWorldPointVisible(this, entity?.x, entity?.y, margin);
    count('units', visible);
    return visible ? previous.unit.call(this, entity) : null;
  };
  prototype.building = function performanceBuilding(entity) {
    const visible = isWorldPointVisible(this, entity?.x, entity?.y, margin);
    count('buildings', visible);
    return visible ? previous.building.call(this, entity) : null;
  };
  prototype.resourceNode = function performanceResourceNode(entity) {
    const visible = isWorldPointVisible(this, entity?.x, entity?.y, margin);
    count('nodes', visible);
    return visible ? previous.resourceNode.call(this, entity) : null;
  };
  prototype.effects = function performanceEffects() {
    const game = this.g;
    const projectiles = game.projectiles;
    const effects = game.effects;
    const visibleProjectiles = projectiles.filter((entry) => isWorldPointVisible(this, entry.x, entry.y, margin));
    const visibleEffects = effects.filter((entry) => {
      const radius = Math.max(0, Number(entry.radius) || 0) * Math.max(0.1, Number(game.camera?.z) || 1);
      return isWorldPointVisible(this, entry.x, entry.y, margin + radius);
    });
    if (frame) {
      frame.projectilesDrawn += visibleProjectiles.length;
      frame.projectilesCulled += projectiles.length - visibleProjectiles.length;
      frame.effectsDrawn += visibleEffects.length;
      frame.effectsCulled += effects.length - visibleEffects.length;
    }
    game.projectiles = visibleProjectiles;
    game.effects = visibleEffects;
    try { return previous.effects.call(this); }
    finally { game.projectiles = projectiles; game.effects = effects; }
  };
  prototype.fog = function performanceFog() {
    const game = this.g;
    const units = game.units;
    const buildings = game.buildings;
    const zoom = Math.max(0.1, Number(game.camera?.z) || 1);
    const sightMargin = (entity) => {
      let stats = null;
      try { stats = game.unitStats?.(entity.type); } catch {}
      const radius = Math.max(0, Number(stats?.sight) || 180) * zoom;
      return margin + radius;
    };
    game.units = units.filter((entity) => isWorldPointVisible(this, entity.x, entity.y, sightMargin(entity)));
    game.buildings = buildings.filter((entity) => isWorldPointVisible(this, entity.x, entity.y, margin + 360 * zoom));
    try { return previous.fog.call(this); }
    finally { game.units = units; game.buildings = buildings; }
  };
  prototype.render = function performanceRender() {
    const started = now();
    frame = {
      unitsDrawn: 0, unitsCulled: 0,
      buildingsDrawn: 0, buildingsCulled: 0,
      nodesDrawn: 0, nodesCulled: 0,
      projectilesDrawn: 0, projectilesCulled: 0,
      effectsDrawn: 0, effectsCulled: 0,
    };
    nearestNeighbor(this.x); nearestNeighbor(this.mx); nearestNeighbor(this.px); nearestNeighbor(this.fx);
    try { return previous.render.call(this); }
    finally {
      const frameMs = Math.max(0, now() - started);
      frameSamples.push(frameMs);
      while (frameSamples.length > VISUAL_PERFORMANCE_BUDGETS.frameSampleWindow) frameSamples.shift();
      last = Object.freeze({ ...frame, frameMs, p95FrameMs: percentile(frameSamples, 0.95) });
      frame = null;
    }
  };
  prototype.visualPerformanceStatus = function visualPerformanceStatus() {
    return Object.freeze({
      ...last,
      samples: frameSamples.length,
      targetFrameMs: VISUAL_PERFORMANCE_BUDGETS.targetFrameMs,
      warningP95FrameMs: VISUAL_PERFORMANCE_BUDGETS.warningP95FrameMs,
      nearestNeighbor: [this.x, this.mx, this.px, this.fx].filter(Boolean).every((context) => context.imageSmoothingEnabled === false),
    });
  };

  const installation = Object.freeze({
    status(renderer) { return renderer?.visualPerformanceStatus?.() ?? null; },
    restore() {
      for (const [name, method] of Object.entries(previous)) {
        const current = prototype[name];
        if (name === 'render' || name === 'unit' || name === 'building' || name === 'resourceNode' || name === 'effects' || name === 'fog') {
          // Restore only while this patch remains the outer owner.
          if (current !== method) prototype[name] = method;
        }
      }
      delete prototype.visualPerformanceStatus;
      delete prototype[PERFORMANCE_PATCH];
    },
  });
  Object.defineProperty(prototype, PERFORMANCE_PATCH, { value: installation, configurable: true });
  return installation;
}
