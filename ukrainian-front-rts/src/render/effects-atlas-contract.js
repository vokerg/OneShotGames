import { validateSpriteAtlasManifest } from './sprite-atlas-manifest.js';

export const EFFECT_ATLAS_ID = 'fields-of-resolve.effects';
export const EFFECT_ATLAS_VERSION = 1;
export const EFFECT_ATLAS_FAMILIES = Object.freeze([
  'muzzle-flash',
  'tracer',
  'shell',
  'missile',
  'drone',
  'impact',
  'explosion',
  'smoke',
  'fire',
  'dust',
  'repair',
  'heal',
  'capture',
  'build',
  'weather',
]);

const ONCE_FAMILIES = new Set(['muzzle-flash', 'impact', 'explosion', 'dust']);
const PROJECTILE_FAMILIES = new Set(['tracer', 'shell', 'missile', 'drone']);
const PROJECTILE_PRESENTATION_LIFETIME_SECONDS = 2;
const DIRECT_ALIASES = Object.freeze({
  'muzzle': 'muzzle-flash',
  'muzzle-flash': 'muzzle-flash',
  'bullet': 'tracer',
  'tracer': 'tracer',
  'shell': 'shell',
  'missile': 'missile',
  'rocket': 'missile',
  'drone': 'drone',
  'impact': 'impact',
  'hit': 'impact',
  'blast': 'impact',
  'explosion': 'explosion',
  'smoke': 'smoke',
  'fire': 'fire',
  'burning': 'fire',
  'dust': 'dust',
  'repair': 'repair',
  'heal': 'heal',
  'healing': 'heal',
  'capture': 'capture',
  'recon': 'capture',
  'build': 'build',
  'construction': 'build',
  'weather': 'weather',
  'rain': 'weather',
  'snow': 'weather',
  'storm': 'weather',
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function requireSourceObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

export function createEffectsAtlasManifestFromSource(value, { source = 'effects atlas source' } = {}) {
  const input = requireSourceObject(value, source);
  if (input.schema !== 'fields-of-resolve.sprite-atlas-source' || input.version !== 1) {
    throw new TypeError(`${source}: unsupported effects atlas source schema or version.`);
  }
  if (input.id !== EFFECT_ATLAS_ID) throw new TypeError(`${source}: expected id ${EFFECT_ATLAS_ID}.`);
  if (!Array.isArray(input.frames) || !input.frames.length) throw new TypeError(`${source}: frames must be non-empty.`);
  const padding = Number.isInteger(input.padding) && input.padding >= 0 ? input.padding : 1;
  const maxWidth = Number.isInteger(input.maxWidth) && input.maxWidth > 0 ? input.maxWidth : 2048;
  const ordered = [...input.frames].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const ids = new Set();
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = 0;
  const placed = [];
  for (const frame of ordered) {
    if (!frame?.id || !Number.isInteger(frame.width) || frame.width <= 0 || !Number.isInteger(frame.height) || frame.height <= 0) {
      throw new TypeError(`${source}: every frame requires an id and positive integer dimensions.`);
    }
    if (ids.has(frame.id)) throw new TypeError(`${source}: duplicate frame id ${frame.id}.`);
    ids.add(frame.id);
    if (x > padding && x + frame.width + padding > maxWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    placed.push({ ...frame, x, y });
    width = Math.max(width, x + frame.width + padding);
    rowHeight = Math.max(rowHeight, frame.height);
    x += frame.width + padding;
  }
  const height = y + rowHeight + padding;
  return validateEffectsAtlasManifest({
    schema: 'fields-of-resolve.sprite-atlas',
    version: EFFECT_ATLAS_VERSION,
    id: EFFECT_ATLAS_ID,
    image: {
      src: input.output?.image,
      width,
      height,
      pixelRatio: input.pixelRatio ?? 1,
    },
    directions: input.directions,
    paletteTokens: input.paletteTokens,
    frames: Object.fromEntries(placed.map((frame) => [frame.id, {
      rect: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      sourceSize: frame.sourceSize ?? { w: frame.width, h: frame.height },
      offset: frame.offset ?? { x: 0, y: 0 },
      anchor: frame.anchor,
      attachments: frame.attachments,
      masks: frame.masks,
      tags: frame.tags,
    }])),
    animations: input.animations,
    fallback: input.fallback,
  }, { source });
}

export function validateEffectsAtlasManifest(value, { source = 'effects atlas manifest' } = {}) {
  const atlas = validateSpriteAtlasManifest(value, { source });
  if (atlas.id !== EFFECT_ATLAS_ID) {
    throw new TypeError(`${source}: expected atlas id ${EFFECT_ATLAS_ID}.`);
  }

  for (const family of EFFECT_ATLAS_FAMILIES) {
    const animation = atlas.animations[family];
    if (!animation) throw new TypeError(`${source}: missing required effect animation ${family}.`);
    if (!animation.frames || animation.directions) {
      throw new TypeError(`${source}: effect animation ${family} must use one shared frame sequence.`);
    }
    const expectedLoop = ONCE_FAMILIES.has(family) ? 'once' : 'loop';
    if (animation.loop !== expectedLoop) {
      throw new TypeError(`${source}: effect animation ${family} must use ${expectedLoop} playback.`);
    }
    for (const entry of animation.frames) {
      const frame = atlas.frames[entry.frame];
      if (!frame.tags.includes('effects') || !frame.tags.includes(family)) {
        throw new TypeError(`${source}: frame ${entry.frame} must be tagged effects and ${family}.`);
      }
      if (frame.anchor.x !== frame.sourceSize.w / 2 || frame.anchor.y !== frame.sourceSize.h / 2) {
        throw new TypeError(`${source}: effect frame ${entry.frame} must use a centered anchor.`);
      }
    }
  }

  return atlas;
}

export function effectProgress(record = {}) {
  const life = finite(record.life, NaN);
  const maximum = finite(record.max ?? record.maxLife ?? record.duration, NaN);
  if (Number.isFinite(life) && Number.isFinite(maximum) && maximum > 0) {
    return clamp(1 - life / maximum);
  }

  const elapsed = finite(record.elapsedMs ?? record.ageMs, NaN);
  const duration = finite(record.durationMs, NaN);
  if (Number.isFinite(elapsed) && Number.isFinite(duration) && duration > 0) {
    return clamp(elapsed / duration);
  }

  return 0;
}

function presentationProgress(record, { channel, maxLife } = {}) {
  const explicitMaximum = finite(record.max ?? record.maxLife ?? record.duration, NaN);
  if (Number.isFinite(explicitMaximum) && explicitMaximum > 0) return effectProgress(record);

  const fallbackMaximum = finite(
    maxLife,
    channel === 'projectile' ? PROJECTILE_PRESENTATION_LIFETIME_SECONDS : NaN,
  );
  const life = finite(record.life, NaN);
  if (Number.isFinite(life) && Number.isFinite(fallbackMaximum) && fallbackMaximum > 0) {
    return clamp(1 - life / fallbackMaximum);
  }

  return effectProgress(record);
}

function projectileFamily(record) {
  const kind = String(record?.kind ?? '').toLowerCase();
  if (PROJECTILE_FAMILIES.has(kind)) return kind;
  if (kind === 'rocket') return 'missile';
  return 'tracer';
}

function blastFamily(record) {
  const impact = String(record?.impact ?? '').toLowerCase();
  const radius = finite(record?.radius, 0);
  return radius >= 56 || ['explosive', 'artillery', 'rocket', 'missile', 'thermobaric'].includes(impact)
    ? 'explosion'
    : 'impact';
}

export function effectFamilyForRecord(record = {}, { channel = 'effect' } = {}) {
  if (channel === 'projectile') return projectileFamily(record);
  if (channel === 'unit-flash') return 'muzzle-flash';

  const kind = String(record.kind ?? '').toLowerCase();
  if (kind === 'blast') return blastFamily(record);
  return DIRECT_ALIASES[kind] ?? 'impact';
}

function baseScale(family, record) {
  if (family === 'tracer') return 0.48;
  if (family === 'shell') return 0.62;
  if (family === 'missile') return 0.82;
  if (family === 'drone') return 0.86;
  if (family === 'muzzle-flash') return 0.72;
  const radius = finite(record.radius, 24);
  return clamp(radius / 24, 0.45, 4);
}

function baseAlpha(family, progress, record) {
  const authored = clamp(finite(record.alpha, 1));
  if (family === 'smoke') return authored * 0.58;
  if (family === 'weather') return authored * 0.7;
  if (['fire', 'repair', 'heal', 'capture', 'build'].includes(family)) return authored * 0.9;
  return authored * Math.max(0.12, 1 - progress);
}

export function createEffectPresentationDescriptor(record = {}, options = {}) {
  const channel = options.channel ?? 'effect';
  const family = effectFamilyForRecord(record, { channel });
  const progress = presentationProgress(record, { channel, maxLife: options.maxLife });
  let rotation = 0;
  if (channel === 'projectile') {
    const targetX = finite(record.aimX, finite(record.target?.x, finite(record.x)));
    const targetY = finite(record.aimY, finite(record.target?.y, finite(record.y)));
    const dx = targetX - finite(record.x);
    const dy = targetY - finite(record.y);
    if (dx !== 0 || dy !== 0) rotation = Math.atan2(dy, dx) + Math.PI / 2;
  }

  return Object.freeze({
    family,
    progress,
    rotation,
    scale: baseScale(family, record),
    alpha: baseAlpha(family, progress, record),
    fallback: channel === 'effect' && !Object.prototype.hasOwnProperty.call(DIRECT_ALIASES, String(record.kind ?? '').toLowerCase()) && String(record.kind ?? '').toLowerCase() !== 'blast',
  });
}

export function effectAnimationDuration(atlas, family) {
  const manifest = validateEffectsAtlasManifest(atlas);
  const animation = manifest.animations[family] ?? manifest.animations.impact;
  return animation.frames.reduce((sum, entry) => sum + entry.durationMs, 0);
}

export function effectAnimationElapsed(atlas, descriptor) {
  return effectAnimationDuration(atlas, descriptor.family) * clamp(descriptor.progress);
}
