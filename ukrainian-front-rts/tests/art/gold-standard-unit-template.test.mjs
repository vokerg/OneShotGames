import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSpriteAtlasRuntime } from '../../src/render/sprite-atlas-runtime.js';
import {
  TEMPLATE_UNIT_DIRECTIONS,
  TEMPLATE_UNIT_STATES,
  loadTemplateUnitAtlas,
  templateUnitDirectionFromAngle,
} from '../../src/render/template-unit-atlas.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

test('gold-standard source catalog covers every required state and authored direction', async () => {
  const catalog = await json('art-src/manifest.json');
  const asset = catalog.assets.find((entry) => entry.id === 'template.pathfinder-car');
  assert.ok(asset);
  assert.equal(asset.kind, 'units');
  assert.equal(asset.faction, 'shared');
  assert.equal(asset.provenance.generatedTools.used, true);
  assert.equal(asset.provenance.approval, 'pending');
  assert.equal(asset.frames.length, 68);

  const expected = { idle: 2, move: 32, attack: 24, hit: 1, damaged: 2, death: 6, wreck: 1 };
  for (const [state, count] of Object.entries(expected)) {
    const frames = asset.frames.filter((frame) => frame.animation === state);
    assert.equal(frames.length, count, state);
    assert.ok(frames.every((frame) => frame.anchor.x === 24 && frame.anchor.y === 44));
    assert.ok(frames.every((frame) => frame.requiredPadding === 4));
  }

  for (const state of ['move', 'attack']) {
    assert.deepEqual(
      [...new Set(asset.frames.filter((frame) => frame.animation === state).map((frame) => frame.direction))],
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  }
});

test('generated atlas freezes state timing, directional sequences, anchors, and fallback', async () => {
  const atlas = await json('assets/atlases/template-unit.atlas.json');
  assert.deepEqual(atlas.directions.order, TEMPLATE_UNIT_DIRECTIONS);
  assert.deepEqual(Object.keys(atlas.animations).sort(), [...TEMPLATE_UNIT_STATES].sort());
  assert.equal(atlas.fallback.frame, 'missing');
  assert.equal(atlas.image.src, 'template-unit.svg');

  for (const direction of TEMPLATE_UNIT_DIRECTIONS) {
    assert.equal(atlas.animations.move.directions[direction].length, 4);
    assert.equal(atlas.animations.attack.directions[direction].length, 3);
  }
  assert.deepEqual(atlas.animations.attack.directions.n.map((entry) => entry.durationMs), [80, 60, 120]);
  assert.equal(atlas.animations.death.frames.length, 6);
  assert.equal(atlas.animations.wreck.loop, 'hold');

  const east = atlas.frames['template.pathfinder-car.attack.e.f00'];
  assert.deepEqual(east.anchor, { x: 24, y: 44 });
  assert.deepEqual(east.attachments.muzzle, { x: 41, y: 24 });
  assert.deepEqual(east.masks.selection, { x: 6, y: 8, w: 36, h: 34 });
});

test('template runtime maps world facing, resolves directional animation, and degrades explicitly', async () => {
  assert.equal(templateUnitDirectionFromAngle(-Math.PI / 2), 'n');
  assert.equal(templateUnitDirectionFromAngle(0), 'e');
  assert.equal(templateUnitDirectionFromAngle(Math.PI / 2), 's');
  assert.equal(templateUnitDirectionFromAngle(Math.PI), 'w');

  const atlas = await json('assets/atlases/template-unit.atlas.json');
  const image = { naturalWidth: atlas.image.width, naturalHeight: atlas.image.height };
  const runtime = createSpriteAtlasRuntime(atlas, image);
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

  const resolved = runtime.drawAnimation(context, 'move', {
    x: 100,
    y: 120,
    direction: 'e',
    elapsedMs: 95,
  });
  assert.equal(resolved.frameId, 'template.pathfinder-car.move.e.f01');
  assert.equal(calls.length, 1);
  assert.deepEqual(runtime.attachment(resolved.frameId, 'muzzle', { x: 100, y: 120 }), { x: 117, y: 100 });
  assert.equal(runtime.drawAnimation(context, 'unknown', { x: 0, y: 0 }).frameId, 'missing');

  const fallback = createSpriteAtlasRuntime(atlas, image);
  const degraded = await loadTemplateUnitAtlas({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    fallbackRuntime: fallback,
  });
  assert.equal(degraded.degraded, true);
  assert.match(degraded.loadError.message, /503/);
});
