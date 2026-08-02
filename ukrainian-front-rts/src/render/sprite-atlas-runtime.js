import { validateSpriteAtlasManifest } from './sprite-atlas-manifest.js';

function requireContext(context) {
  const methods = ['drawImage', 'save', 'restore', 'translate', 'scale'];
  if (!context || methods.some((method) => typeof context[method] !== 'function')) {
    throw new TypeError('Sprite atlas drawing requires a CanvasRenderingContext2D-compatible object.');
  }
  return context;
}

function requireImage(image) {
  if (!image || (typeof image !== 'object' && typeof image !== 'function')) {
    throw new TypeError('Sprite atlas runtime requires a loaded image.');
  }
  return image;
}

function frameFor(atlas, frameId) {
  return atlas.frames[frameId] ?? atlas.frames[atlas.fallback.frame];
}

function directionFor(atlas, direction) {
  if (typeof direction === 'string') {
    return atlas.directions.order.includes(direction) ? direction : atlas.directions.zero;
  }
  if (!Number.isFinite(direction)) return atlas.directions.zero;
  const count = atlas.directions.order.length;
  const index = ((Math.round(direction) % count) + count) % count;
  return atlas.directions.order[index];
}

function animationFrameFor(atlas, animationId, {
  elapsedMs = 0,
  direction = null,
} = {}) {
  const animation = atlas.animations[animationId];
  if (!animation) {
    const frame = frameFor(atlas, atlas.fallback.frame);
    return Object.freeze({ animationId: null, frameId: frame.id, frame, index: 0, elapsedMs: 0 });
  }
  const directionId = directionFor(atlas, direction);
  const sequence = animation.frames
    ?? animation.directions[directionId]
    ?? animation.directions[atlas.directions.zero]
    ?? animation.directions[Object.keys(animation.directions)[0]];
  const total = sequence.reduce((sum, entry) => sum + entry.durationMs, 0);
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  let cursor = animation.loop === 'loop'
    ? safeElapsed % total
    : Math.min(safeElapsed, Math.max(0, total - Number.EPSILON));
  let index = 0;
  while (index < sequence.length - 1 && cursor >= sequence[index].durationMs) {
    cursor -= sequence[index].durationMs;
    index += 1;
  }
  const entry = sequence[index];
  return Object.freeze({
    animationId,
    frameId: entry.frame,
    frame: atlas.frames[entry.frame],
    index,
    elapsedMs: cursor,
    durationMs: entry.durationMs,
    complete: animation.loop !== 'loop' && safeElapsed >= total,
  });
}

function validateLoadedImageDimensions(image, manifest, source) {
  const width = Number(image.naturalWidth);
  const height = Number(image.naturalHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  if (width !== manifest.image.width || height !== manifest.image.height) {
    throw new Error(
      `Sprite atlas image dimensions do not match manifest for ${source}: ` +
      `${width}x${height} !== ${manifest.image.width}x${manifest.image.height}.`,
    );
  }
}

export function configureNearestNeighborContext(context) {
  const target = requireContext(context);
  target.imageSmoothingEnabled = false;
  return target;
}

export function resolveAtlasImageSource(manifestUrl, imageSource) {
  if (!manifestUrl) return imageSource;
  return new URL(imageSource, manifestUrl).href;
}

export function createSpriteAtlasRuntime(manifest, image, {
  degraded = false,
  loadError = null,
} = {}) {
  const atlas = validateSpriteAtlasManifest(manifest);
  const bitmap = requireImage(image);

  function drawResolvedFrame(context, frame, {
    x,
    y,
    scale = 1,
    alpha = 1,
    flipX = false,
  } = {}) {
    const target = configureNearestNeighborContext(context);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Sprite draw position must be finite.');
    if (!Number.isFinite(scale) || scale <= 0) throw new TypeError('Sprite draw scale must be positive.');
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new TypeError('Sprite alpha must be between 0 and 1.');
    const sourceScale = scale / atlas.image.pixelRatio;
    const destinationX = (-frame.anchor.x + frame.offset.x) * sourceScale;
    const destinationY = (-frame.anchor.y + frame.offset.y) * sourceScale;
    const destinationWidth = frame.rect.w * sourceScale;
    const destinationHeight = frame.rect.h * sourceScale;
    target.save();
    try {
      if ('globalAlpha' in target) target.globalAlpha *= alpha;
      target.translate(x, y);
      if (flipX) target.scale(-1, 1);
      target.drawImage(
        bitmap,
        frame.rect.x,
        frame.rect.y,
        frame.rect.w,
        frame.rect.h,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
      );
    } finally {
      target.restore();
    }
    return frame;
  }

  function drawFrame(context, frameId, options) {
    return drawResolvedFrame(context, frameFor(atlas, frameId), options);
  }

  function drawAnimation(context, animationId, options = {}) {
    const resolved = animationFrameFor(atlas, animationId, options);
    drawResolvedFrame(context, resolved.frame, options);
    return resolved;
  }

  function attachment(frameId, name, { x = 0, y = 0, scale = 1, flipX = false } = {}) {
    const frame = frameFor(atlas, frameId);
    const point = frame.attachments[name];
    if (!point) return null;
    const sourceScale = scale / atlas.image.pixelRatio;
    const localX = (point.x - frame.anchor.x) * sourceScale;
    const localY = (point.y - frame.anchor.y) * sourceScale;
    return Object.freeze({ x: x + (flipX ? -localX : localX), y: y + localY });
  }

  return Object.freeze({
    manifest: atlas,
    image: bitmap,
    degraded: Boolean(degraded),
    loadError,
    drawFrame,
    drawAnimation,
    attachment,
  });
}

export function loadImageElement(source, {
  imageFactory = () => new Image(),
} = {}) {
  return new Promise((resolve, reject) => {
    let image;
    try {
      image = imageFactory();
    } catch (error) {
      reject(error);
      return;
    }
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load sprite atlas image: ${source}`));
    image.src = source;
  });
}

export async function loadSpriteAtlas(manifestSource, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  imageFactory,
  fallbackRuntime = null,
} = {}) {
  try {
    let manifestValue;
    let manifestUrl = null;
    if (typeof manifestSource === 'string' || manifestSource instanceof URL) {
      if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available for sprite atlas loading.');
      manifestUrl = String(manifestSource);
      const response = await fetchImpl(manifestUrl);
      if (!response?.ok) throw new Error(`Unable to load sprite atlas manifest: ${manifestUrl} (${response?.status ?? 'unknown'})`);
      manifestValue = await response.json();
    } else {
      manifestValue = manifestSource;
    }
    const manifest = validateSpriteAtlasManifest(manifestValue, { source: manifestUrl ?? 'sprite atlas manifest' });
    const imageSource = resolveAtlasImageSource(manifestUrl, manifest.image.src);
    const image = await loadImageElement(imageSource, { imageFactory });
    validateLoadedImageDimensions(image, manifest, imageSource);
    return createSpriteAtlasRuntime(manifest, image);
  } catch (error) {
    if (fallbackRuntime) {
      return Object.freeze({
        ...fallbackRuntime,
        degraded: true,
        loadError: error,
      });
    }
    throw error;
  }
}
