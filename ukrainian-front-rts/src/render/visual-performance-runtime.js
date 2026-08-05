import { configureNearestNeighborContext } from './sprite-atlas-runtime.js';
import {
  VISUAL_PERFORMANCE_SCHEMA,
  assertVisualPerformance,
  createVisualFrameSample,
  createVisualPerformanceBudget,
} from './visual-performance-gate.js';

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be a finite number >= ${minimum}`);
  return value;
}

export function executeAtlasRenderPlan({ context, plan, runtimes } = {}) {
  record(plan, 'plan');
  record(runtimes, 'runtimes');
  if (plan.schema !== VISUAL_PERFORMANCE_SCHEMA || !Array.isArray(plan.batches)) {
    throw new TypeError('plan must be a visual-performance atlas plan');
  }
  const target = configureNearestNeighborContext(context);
  let drawCalls = 0;
  const usedAtlases = new Set();

  for (const batch of plan.batches) {
    const runtime = runtimes[batch.atlasId];
    if (!runtime || typeof runtime.drawFrame !== 'function') {
      throw new Error(`Missing sprite-atlas runtime for ${batch.atlasId}`);
    }
    if (runtime.degraded) throw new Error(`Release render cannot use degraded sprite atlas ${batch.atlasId}`);
    usedAtlases.add(batch.atlasId);
    for (const drawable of batch.drawables) {
      runtime.drawFrame(target, drawable.frameId, {
        x: drawable.x,
        y: drawable.y,
        scale: 1,
      });
      drawCalls += 1;
    }
  }

  if (target.imageSmoothingEnabled !== false) throw new Error('Nearest-neighbor rendering must keep image smoothing disabled');
  return Object.freeze({
    drawCalls,
    atlasBatches: plan.batches.length,
    usedAtlases: Object.freeze([...usedAtlases].sort()),
    visibleSprites: plan.visibleSprites,
    culledSprites: plan.culledSprites,
    proceduralFallbacks: plan.proceduralFallbacks,
    smoothingEnabled: target.imageSmoothingEnabled,
  });
}

export function createVisualPerformanceProbe({ budget = createVisualPerformanceBudget(), now = () => performance.now() } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const samples = [];

  return Object.freeze({
    beginFrame() {
      return finite(now(), 'frame start');
    },
    endFrame({ sceneId, startedAt, renderPlan, memory, degradedAtlases = 0, context } = {}) {
      const endedAt = finite(now(), 'frame end');
      const sample = createVisualFrameSample({
        sceneId,
        frameMs: Math.max(0, endedAt - finite(startedAt, 'startedAt')),
        renderPlan,
        memory,
        degradedAtlases,
        smoothingEnabled: context?.imageSmoothingEnabled === true,
      });
      samples.push(sample);
      return sample;
    },
    samples() {
      return Object.freeze([...samples]);
    },
    assertBudget() {
      return assertVisualPerformance(samples, budget);
    },
    reset() {
      samples.length = 0;
    },
  });
}
