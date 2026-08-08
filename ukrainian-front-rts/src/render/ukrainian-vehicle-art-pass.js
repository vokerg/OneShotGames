import { FACTIONS, UNIT_TYPES } from '../config.js';
import {
  loadUkrainianVehicleAtlas,
  resolveUkrainianVehicleAtlasUnitId,
  ukrainianVehicleAnimationElapsedMs,
  ukrainianVehicleAnimationId,
  ukrainianVehicleDirectionFromAngle,
  ukrainianVehiclePortraitFrameId,
  ukrainianVehicleStateForEntity,
} from './ukrainian-vehicle-atlas.js';

const INSTALLATION = Symbol.for('fields-of-resolve.ukrainian-vehicle-art-pass');

function statsFor(renderer, entity) {
  const legacy = UNIT_TYPES[entity?.type];
  if (!legacy) return null;
  try {
    return renderer.g?.unitStats?.(entity.type) ?? legacy;
  } catch {
    return legacy;
  }
}

function roleLabel(stats) {
  return String(stats?.roleId ?? stats?.archetype ?? stats?.role ?? 'armored vehicle').replaceAll('-', ' ').toUpperCase();
}

function atlasStatusRecord(state) {
  return Object.freeze({
    state: state.status,
    ready: state.status === 'ready',
    degraded: Boolean(state.runtime?.degraded),
    error: state.error ? String(state.error.message ?? state.error) : null,
  });
}

function drawMuzzleFlash(renderer, runtime, resolved, entity, visualState, scale, x, y) {
  if (visualState !== 'attack' || Number(entity.flash) <= 0 || !resolved?.frameId) return;
  const point = runtime.attachment(resolved.frameId, 'muzzle', { x, y, scale });
  if (!point) return;
  const context = renderer.x;
  context.save();
  context.fillStyle = '#f2d57a';
  context.beginPath();
  context.arc(point.x, point.y, Math.max(2.5, 4.5 * scale), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function installUkrainianVehicleArtPass(RendererClass, { loadAtlas = loadUkrainianVehicleAtlas } = {}) {
  if (typeof RendererClass !== 'function' || !RendererClass.prototype) throw new TypeError('Ukrainian vehicle art pass requires a Renderer class.');
  if (typeof loadAtlas !== 'function') throw new TypeError('loadAtlas must be a function.');
  if (RendererClass.prototype[INSTALLATION]) return RendererClass.prototype[INSTALLATION];

  const fallbackUnit = RendererClass.prototype.unit;
  const fallbackPortrait = RendererClass.prototype.portrait;
  if (typeof fallbackUnit !== 'function' || typeof fallbackPortrait !== 'function') {
    throw new TypeError('Renderer must expose unit and portrait methods before Ukrainian vehicle atlas installation.');
  }

  const state = { status: 'loading', runtime: null, error: null };
  Promise.resolve()
    .then(() => loadAtlas())
    .then((runtime) => {
      state.runtime = runtime;
      state.status = 'ready';
    })
    .catch((error) => {
      state.error = error;
      state.status = 'error';
    });

  function atlasUnit(entity) {
    const stats = statsFor(this, entity);
    const unitId = stats?.armor === true && !stats?.air
      ? resolveUkrainianVehicleAtlasUnitId(entity.type, stats)
      : null;
    if (!unitId || !state.runtime) return fallbackUnit.call(this, entity);

    const screen = this.sp(entity.x, entity.y);
    const zoom = this.g.camera.z;
    const visualState = ukrainianVehicleStateForEntity(entity);
    const direction = ukrainianVehicleDirectionFromAngle(entity.angle);
    const scale = Math.max(0.3, zoom * 0.82);
    const animationId = ukrainianVehicleAnimationId(unitId, visualState);
    const elapsedMs = ukrainianVehicleAnimationElapsedMs(entity, visualState, this.g.time);
    const drawX = Math.round(screen.x);
    const drawY = Math.round(screen.y) + 14 * zoom;
    const resolved = state.runtime.drawAnimation(this.x, animationId, {
      x: drawX,
      y: drawY,
      scale,
      elapsedMs,
      direction,
    });
    drawMuzzleFlash(this, state.runtime, resolved, entity, visualState, scale, drawX, drawY);
    this.selection(entity, screen, stats, zoom);
    return resolved;
  }

  function atlasPortrait(entity) {
    const stats = statsFor(this, entity);
    const unitId = stats?.armor === true && !stats?.air
      ? resolveUkrainianVehicleAtlasUnitId(entity.type, stats)
      : null;
    if (!unitId || !state.runtime) return fallbackPortrait.call(this, entity);

    const context = this.px;
    context.clearRect(0, 0, 144, 112);
    context.fillStyle = '#111713';
    context.fillRect(0, 0, 144, 112);
    context.fillStyle = '#26352b';
    for (let y = 0; y < 112; y += 9) {
      for (let x = 0; x < 144; x += 9) {
        if ((x + y) % 27 === 0) context.fillRect(x, y, 9, 9);
      }
    }
    state.runtime.drawFrame(context, ukrainianVehiclePortraitFrameId(unitId), { x: 72, y: 88, scale: 1.45 });
    context.fillStyle = 'rgba(0,0,0,.5)';
    context.fillRect(5, 83, 134, 22);
    context.font = 'bold 10px monospace';
    context.fillStyle = '#e4ca54';
    context.fillText(`${FACTIONS[entity.team]?.short ?? 'UA'} // ${roleLabel(stats)}`, 11, 97);
    context.strokeStyle = '#75865e';
    context.lineWidth = 5;
    context.strokeRect(2, 2, 140, 108);
    return unitId;
  }

  RendererClass.prototype.unit = atlasUnit;
  RendererClass.prototype.portrait = atlasPortrait;
  RendererClass.prototype.ukrainianVehicleAtlasStatus = function ukrainianVehicleAtlasStatus() {
    return atlasStatusRecord(state);
  };

  const installation = Object.freeze({
    status: () => atlasStatusRecord(state),
    restore() {
      if (RendererClass.prototype.unit === atlasUnit) RendererClass.prototype.unit = fallbackUnit;
      if (RendererClass.prototype.portrait === atlasPortrait) RendererClass.prototype.portrait = fallbackPortrait;
      delete RendererClass.prototype.ukrainianVehicleAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype, INSTALLATION, { value: installation, configurable: true });
  return installation;
}
