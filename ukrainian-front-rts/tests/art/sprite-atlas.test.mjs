import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPRITE_ATLAS_SCHEMA,
  SPRITE_ATLAS_VERSION,
  spriteAtlasAnimationFrame,
  spriteAtlasDirection,
  spriteAtlasFrame,
  validateSpriteAtlasManifest,
} from '../../src/render/sprite-atlas-manifest.js';
import {
  createSpriteAtlasRuntime,
  loadSpriteAtlas,
} from '../../src/render/sprite-atlas-runtime.js';

function manifest(overrides = {}) {
  return {
    schema: SPRITE_ATLAS_SCHEMA,
    version: SPRITE_ATLAS_VERSION,
    id: 'test.units',
    image: { src: 'test.svg', width: 32, height: 16, pixelRatio: 1 },
    directions: { order: ['n', 'e', 's', 'w'], zero: 'n', clockwise: true },
    frames: {
      missing: {
        rect: { x: 0, y: 0, w: 8, h: 8 },
        sourceSize: { w: 10, h: 10 },
        offset: { x: 1, y: 2 },
        anchor: { x: 5, y: 10 },
        attachments: { muzzle: { x: 5, y: 1 } },
        masks: { selection: { x: 1, y: 2, w: 8, h: 8 } },
      },
      idleN0: { rect: { x: 8, y: 0, w: 8, h: 8 }, anchor: { x: 4, y: 8 } },
      idleN1: { rect: { x: 16, y: 0, w: 8, h: 8 }, anchor: { x: 4, y: 8 } },
      idleE0: { rect: { x: 24, y: 0, w: 8, h: 8 }, anchor: { x: 4, y: 8 } },
    },
    animations: {
      idle: {
        loop: 'loop',
        defaultDurationMs: 100,
        directions: {
          n: ['idleN0', { frame: 'idleN1', durationMs: 200 }],
          e: ['idleE0'],
        },
      },
    },
    fallback: { frame: 'missing' },
    ...overrides,
  };
}

test('validates and freezes versioned atlas data with explicit anchors and masks', () => {
  const atlas = validateSpriteAtlasManifest(manifest());
  assert.equal(atlas.sampling, 'nearest');
  assert.equal(Object.isFrozen(atlas), true);
  assert.equal(Object.isFrozen(atlas.frames.missing.attachments), true);
  assert.deepEqual(atlas.frames.missing.offset, { x: 1, y: 2 });
  assert.deepEqual(atlas.frames.missing.masks.selection, { x: 1, y: 2, w: 8, h: 8 });
});

test('rejects unsupported versions, out-of-bounds frames, and dangling animation references', () => {
  assert.throws(() => validateSpriteAtlasManifest(manifest({ version: 2 })), /unsupported version/);
  const outside = manifest();
  outside.frames.missing.rect.x = 30;
  assert.throws(() => validateSpriteAtlasManifest(outside), /exceeds bounds/);
  const dangling = manifest();
  dangling.animations.idle.directions.n = ['unknown'];
  assert.throws(() => validateSpriteAtlasManifest(dangling), /unknown frame unknown/);
  assert.throws(() => validateSpriteAtlasManifest(manifest({ sampling: 'linear' })), /expected nearest/);
});

test('resolves directions, animation timing, and missing frames deterministically', () => {
  const atlas = validateSpriteAtlasManifest(manifest());
  assert.equal(spriteAtlasDirection(atlas, 5), 'e');
  assert.equal(spriteAtlasDirection(atlas, 'bad'), 'n');
  assert.equal(spriteAtlasAnimationFrame(atlas, 'idle', { direction: 'n', elapsedMs: 99 }).frameId, 'idleN0');
  assert.equal(spriteAtlasAnimationFrame(atlas, 'idle', { direction: 'n', elapsedMs: 100 }).frameId, 'idleN1');
  assert.equal(spriteAtlasAnimationFrame(atlas, 'idle', { direction: 'n', elapsedMs: 300 }).frameId, 'idleN0');
  assert.equal(spriteAtlasFrame(atlas, 'not-present').id, 'missing');
});

test('runtime draws nearest-neighbor frames around their gameplay anchor', () => {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    scale(x, y) { calls.push(['scale', x, y]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
  };
  const image = { id: 'image' };
  const runtime = createSpriteAtlasRuntime(manifest(), image);
  const frame = runtime.drawFrame(context, 'missing', { x: 100, y: 80, scale: 2, flipX: true, alpha: 0.5 });
  assert.equal(context.imageSmoothingEnabled, false);
  assert.equal(frame.id, 'missing');
  assert.deepEqual(calls, [
    ['save'],
    ['translate', 100, 80],
    ['scale', -1, 1],
    ['drawImage', image, 0, 0, 8, 8, -8, -16, 16, 16],
    ['restore'],
  ]);
  assert.deepEqual(runtime.attachment('missing', 'muzzle', { x: 100, y: 80, scale: 2 }), { x: 100, y: 62 });
});

test('runtime converts high-DPI source coordinates into logical draw coordinates', () => {
  const calls = [];
  const context = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage(...args) { calls.push(args); },
  };
  const highDpi = manifest();
  highDpi.image.pixelRatio = 2;
  const runtime = createSpriteAtlasRuntime(highDpi, { id: '2x' });
  runtime.drawFrame(context, 'missing', { x: 100, y: 80, scale: 2 });
  assert.deepEqual(calls[0].slice(5), [-4, -8, 8, 8]);
  assert.deepEqual(runtime.attachment('missing', 'muzzle', { x: 100, y: 80, scale: 2 }), { x: 100, y: 71 });
});

test('loader resolves relative images and degrades to an explicit fallback runtime', async () => {
  const assigned = [];
  const imageFactory = () => ({
    set src(value) {
      assigned.push(value);
      queueMicrotask(() => this.onload());
    },
  });
  const loaded = await loadSpriteAtlas('https://example.test/art/test.atlas.json', {
    fetchImpl: async () => ({ ok: true, json: async () => manifest() }),
    imageFactory,
  });
  assert.equal(loaded.degraded, false);
  assert.deepEqual(assigned, ['https://example.test/art/test.svg']);

  const fallback = createSpriteAtlasRuntime(manifest(), { fallback: true });
  const degraded = await loadSpriteAtlas('https://example.test/missing.json', {
    fetchImpl: async () => ({ ok: false, status: 404 }),
    fallbackRuntime: fallback,
  });
  assert.equal(degraded.degraded, true);
  assert.match(degraded.loadError.message, /404/);
});
