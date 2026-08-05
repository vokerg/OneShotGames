import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertVisualPerformance,
  createAtlasRenderPlan,
  createVisualFrameSample,
  createVisualPerformanceBudget,
  estimateAtlasMemory,
  evaluateVisualPerformance,
  validateReleaseSceneCoverage,
} from '../../src/render/visual-performance-gate.js';
import { createVisualRegressionScenes } from '../../src/render/visual-regression-scenes.js';

function manifest(id, src = `${id}.png`) {
  return {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id,
    sampling: 'nearest',
    image: { src, width: 64, height: 32, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    frames: {
      idle: { rect: { x: 0, y: 0, w: 16, h: 16 } },
      move: { rect: { x: 16, y: 0, w: 16, h: 16 } },
    },
    animations: {},
    fallback: { frame: 'idle' },
  };
}

function sample(overrides = {}) {
  const renderPlan = createAtlasRenderPlan([
    { id: 'u-2', atlasId: 'units', frameId: 'idle', layer: 2, x: 10, y: 10, width: 16, height: 16 },
    { id: 'u-1', atlasId: 'units', frameId: 'move', layer: 2, x: 20, y: 10, width: 16, height: 16 },
    { id: 'offscreen', atlasId: 'units', frameId: 'idle', layer: 2, x: 500, y: 500, width: 16, height: 16 },
    { id: 'fx', atlasId: 'effects', frameId: 'smoke', layer: 3, x: 30, y: 30, width: 16, height: 16 },
  ], { x: 0, y: 0, width: 100, height: 100 });
  const memory = estimateAtlasMemory([manifest('units'), manifest('effects')]);
  return createVisualFrameSample({ sceneId: 'unit:ukraine/tank', frameMs: 12, renderPlan, memory, ...overrides });
}

test('culls offscreen sprites and groups stable atlas batches', () => {
  const plan = createAtlasRenderPlan([
    { id: 'b', atlasId: 'units', frameId: 'idle', layer: 2, x: 20, y: 20, width: 8, height: 8 },
    { id: 'a', atlasId: 'units', frameId: 'idle', layer: 2, x: 10, y: 10, width: 8, height: 8 },
    { id: 'fx', atlasId: 'effects', frameId: 'smoke', layer: 3, x: 15, y: 15, width: 8, height: 8 },
    { id: 'hidden', atlasId: 'units', frameId: 'idle', layer: 2, x: 200, y: 200, width: 8, height: 8 },
  ], { x: 0, y: 0, width: 100, height: 100 });

  assert.equal(plan.submittedSprites, 4);
  assert.equal(plan.visibleSprites, 3);
  assert.equal(plan.culledSprites, 1);
  assert.equal(plan.drawCalls, 3);
  assert.equal(plan.atlasBatches, 2);
  assert.deepEqual(plan.batches.map((batch) => [batch.atlasId, batch.drawables.map((entry) => entry.id)]), [
    ['units', ['a', 'b']],
    ['effects', ['fx']],
  ]);
  assert.equal(JSON.stringify(plan), JSON.stringify(createAtlasRenderPlan([
    { id: 'b', atlasId: 'units', frameId: 'idle', layer: 2, x: 20, y: 20, width: 8, height: 8 },
    { id: 'a', atlasId: 'units', frameId: 'idle', layer: 2, x: 10, y: 10, width: 8, height: 8 },
    { id: 'fx', atlasId: 'effects', frameId: 'smoke', layer: 3, x: 15, y: 15, width: 8, height: 8 },
    { id: 'hidden', atlasId: 'units', frameId: 'idle', layer: 2, x: 200, y: 200, width: 8, height: 8 },
  ], { x: 0, y: 0, width: 100, height: 100 })));
});

test('deduplicates texture memory while accounting for atlas metadata', () => {
  const memory = estimateAtlasMemory([
    manifest('units-a', 'shared.png'),
    manifest('units-b', 'shared.png'),
    manifest('effects', 'effects.png'),
  ]);
  assert.equal(memory.atlasCount, 3);
  assert.equal(memory.uniqueTextureCount, 2);
  assert.equal(memory.frameCount, 6);
  assert.equal(memory.textureBytes, 64 * 32 * 4 * 2);
  assert.equal(memory.metadataBytes, 6 * 192);
});

test('passes healthy frame telemetry and reports exact budget failures', () => {
  const good = Array.from({ length: 40 }, (_, index) => sample({ frameMs: 10 + index / 20 }));
  assert.equal(assertVisualPerformance(good).passed, true);

  const bad = [sample({ frameMs: 30, smoothingEnabled: true, degradedAtlases: 1 })];
  const report = evaluateVisualPerformance(bad, createVisualPerformanceBudget({ p95FrameMs: 16, p99FrameMs: 20 }));
  assert.equal(report.passed, false);
  assert.deepEqual(report.failures.map((failure) => failure.metric), [
    'p95FrameMs',
    'p99FrameMs',
    'maxDegradedAtlases',
    'imageSmoothingEnabled',
  ]);
  assert.throws(() => assertVisualPerformance(bad), /p95FrameMs.*imageSmoothingEnabled/);
});

test('release coverage rejects missing, degraded, smoothed, or procedural-fallback scenes', () => {
  const catalog = createVisualRegressionScenes();
  const healthy = catalog.scenes.map((scene) => ({
    sceneId: scene.id,
    proceduralFallbacks: 0,
    degradedAtlases: 0,
    smoothingEnabled: false,
  }));
  assert.equal(validateReleaseSceneCoverage(healthy).sceneCount, catalog.scenes.length);
  assert.throws(() => validateReleaseSceneCoverage(healthy.slice(1)), /missing=/);
  assert.throws(() => validateReleaseSceneCoverage([
    { ...healthy[0], proceduralFallbacks: 1 },
    ...healthy.slice(1),
  ]), /invalid=/);
});

test('procedural fallback is counted only when visible', () => {
  const plan = createAtlasRenderPlan([
    { id: 'visible', atlasId: 'units', frameId: 'fallback', x: 1, y: 1, width: 8, height: 8, proceduralFallback: true },
    { id: 'culled', atlasId: 'units', frameId: 'fallback', x: 100, y: 100, width: 8, height: 8, proceduralFallback: true },
  ], { x: 0, y: 0, width: 20, height: 20 });
  assert.equal(plan.proceduralFallbacks, 1);
});
