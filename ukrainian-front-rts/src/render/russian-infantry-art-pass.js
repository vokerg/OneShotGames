import { FACTIONS, UNIT_TYPES } from '../config.js';
import {
  loadRussianInfantryAtlas,
  resolveRussianInfantryAtlasUnitId,
  russianInfantryAnimationElapsedMs,
  russianInfantryAnimationId,
  russianInfantryDirectionFromAngle,
  russianInfantryPortraitFrameId,
  russianInfantryStateForEntity,
} from './russian-infantry-atlas.js';

const INSTALLATION = Symbol.for('fields-of-resolve.russian-infantry-art-pass');

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
  return String(stats?.roleId ?? stats?.archetype ?? stats?.role ?? 'field unit').replaceAll('-', ' ').toUpperCase();
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
  context.arc(point.x, point.y, Math.max(2, 3.5 * scale), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function installRussianInfantryArtPass(RendererClass, { loadAtlas = loadRussianInfantryAtlas } = {}) {
  if (typeof RendererClass !== 'function' || !RendererClass.prototype) throw new TypeError('Russian infantry art pass requires a Renderer class.');
  if (typeof loadAtlas !== 'function') throw new TypeError('loadAtlas must be a function.');
  if (RendererClass.prototype[INSTALLATION]) return RendererClass.prototype[INSTALLATION];

  const fallbackUnit = RendererClass.prototype.unit;
  const fallbackPortrait = RendererClass.prototype.portrait;
  if (typeof fallbackUnit !== 'function' || typeof fallbackPortrait !== 'function') {
    throw new TypeError('Renderer must expose unit and portrait methods before Russian infantry atlas installation.');
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
    const unitId = stats && !stats.air && !stats.armor
      ? resolveRussianInfantryAtlasUnitId(entity.type, stats)
      : null;
    if (!unitId || !state.runtime) return fallbackUnit.call(this, entity);

    const screen = this.sp(entity.x, entity.y);
    const zoom = this.g.camera.z;
    const visualState = russianInfantryStateForEntity(entity);
    const direction = russianInfantryDirectionFromAngle(entity.angle);
    const scale = Math.max(0.35, zoom * 0.9);
    const animationId = russianInfantryAnimationId(unitId, visualState);
    const elapsedMs = russianInfantryAnimationElapsedMs(entity, visualState, this.g.time);
    const drawX = Math.round(screen.x);
    const drawY = Math.round(screen.y) + 12 * zoom;
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
    const unitId = stats && !stats.air && !stats.armor
      ? resolveRussianInfantryAtlasUnitId(entity.type, stats)
      : null;
    if (!unitId || !state.runtime) return fallbackPortrait.call(this, entity);

    const context = this.px;
    context.clearRect(0, 0, 144, 112);
    context.fillStyle = '#151311';
    context.fillRect(0, 0, 144, 112);
    context.fillStyle = '#2b241e';
    for (let y = 0; y < 112; y += 8) {
      for (let x = 0; x < 144; x += 8) {
        if ((x + y) % 24 === 0) context.fillRect(x, y, 8, 8);
      }
    }
    state.runtime.drawFrame(context, russianInfantryPortraitFrameId(unitId), { x: 72, y: 88, scale: 1.75 });
    context.fillStyle = 'rgba(0,0,0,.5)';
    context.fillRect(5, 83, 134, 22);
    context.font = 'bold 10px monospace';
    context.fillStyle = '#cdbd9d';
    context.fillText(`${FACTIONS[entity.team]?.short ?? 'RU'} // ${roleLabel(stats)}`, 11, 97);
    context.strokeStyle = '#7f684e';
    context.lineWidth = 5;
    context.strokeRect(2, 2, 140, 108);
    return unitId;
  }

  RendererClass.prototype.unit = atlasUnit;
  RendererClass.prototype.portrait = atlasPortrait;
  RendererClass.prototype.russianInfantryAtlasStatus = function russianInfantryAtlasStatus() {
    return atlasStatusRecord(state);
  };

  const installation = Object.freeze({
    status: () => atlasStatusRecord(state),
    restore() {
      if (RendererClass.prototype.unit === atlasUnit) RendererClass.prototype.unit = fallbackUnit;
      if (RendererClass.prototype.portrait === atlasPortrait) RendererClass.prototype.portrait = fallbackPortrait;
      delete RendererClass.prototype.russianInfantryAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype, INSTALLATION, { value: installation, configurable: true });
  return installation;
}
