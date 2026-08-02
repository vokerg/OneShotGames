import {
  spriteAtlasAnimationFrame,
  spriteAtlasFrame,
  validateSpriteAtlasManifest,
} from './sprite-atlas-manifest.js';

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
      if (typeof target.translate === 'function') target.translate(x, y);
      if (flipX && typeof target.scale === 'function') target.scale(-1, 1);
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
    return drawResolvedFrame(context, spriteAtlasFrame(atlas, frameId), options);
  }

  function drawAnimation(context, animationId, options = {}) {
    const resolved = spriteAtlasAnimationFrame(atlas, animationId, options);
    drawResolvedFrame(context, resolved.frame, options);
    return resolved;
  }

  function attachment(frameId, name, { x = 0, y = 0, scale = 1, flipX = false } = {}) {
    const frame = spriteAtlasFrame(atlas, frameId);
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
