export const SPRITE_ATLAS_SCHEMA = 'fields-of-resolve.sprite-atlas';
export const SPRITE_ATLAS_VERSION = 1;
export const SPRITE_ATLAS_SAMPLING = 'nearest';

const LOOP_MODES = new Set(['loop', 'once', 'hold']);

function fail(source, path, message) {
  throw new TypeError(`${source}${path ? ` ${path}` : ''}: ${message}`);
}

function object(value, source, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(source, path, 'expected an object');
  }
  return value;
}

function string(value, source, path) {
  if (typeof value !== 'string' || !value.trim()) fail(source, path, 'expected a non-empty string');
  return value;
}

function integer(value, source, path, { min = 0 } = {}) {
  if (!Number.isInteger(value) || value < min) fail(source, path, `expected an integer >= ${min}`);
  return value;
}

function number(value, source, path, { min = 0 } = {}) {
  if (!Number.isFinite(value) || value < min) fail(source, path, `expected a finite number >= ${min}`);
  return value;
}

function point(value, source, path, { width, height, allowEdge = true } = {}) {
  const input = object(value, source, path);
  const x = number(input.x, source, `${path}.x`);
  const y = number(input.y, source, `${path}.y`);
  const maxX = allowEdge ? width : Math.max(0, width - 1);
  const maxY = allowEdge ? height : Math.max(0, height - 1);
  if (x > maxX || y > maxY) fail(source, path, `point (${x}, ${y}) exceeds source bounds ${width}x${height}`);
  return Object.freeze({ x, y });
}

function rect(value, source, path, { width, height, positive = true } = {}) {
  const input = object(value, source, path);
  const x = integer(input.x, source, `${path}.x`);
  const y = integer(input.y, source, `${path}.y`);
  const w = integer(input.w, source, `${path}.w`, { min: positive ? 1 : 0 });
  const h = integer(input.h, source, `${path}.h`, { min: positive ? 1 : 0 });
  if (x + w > width || y + h > height) {
    fail(source, path, `rectangle ${x},${y},${w},${h} exceeds bounds ${width}x${height}`);
  }
  return Object.freeze({ x, y, w, h });
}

function namedPoints(value, source, path, bounds) {
  if (value === undefined) return Object.freeze({});
  const input = object(value, source, path);
  return Object.freeze(Object.fromEntries(
    Object.keys(input).sort().map((name) => [
      string(name, source, path),
      point(input[name], source, `${path}.${name}`, bounds),
    ]),
  ));
}

function namedMasks(value, source, path, bounds) {
  if (value === undefined) return Object.freeze({});
  const input = object(value, source, path);
  return Object.freeze(Object.fromEntries(
    Object.keys(input).sort().map((name) => [
      string(name, source, path),
      rect(input[name], source, `${path}.${name}`, bounds),
    ]),
  ));
}

function normalizeFrame(id, value, image, source) {
  const path = `.frames.${id}`;
  const input = object(value, source, path);
  const frameRect = rect(input.rect, source, `${path}.rect`, image);
  const sourceSizeInput = object(input.sourceSize ?? { w: frameRect.w, h: frameRect.h }, source, `${path}.sourceSize`);
  const sourceSize = Object.freeze({
    w: integer(sourceSizeInput.w, source, `${path}.sourceSize.w`, { min: 1 }),
    h: integer(sourceSizeInput.h, source, `${path}.sourceSize.h`, { min: 1 }),
  });
  const offsetInput = input.offset ?? { x: 0, y: 0 };
  const offset = point(offsetInput, source, `${path}.offset`, {
    width: sourceSize.w,
    height: sourceSize.h,
  });
  if (offset.x + frameRect.w > sourceSize.w || offset.y + frameRect.h > sourceSize.h) {
    fail(source, path, 'trimmed frame rectangle and offset exceed sourceSize');
  }
  const anchor = point(input.anchor ?? { x: sourceSize.w / 2, y: sourceSize.h }, source, `${path}.anchor`, {
    width: sourceSize.w,
    height: sourceSize.h,
  });
  return Object.freeze({
    id,
    rect: frameRect,
    sourceSize,
    offset,
    anchor,
    attachments: namedPoints(input.attachments, source, `${path}.attachments`, {
      width: sourceSize.w,
      height: sourceSize.h,
    }),
    masks: namedMasks(input.masks, source, `${path}.masks`, {
      width: sourceSize.w,
      height: sourceSize.h,
    }),
    tags: Object.freeze((input.tags ?? []).map((tag, index) => string(tag, source, `${path}.tags[${index}]`))),
  });
}

function normalizeSequence(value, frames, source, path, defaultDurationMs) {
  if (!Array.isArray(value) || !value.length) fail(source, path, 'expected a non-empty frame sequence');
  return Object.freeze(value.map((entry, index) => {
    const item = typeof entry === 'string' ? { frame: entry } : object(entry, source, `${path}[${index}]`);
    const frame = string(item.frame, source, `${path}[${index}].frame`);
    if (!frames[frame]) fail(source, `${path}[${index}].frame`, `unknown frame ${frame}`);
    const durationMs = integer(item.durationMs ?? defaultDurationMs, source, `${path}[${index}].durationMs`, { min: 1 });
    return Object.freeze({ frame, durationMs });
  }));
}

function normalizeAnimation(id, value, frames, directions, source) {
  const path = `.animations.${id}`;
  const input = object(value, source, path);
  const loop = input.loop ?? 'loop';
  if (!LOOP_MODES.has(loop)) fail(source, `${path}.loop`, `expected one of ${[...LOOP_MODES].join(', ')}`);
  const defaultDurationMs = integer(input.defaultDurationMs ?? 100, source, `${path}.defaultDurationMs`, { min: 1 });
  const hasFrames = input.frames != null;
  const hasDirections = input.directions != null;
  if (hasFrames === hasDirections) fail(source, path, 'provide exactly one of frames or directions');
  if (hasFrames) {
    return Object.freeze({
      id,
      loop,
      defaultDurationMs,
      frames: normalizeSequence(input.frames, frames, source, `${path}.frames`, defaultDurationMs),
      directions: null,
    });
  }
  const directionInput = object(input.directions, source, `${path}.directions`);
  const normalizedDirections = {};
  for (const key of Object.keys(directionInput).sort()) {
    if (!directions.order.includes(key)) fail(source, `${path}.directions.${key}`, `unknown direction ${key}`);
    normalizedDirections[key] = normalizeSequence(
      directionInput[key],
      frames,
      source,
      `${path}.directions.${key}`,
      defaultDurationMs,
    );
  }
  if (!Object.keys(normalizedDirections).length) fail(source, `${path}.directions`, 'expected at least one direction sequence');
  return Object.freeze({
    id,
    loop,
    defaultDurationMs,
    frames: null,
    directions: Object.freeze(normalizedDirections),
  });
}

function normalizeDirections(value, source) {
  const input = object(value ?? { order: ['n'], zero: 'n', clockwise: true }, source, '.directions');
  if (!Array.isArray(input.order) || !input.order.length) fail(source, '.directions.order', 'expected a non-empty array');
  const order = input.order.map((entry, index) => string(entry, source, `.directions.order[${index}]`));
  if (new Set(order).size !== order.length) fail(source, '.directions.order', 'direction IDs must be unique');
  const zero = string(input.zero ?? order[0], source, '.directions.zero');
  if (!order.includes(zero)) fail(source, '.directions.zero', 'must reference an entry in order');
  if (input.clockwise !== undefined && typeof input.clockwise !== 'boolean') {
    fail(source, '.directions.clockwise', 'expected a boolean');
  }
  return Object.freeze({ order: Object.freeze(order), zero, clockwise: input.clockwise ?? true });
}

export function validateSpriteAtlasManifest(value, { source = 'sprite atlas manifest' } = {}) {
  const input = object(value, source, '');
  if (input.schema !== SPRITE_ATLAS_SCHEMA) fail(source, '.schema', `expected ${SPRITE_ATLAS_SCHEMA}`);
  if (input.version !== SPRITE_ATLAS_VERSION) fail(source, '.version', `unsupported version ${input.version}`);
  if (input.sampling !== undefined && input.sampling !== SPRITE_ATLAS_SAMPLING) {
    fail(source, '.sampling', `expected ${SPRITE_ATLAS_SAMPLING}`);
  }
  const imageInput = object(input.image, source, '.image');
  const image = Object.freeze({
    src: string(imageInput.src, source, '.image.src'),
    width: integer(imageInput.width, source, '.image.width', { min: 1 }),
    height: integer(imageInput.height, source, '.image.height', { min: 1 }),
    pixelRatio: number(imageInput.pixelRatio ?? 1, source, '.image.pixelRatio', { min: Number.EPSILON }),
  });
  const directions = normalizeDirections(input.directions, source);
  const frameInput = object(input.frames, source, '.frames');
  const frameIds = Object.keys(frameInput).sort();
  if (!frameIds.length) fail(source, '.frames', 'expected at least one frame');
  const frames = Object.freeze(Object.fromEntries(frameIds.map((id) => [
    string(id, source, '.frames key'),
    normalizeFrame(id, frameInput[id], image, source),
  ])));
  const animationInput = object(input.animations ?? {}, source, '.animations');
  const animations = Object.freeze(Object.fromEntries(Object.keys(animationInput).sort().map((id) => [
    string(id, source, '.animations key'),
    normalizeAnimation(id, animationInput[id], frames, directions, source),
  ])));
  const fallbackInput = object(input.fallback, source, '.fallback');
  const fallbackFrame = string(fallbackInput.frame, source, '.fallback.frame');
  if (!frames[fallbackFrame]) fail(source, '.fallback.frame', `unknown frame ${fallbackFrame}`);
  const paletteTokens = input.paletteTokens === undefined
    ? Object.freeze({})
    : Object.freeze(Object.fromEntries(Object.keys(object(input.paletteTokens, source, '.paletteTokens')).sort().map((key) => [
      string(key, source, '.paletteTokens key'),
      string(input.paletteTokens[key], source, `.paletteTokens.${key}`),
    ])));
  return Object.freeze({
    schema: SPRITE_ATLAS_SCHEMA,
    version: SPRITE_ATLAS_VERSION,
    id: string(input.id, source, '.id'),
    sampling: SPRITE_ATLAS_SAMPLING,
    image,
    directions,
    paletteTokens,
    frames,
    animations,
    fallback: Object.freeze({ frame: fallbackFrame }),
  });
}

export function spriteAtlasFrame(manifest, frameId) {
  const atlas = validateSpriteAtlasManifest(manifest);
  return atlas.frames[frameId] ?? atlas.frames[atlas.fallback.frame];
}

export function spriteAtlasDirection(manifest, direction) {
  const atlas = validateSpriteAtlasManifest(manifest);
  if (typeof direction === 'string') {
    return atlas.directions.order.includes(direction) ? direction : atlas.directions.zero;
  }
  if (!Number.isFinite(direction)) return atlas.directions.zero;
  const count = atlas.directions.order.length;
  const index = ((Math.round(direction) % count) + count) % count;
  return atlas.directions.order[index];
}

function sequenceFor(atlas, animation, direction) {
  if (animation.frames) return animation.frames;
  const key = spriteAtlasDirection(atlas, direction);
  return animation.directions[key]
    ?? animation.directions[atlas.directions.zero]
    ?? animation.directions[Object.keys(animation.directions)[0]];
}

export function spriteAtlasAnimationFrame(manifest, animationId, {
  elapsedMs = 0,
  direction = null,
} = {}) {
  const atlas = validateSpriteAtlasManifest(manifest);
  const animation = atlas.animations[animationId];
  if (!animation) {
    const frame = atlas.frames[atlas.fallback.frame];
    return Object.freeze({ animationId: null, frameId: frame.id, frame, index: 0, elapsedMs: 0 });
  }
  const sequence = sequenceFor(atlas, animation, direction);
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
