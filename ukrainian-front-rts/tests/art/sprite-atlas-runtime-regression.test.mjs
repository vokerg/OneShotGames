import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSpriteAtlasRuntime,
  loadSpriteAtlas,
} from '../../src/render/sprite-atlas-runtime.js';

function manifest() {
  return {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: 'test.runtime-regression',
    image: { src: 'atlas.svg', width: 16, height: 16, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    frames: {
      idle: {
        rect: { x: 0, y: 0, w: 16, h: 16 },
        anchor: { x: 8, y: 16 },
        attachments: { center: { x: 8, y: 8 } },
      },
    },
    animations: {
      idle: { loop: 'loop', frames: ['idle'], defaultDurationMs: 100 },
    },
    fallback: { frame: 'idle' },
  };
}

function context() {
  return {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    scale() {},
    drawImage() {},
  };
}

test('runtime draw hot paths do not re-normalize the full manifest', () => {
  const runtime = createSpriteAtlasRuntime(manifest(), { id: 'bitmap' });
  const originalKeys = Object.keys;
  let keyScans = 0;
  Object.keys = (...args) => {
    keyScans += 1;
    return originalKeys(...args);
  };
  try {
    runtime.drawFrame(context(), 'idle', { x: 10, y: 20 });
    runtime.drawAnimation(context(), 'idle', { x: 10, y: 20, elapsedMs: 250 });
    assert.deepEqual(runtime.attachment('idle', 'center', { x: 10, y: 20 }), { x: 10, y: 12 });
  } finally {
    Object.keys = originalKeys;
  }
  assert.equal(keyScans, 0);
});

test('loader rejects bitmap dimensions that drift from the validated manifest', async () => {
  const imageFactory = () => ({
    naturalWidth: 32,
    naturalHeight: 16,
    set src(_value) { queueMicrotask(() => this.onload()); },
  });

  await assert.rejects(
    loadSpriteAtlas('https://example.test/atlas.json', {
      fetchImpl: async () => ({ ok: true, json: async () => manifest() }),
      imageFactory,
    }),
    /32x16 !== 16x16/,
  );
});

test('bitmap dimension drift degrades to the explicit fallback runtime when supplied', async () => {
  const fallback = createSpriteAtlasRuntime(manifest(), { id: 'fallback' });
  const degraded = await loadSpriteAtlas('https://example.test/atlas.json', {
    fetchImpl: async () => ({ ok: true, json: async () => manifest() }),
    imageFactory: () => ({
      naturalWidth: 8,
      naturalHeight: 8,
      set src(_value) { queueMicrotask(() => this.onload()); },
    }),
    fallbackRuntime: fallback,
  });

  assert.equal(degraded.degraded, true);
  assert.match(degraded.loadError.message, /8x8 !== 16x16/);
  assert.equal(degraded.image.id, 'fallback');
});
