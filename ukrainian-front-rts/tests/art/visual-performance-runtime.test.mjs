import test from 'node:test';
import assert from 'node:assert/strict';

import { createSpriteAtlasRuntime } from '../../src/render/sprite-atlas-runtime.js';
import { createAtlasRenderPlan, estimateAtlasMemory } from '../../src/render/visual-performance-gate.js';
import { createVisualPerformanceProbe, executeAtlasRenderPlan } from '../../src/render/visual-performance-runtime.js';

function manifest() {
  return {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: 'units',
    sampling: 'nearest',
    image: { src: 'units.png', width: 32, height: 16, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    frames: {
      idle: { rect: { x: 0, y: 0, w: 16, h: 16 } },
      move: { rect: { x: 16, y: 0, w: 16, h: 16 } },
    },
    animations: {},
    fallback: { frame: 'idle' },
  };
}

function context() {
  const calls = [];
  return {
    calls,
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    scale(x, y) { calls.push(['scale', x, y]); },
    drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); },
  };
}

test('executes culled atlas plans with nearest-neighbor sampling and stable batches', () => {
  const ctx = context();
  const runtime = createSpriteAtlasRuntime(manifest(), {});
  const plan = createAtlasRenderPlan([
    { id: 'b', atlasId: 'units', frameId: 'move', x: 20, y: 20, width: 16, height: 16 },
    { id: 'a', atlasId: 'units', frameId: 'idle', x: 10, y: 10, width: 16, height: 16 },
    { id: 'offscreen', atlasId: 'units', frameId: 'idle', x: 200, y: 200, width: 16, height: 16 },
  ], { x: 0, y: 0, width: 100, height: 100 });

  const report = executeAtlasRenderPlan({ context: ctx, plan, runtimes: { units: runtime } });
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.equal(report.drawCalls, 2);
  assert.equal(report.atlasBatches, 1);
  assert.equal(report.culledSprites, 1);
  assert.deepEqual(report.usedAtlases, ['units']);
  assert.equal(ctx.calls.filter(([name]) => name === 'drawImage').length, 2);
});

test('release execution fails closed for missing or degraded atlases', () => {
  const plan = createAtlasRenderPlan([
    { id: 'a', atlasId: 'units', frameId: 'idle', x: 10, y: 10, width: 16, height: 16 },
  ], { x: 0, y: 0, width: 100, height: 100 });
  assert.throws(() => executeAtlasRenderPlan({ context: context(), plan, runtimes: {} }), /Missing sprite-atlas runtime/);
  assert.throws(() => executeAtlasRenderPlan({
    context: context(),
    plan,
    runtimes: { units: { degraded: true, drawFrame() {} } },
  }), /degraded sprite atlas/);
});

test('frame probe captures actual elapsed time and enforces the configured budget', () => {
  const times = [100, 112, 200, 214];
  const probe = createVisualPerformanceProbe({ now: () => times.shift() });
  const plan = createAtlasRenderPlan([
    { id: 'a', atlasId: 'units', frameId: 'idle', x: 10, y: 10, width: 16, height: 16 },
  ], { x: 0, y: 0, width: 100, height: 100 });
  const memory = estimateAtlasMemory([manifest()]);
  const ctx = context();
  ctx.imageSmoothingEnabled = false;

  const first = probe.beginFrame();
  probe.endFrame({ sceneId: 'unit:ukraine/tank', startedAt: first, renderPlan: plan, memory, context: ctx });
  const second = probe.beginFrame();
  probe.endFrame({ sceneId: 'unit:russia/tank', startedAt: second, renderPlan: plan, memory, context: ctx });

  assert.deepEqual(probe.samples().map((sample) => sample.frameMs), [12, 14]);
  assert.equal(probe.assertBudget().passed, true);
  probe.reset();
  assert.deepEqual(probe.samples(), []);
});
