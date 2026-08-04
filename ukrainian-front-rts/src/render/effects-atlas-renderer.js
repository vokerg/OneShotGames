import {
  createSpriteAtlasRuntime,
  loadImageElement,
  resolveAtlasImageSource,
} from './sprite-atlas-runtime.js';
import {
  EFFECT_ATLAS_FAMILIES,
  createEffectPresentationDescriptor,
  createEffectsAtlasManifestFromSource,
  effectAnimationDuration,
  validateEffectsAtlasManifest,
} from './effects-atlas-contract.js';

export const DEFAULT_EFFECT_ATLAS_SOURCE = new URL(
  '../../assets/atlases/effects.build.json',
  import.meta.url,
);

export async function loadEffectsAtlas(source, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for effects atlas loading.');
  const sourceUrl = String(source);
  const response = await fetchImpl(sourceUrl);
  if (!response?.ok) throw new Error(`Unable to load effects atlas source: ${sourceUrl} (${response?.status ?? 'unknown'})`);
  const manifest = createEffectsAtlasManifestFromSource(await response.json(), { source: sourceUrl });
  const imageSource = resolveAtlasImageSource(sourceUrl, manifest.image.src);
  const image = await loadImageElement(imageSource, { imageFactory });
  const width = Number(image.naturalWidth);
  const height = Number(image.naturalHeight);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      && (width !== manifest.image.width || height !== manifest.image.height)) {
    throw new Error(`Effects atlas image dimensions do not match manifest: ${width}x${height} !== ${manifest.image.width}x${manifest.image.height}.`);
  }
  return createSpriteAtlasRuntime(manifest, image);
}

function requireRenderer(renderer) {
  if (!renderer || typeof renderer.effects !== 'function' || typeof renderer.unit !== 'function') {
    throw new TypeError('Effects atlas integration requires renderer.effects() and renderer.unit().');
  }
  if (!renderer.x || typeof renderer.x.save !== 'function' || typeof renderer.sp !== 'function') {
    throw new TypeError('Effects atlas integration requires a Canvas 2D context and renderer.sp().');
  }
  return renderer;
}

function requireGame(game) {
  if (!game || !Array.isArray(game.projectiles) || !Array.isArray(game.effects)) {
    throw new TypeError('Effects atlas integration requires game.projectiles and game.effects arrays.');
  }
  return game;
}

function finitePoint(record) {
  return Number.isFinite(record?.x) && Number.isFinite(record?.y);
}

export function createEffectsAtlasController({
  game,
  renderer,
  manifestSource = DEFAULT_EFFECT_ATLAS_SOURCE,
  loadAtlas = loadEffectsAtlas,
} = {}) {
  const owner = requireRenderer(renderer);
  const simulation = requireGame(game);
  if (typeof loadAtlas !== 'function') throw new TypeError('Effects atlas loadAtlas must be a function.');

  let disposed = false;
  const state = {
    status: 'loading',
    runtime: null,
    manifest: null,
    durations: Object.freeze({}),
    error: null,
  };

  const ready = Promise.resolve()
    .then(() => loadAtlas(manifestSource))
    .then((runtime) => {
      if (disposed) return null;
      if (!runtime || typeof runtime.drawAnimation !== 'function') {
        throw new TypeError('Effects atlas loader returned an invalid sprite runtime.');
      }
      const manifest = validateEffectsAtlasManifest(runtime.manifest, { source: String(manifestSource) });
      state.runtime = runtime;
      state.manifest = manifest;
      state.durations = Object.freeze(Object.fromEntries(
        EFFECT_ATLAS_FAMILIES.map((family) => [family, effectAnimationDuration(manifest, family)]),
      ));
      state.status = runtime.degraded ? 'degraded' : 'ready';
      state.error = runtime.loadError ?? null;
      return runtime;
    })
    .catch((error) => {
      if (!disposed) {
        state.status = 'degraded';
        state.error = error;
      }
      return null;
    });

  function snapshot() {
    return Object.freeze({
      status: state.status,
      ready: state.status === 'ready',
      degraded: state.status === 'degraded',
      atlasId: state.manifest?.id ?? null,
      familyCount: state.manifest ? EFFECT_ATLAS_FAMILIES.length : 0,
      error: state.error,
    });
  }

  function drawAnimation(record, descriptor) {
    if (state.status !== 'ready' || !state.runtime || !finitePoint(record)) return false;
    const screen = owner.sp(record.x, record.y);
    const zoom = Number(simulation.camera?.z) || 1;
    const elapsedMs = state.durations[descriptor.family] * descriptor.progress;
    const context = owner.x;
    context.save();
    try {
      context.translate(screen.x, screen.y);
      if (descriptor.rotation) context.rotate(descriptor.rotation);
      state.runtime.drawAnimation(context, descriptor.family, {
        x: 0,
        y: 0,
        scale: descriptor.scale * zoom,
        alpha: descriptor.alpha,
        elapsedMs,
      });
    } finally {
      context.restore();
    }
    return true;
  }

  function drawRecord(record, channel = 'effect') {
    return drawAnimation(record, createEffectPresentationDescriptor(record, { channel }));
  }

  function drawAll() {
    if (state.status !== 'ready') return false;
    let drawn = 0;
    for (const projectile of simulation.projectiles) if (drawRecord(projectile, 'projectile')) drawn += 1;
    for (const effect of simulation.effects) if (drawRecord(effect, 'effect')) drawn += 1;
    return drawn;
  }

  function drawUnitFlash(unit) {
    if (state.status !== 'ready' || !unit?.flash || !finitePoint(unit)) return false;
    const screen = owner.sp(unit.x, unit.y);
    const zoom = Number(simulation.camera?.z) || 1;
    const descriptor = createEffectPresentationDescriptor(
      { ...unit, life: unit.flash, max: Math.max(0.1, Number(unit.flash) || 0.1) },
      { channel: 'unit-flash' },
    );
    const context = owner.x;
    context.save();
    try {
      context.translate(Math.round(screen.x), Math.round(screen.y));
      context.rotate((Number(unit.angle) || 0) + Math.PI / 2);
      state.runtime.drawAnimation(context, descriptor.family, {
        x: 0,
        y: -32 * zoom,
        scale: descriptor.scale * zoom,
        alpha: descriptor.alpha,
        elapsedMs: state.durations[descriptor.family] * descriptor.progress,
      });
    } finally {
      context.restore();
    }
    return true;
  }

  function dispose() {
    disposed = true;
    state.status = 'disposed';
    state.runtime = null;
    state.manifest = null;
    state.durations = Object.freeze({});
  }

  return Object.freeze({ ready, snapshot, drawRecord, drawAll, drawUnitFlash, dispose });
}

export function installEffectsAtlasRenderer(options = {}) {
  const renderer = requireRenderer(options.renderer);
  const controller = createEffectsAtlasController(options);
  const originalEffects = renderer.effects;
  const originalUnit = renderer.unit;
  const previousSnapshot = renderer.effectsAtlasState;

  renderer.effects = function effectsAtlasLayer() {
    if (controller.snapshot().status !== 'ready') return originalEffects.call(renderer);
    return controller.drawAll();
  };
  renderer.unit = function atlasAwareUnit(unit) {
    if (controller.snapshot().status !== 'ready' || !unit?.flash) return originalUnit.call(renderer, unit);
    const result = originalUnit.call(renderer, { ...unit, flash: 0 });
    controller.drawUnitFlash(unit);
    return result;
  };
  renderer.effectsAtlasState = controller.snapshot;

  const dispose = () => {
    renderer.effects = originalEffects;
    renderer.unit = originalUnit;
    if (previousSnapshot === undefined) delete renderer.effectsAtlasState;
    else renderer.effectsAtlasState = previousSnapshot;
    controller.dispose();
  };
  dispose.ready = controller.ready;
  return dispose;
}
