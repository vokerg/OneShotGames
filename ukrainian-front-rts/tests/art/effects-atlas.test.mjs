import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EFFECT_ATLAS_FAMILIES,
  createEffectPresentationDescriptor,
  createEffectsAtlasManifestFromSource,
  effectAnimationDuration,
  effectFamilyForRecord,
  effectProgress,
  validateEffectsAtlasManifest,
} from '../../src/render/effects-atlas-contract.js';
import {
  installEffectsAtlasRenderer,
} from '../../src/render/effects-atlas-renderer.js';
import {
  assertCompleteEffectArt,
  buildEffectSourceFrames,
} from '../../scripts/lib/effects-art-source.mjs';
import { buildEffectsArtifacts } from '../../scripts/build-effects-art.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

test('effects atlas covers every required family with centered, tagged sequences', async () => {
  const manifest = validateEffectsAtlasManifest(
    createEffectsAtlasManifestFromSource(await json('assets/atlases/effects.build.json')),
    { source: 'effects.build.json' },
  );

  assert.equal(manifest.id, 'fields-of-resolve.effects');
  assert.deepEqual(Object.keys(manifest.animations), [...EFFECT_ATLAS_FAMILIES].sort());
  assert.equal(Object.keys(manifest.frames).length, 48);
  assert.equal(effectAnimationDuration(manifest, 'explosion'), 390);

  for (const family of EFFECT_ATLAS_FAMILIES) {
    const animation = manifest.animations[family];
    assert.ok(animation.frames.length >= 2, `${family} requires visible frame progression`);
    for (const entry of animation.frames) {
      const frame = manifest.frames[entry.frame];
      assert.deepEqual(frame.anchor, { x: 24, y: 24 });
      assert.ok(frame.tags.includes('effects'));
      assert.ok(frame.tags.includes(family));
    }
  }
});

test('source catalog and deterministic source generator cover the complete atlas handoff', async () => {
  const summary = assertCompleteEffectArt();
  assert.deepEqual(summary, { families: 15, frames: 48 });

  const artifacts = buildEffectsArtifacts();
  const asset = artifacts.catalog.assets.find((entry) => entry.id === 'shared.effects-core');
  assert.ok(asset);
  assert.equal(asset.kind, 'effects');
  assert.equal(asset.provenance.license, 'CC0-1.0');
  assert.equal(asset.provenance.generatedTools.used, true);
  assert.equal(asset.frames.length, 48);
  assert.equal(buildEffectSourceFrames().every((frame) => frame.content.includes('<svg')), true);

  assert.deepEqual(
    JSON.parse(await readFile(resolve(ROOT, 'art-src/effects/manifest.json'), 'utf8')),
    artifacts.catalog,
  );
  assert.deepEqual(
    JSON.parse(await readFile(resolve(ROOT, 'assets/atlases/effects.build.json'), 'utf8')),
    artifacts.atlasSource,
  );
  assert.equal(
    await readFile(resolve(ROOT, 'assets/atlases/effects.svg'), 'utf8'),
    artifacts.files['assets/atlases/effects.svg'],
  );

  assert.deepEqual(
    createEffectsAtlasManifestFromSource(artifacts.atlasSource),
    artifacts.manifest,
  );

  const runtimeIds = new Set(asset.frames.map((frame) => frame.runtimeId));
  assert.deepEqual(runtimeIds, new Set(Object.keys(artifacts.manifest.frames)));
});

test('effect presentation adapter maps public simulation records without mutating them', () => {
  const shell = Object.freeze({ kind: 'shell', x: 1, y: 2, aimX: 8, aimY: 2, life: 0.5, max: 1 });
  const descriptor = createEffectPresentationDescriptor(shell, { channel: 'projectile' });
  assert.equal(descriptor.family, 'shell');
  assert.equal(descriptor.progress, 0.5);
  assert.ok(Number.isFinite(descriptor.rotation));
  assert.deepEqual(shell, { kind: 'shell', x: 1, y: 2, aimX: 8, aimY: 2, life: 0.5, max: 1 });

  assert.equal(effectFamilyForRecord({ kind: 'blast', radius: 80 }), 'explosion');
  assert.equal(effectFamilyForRecord({ kind: 'blast', radius: 24 }), 'impact');
  assert.equal(effectFamilyForRecord({ kind: 'recon' }), 'capture');
  assert.equal(effectFamilyForRecord({ kind: 'construction' }), 'build');
  assert.equal(effectProgress({ life: -1, max: 2 }), 1);
  assert.equal(effectProgress({ elapsedMs: -50, durationMs: 100 }), 0);

  const unknown = createEffectPresentationDescriptor({ kind: 'unregistered-effect' });
  assert.equal(unknown.family, 'impact');
  assert.equal(unknown.fallback, true);
});

function fakeContext() {
  return {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage() {},
  };
}

test('renderer integration replaces procedural effects only after atlas load and restores cleanly', async () => {
  const manifest = createEffectsAtlasManifestFromSource(await json('assets/atlases/effects.build.json'));
  const calls = [];
  let fallbackDraws = 0;
  const unitFlashes = [];
  const runtime = {
    manifest,
    degraded: false,
    drawAnimation(_context, family, options) {
      calls.push({ family, options });
      return { family };
    },
  };
  const game = {
    camera: { z: 1 },
    projectiles: [
      { kind: 'bullet', x: 10, y: 20, aimX: 20, aimY: 20, life: 0.5, max: 1 },
      { kind: 'shell', x: 30, y: 40, aimX: 30, aimY: 50, life: 0.25, max: 1 },
    ],
    effects: [
      { kind: 'blast', x: 50, y: 60, radius: 80, life: 0.2, max: 0.4 },
      { kind: 'smoke', x: 70, y: 80, radius: 40, life: 2, max: 4 },
    ],
  };
  const renderer = {
    x: fakeContext(),
    sp(x, y) {
      if (typeof x === 'object') return { x: x.x, y: x.y };
      return { x, y };
    },
    effects() {
      fallbackDraws += 1;
      return 'procedural';
    },
    unit(unit) {
      unitFlashes.push(unit.flash);
      return unit.id;
    },
  };

  const dispose = installEffectsAtlasRenderer({
    game,
    renderer,
    loadAtlas: async () => runtime,
  });
  await dispose.ready;

  assert.equal(renderer.effects(), 4);
  assert.equal(fallbackDraws, 0);
  assert.deepEqual(calls.slice(0, 4).map((entry) => entry.family), [
    'tracer',
    'shell',
    'explosion',
    'smoke',
  ]);

  assert.equal(renderer.unit({ id: 7, x: 12, y: 14, angle: 0, flash: 0.08 }), 7);
  assert.deepEqual(unitFlashes, [0]);
  assert.equal(calls.at(-1).family, 'muzzle-flash');
  assert.equal(renderer.effectsAtlasState().ready, true);

  dispose();
  assert.equal(renderer.effects(), 'procedural');
  assert.equal(fallbackDraws, 1);
});

test('load failure remains explicit and preserves the procedural renderer fallback', async () => {
  let fallbackDraws = 0;
  const game = { camera: { z: 1 }, projectiles: [], effects: [] };
  const renderer = {
    x: fakeContext(),
    sp: (x, y) => ({ x, y }),
    effects() {
      fallbackDraws += 1;
      return 'fallback';
    },
    unit(unit) {
      return unit.flash;
    },
  };

  const dispose = installEffectsAtlasRenderer({
    game,
    renderer,
    loadAtlas: async () => {
      throw new Error('missing effect atlas');
    },
  });
  await dispose.ready;

  assert.equal(renderer.effectsAtlasState().degraded, true);
  assert.match(renderer.effectsAtlasState().error.message, /missing effect atlas/);
  assert.equal(renderer.effects(), 'fallback');
  assert.equal(fallbackDraws, 1);
  assert.equal(renderer.unit({ flash: 1 }), 1);
  dispose();
});
