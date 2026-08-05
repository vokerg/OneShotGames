import { validateSpriteAtlasManifest } from './sprite-atlas-manifest.js';
import { createVisualRegressionScenes, validateVisualRegressionScenes } from './visual-regression-scenes.js';

export const VISUAL_PERFORMANCE_SCHEMA = 'fields-of-resolve.visual-performance';
export const VISUAL_PERFORMANCE_VERSION = 1;

const MEBIBYTE = 1024 * 1024;
const PLAIN_OBJECT = Object.getPrototypeOf({});

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== PLAIN_OBJECT) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be a finite number >= ${minimum}`);
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index];
}

function overlaps(viewport, drawable) {
  const right = drawable.x + drawable.width;
  const bottom = drawable.y + drawable.height;
  return right > viewport.x
    && bottom > viewport.y
    && drawable.x < viewport.x + viewport.width
    && drawable.y < viewport.y + viewport.height;
}

export const DEFAULT_VISUAL_PERFORMANCE_BUDGET = freeze({
  targetFps: 60,
  p95FrameMs: 16.67,
  p99FrameMs: 25,
  maxDrawCalls: 1400,
  maxAtlasBatches: 96,
  maxVisibleSprites: 1200,
  maxTextureBytes: 128 * MEBIBYTE,
  maxDecodedAssetBytes: 256 * MEBIBYTE,
  maxProceduralFallbacks: 0,
  maxDegradedAtlases: 0,
});

export function createVisualPerformanceBudget(overrides = {}) {
  record(overrides, 'performance budget');
  const budget = { ...DEFAULT_VISUAL_PERFORMANCE_BUDGET, ...overrides };
  finite(budget.targetFps, 'targetFps', 1);
  finite(budget.p95FrameMs, 'p95FrameMs', Number.EPSILON);
  finite(budget.p99FrameMs, 'p99FrameMs', Number.EPSILON);
  if (budget.p99FrameMs < budget.p95FrameMs) {
    throw new RangeError('p99FrameMs must be greater than or equal to p95FrameMs');
  }
  integer(budget.maxDrawCalls, 'maxDrawCalls');
  integer(budget.maxAtlasBatches, 'maxAtlasBatches');
  integer(budget.maxVisibleSprites, 'maxVisibleSprites');
  integer(budget.maxTextureBytes, 'maxTextureBytes');
  integer(budget.maxDecodedAssetBytes, 'maxDecodedAssetBytes');
  integer(budget.maxProceduralFallbacks, 'maxProceduralFallbacks');
  integer(budget.maxDegradedAtlases, 'maxDegradedAtlases');
  return freeze({ schema: VISUAL_PERFORMANCE_SCHEMA, version: VISUAL_PERFORMANCE_VERSION, ...budget });
}

export function createAtlasRenderPlan(drawables = [], viewport = {}) {
  if (!Array.isArray(drawables)) throw new TypeError('drawables must be an array');
  const bounds = record(viewport, 'viewport');
  const normalizedViewport = freeze({
    x: finite(bounds.x ?? 0, 'viewport.x'),
    y: finite(bounds.y ?? 0, 'viewport.y'),
    width: finite(bounds.width, 'viewport.width', Number.EPSILON),
    height: finite(bounds.height, 'viewport.height', Number.EPSILON),
  });

  const normalized = drawables.map((value, index) => {
    const item = record(value, `drawables[${index}]`);
    return freeze({
      id: text(item.id ?? `drawable-${index}`, `drawables[${index}].id`),
      atlasId: text(item.atlasId, `drawables[${index}].atlasId`),
      frameId: text(item.frameId, `drawables[${index}].frameId`),
      layer: integer(item.layer ?? 0, `drawables[${index}].layer`),
      x: finite(item.x, `drawables[${index}].x`),
      y: finite(item.y, `drawables[${index}].y`),
      width: finite(item.width, `drawables[${index}].width`, Number.EPSILON),
      height: finite(item.height, `drawables[${index}].height`, Number.EPSILON),
      proceduralFallback: Boolean(item.proceduralFallback),
    });
  });

  const visible = normalized
    .filter((drawable) => overlaps(normalizedViewport, drawable))
    .sort((left, right) => left.layer - right.layer
      || left.atlasId.localeCompare(right.atlasId)
      || left.id.localeCompare(right.id));

  const batches = [];
  for (const drawable of visible) {
    const current = batches.at(-1);
    if (!current || current.layer !== drawable.layer || current.atlasId !== drawable.atlasId) {
      batches.push({ layer: drawable.layer, atlasId: drawable.atlasId, drawables: [drawable] });
    } else {
      current.drawables.push(drawable);
    }
  }

  return freeze({
    schema: VISUAL_PERFORMANCE_SCHEMA,
    version: VISUAL_PERFORMANCE_VERSION,
    viewport: normalizedViewport,
    submittedSprites: normalized.length,
    visibleSprites: visible.length,
    culledSprites: normalized.length - visible.length,
    drawCalls: visible.length,
    atlasBatches: batches.length,
    batches: batches.map((batch) => freeze({ ...batch, drawables: freeze(batch.drawables) })),
    proceduralFallbacks: visible.filter((drawable) => drawable.proceduralFallback).length,
  });
}

export function estimateAtlasMemory(manifests = []) {
  if (!Array.isArray(manifests)) throw new TypeError('manifests must be an array');
  const images = new Map();
  let frameCount = 0;
  for (const [index, value] of manifests.entries()) {
    const manifest = validateSpriteAtlasManifest(value, { source: `manifests[${index}]` });
    const imageKey = `${manifest.image.src}:${manifest.image.width}x${manifest.image.height}`;
    images.set(imageKey, manifest.image.width * manifest.image.height * 4);
    frameCount += Object.keys(manifest.frames).length;
  }
  const textureBytes = [...images.values()].reduce((sum, bytes) => sum + bytes, 0);
  const metadataBytes = frameCount * 192;
  return freeze({
    atlasCount: manifests.length,
    uniqueTextureCount: images.size,
    frameCount,
    textureBytes,
    metadataBytes,
    decodedAssetBytes: textureBytes + metadataBytes,
  });
}

export function createVisualFrameSample({
  sceneId,
  frameMs,
  renderPlan,
  memory,
  degradedAtlases = 0,
  smoothingEnabled = false,
} = {}) {
  record(renderPlan, 'renderPlan');
  record(memory, 'memory');
  return freeze({
    sceneId: text(sceneId, 'sceneId'),
    frameMs: finite(frameMs, 'frameMs'),
    drawCalls: integer(renderPlan.drawCalls, 'renderPlan.drawCalls'),
    atlasBatches: integer(renderPlan.atlasBatches, 'renderPlan.atlasBatches'),
    visibleSprites: integer(renderPlan.visibleSprites, 'renderPlan.visibleSprites'),
    culledSprites: integer(renderPlan.culledSprites, 'renderPlan.culledSprites'),
    proceduralFallbacks: integer(renderPlan.proceduralFallbacks, 'renderPlan.proceduralFallbacks'),
    textureBytes: integer(memory.textureBytes, 'memory.textureBytes'),
    decodedAssetBytes: integer(memory.decodedAssetBytes, 'memory.decodedAssetBytes'),
    degradedAtlases: integer(degradedAtlases, 'degradedAtlases'),
    smoothingEnabled: Boolean(smoothingEnabled),
  });
}

export function summarizeVisualPerformance(samples = []) {
  if (!Array.isArray(samples) || !samples.length) throw new TypeError('samples must be a non-empty array');
  const normalized = samples.map((sample, index) => {
    record(sample, `samples[${index}]`);
    return createVisualFrameSample(sample);
  });
  const frameTimes = normalized.map((sample) => sample.frameMs).sort((a, b) => a - b);
  const maximum = (field) => Math.max(...normalized.map((sample) => sample[field]));
  return freeze({
    schema: VISUAL_PERFORMANCE_SCHEMA,
    version: VISUAL_PERFORMANCE_VERSION,
    sampleCount: normalized.length,
    p95FrameMs: percentile(frameTimes, 0.95),
    p99FrameMs: percentile(frameTimes, 0.99),
    maxDrawCalls: maximum('drawCalls'),
    maxAtlasBatches: maximum('atlasBatches'),
    maxVisibleSprites: maximum('visibleSprites'),
    maxTextureBytes: maximum('textureBytes'),
    maxDecodedAssetBytes: maximum('decodedAssetBytes'),
    maxProceduralFallbacks: maximum('proceduralFallbacks'),
    maxDegradedAtlases: maximum('degradedAtlases'),
    smoothingViolations: normalized.filter((sample) => sample.smoothingEnabled).map((sample) => sample.sceneId).sort(),
  });
}

export function evaluateVisualPerformance(samples, budget = createVisualPerformanceBudget()) {
  const limits = budget.schema === VISUAL_PERFORMANCE_SCHEMA ? budget : createVisualPerformanceBudget(budget);
  const summary = summarizeVisualPerformance(samples);
  const failures = [];
  const checks = [
    ['p95FrameMs', summary.p95FrameMs, limits.p95FrameMs],
    ['p99FrameMs', summary.p99FrameMs, limits.p99FrameMs],
    ['maxDrawCalls', summary.maxDrawCalls, limits.maxDrawCalls],
    ['maxAtlasBatches', summary.maxAtlasBatches, limits.maxAtlasBatches],
    ['maxVisibleSprites', summary.maxVisibleSprites, limits.maxVisibleSprites],
    ['maxTextureBytes', summary.maxTextureBytes, limits.maxTextureBytes],
    ['maxDecodedAssetBytes', summary.maxDecodedAssetBytes, limits.maxDecodedAssetBytes],
    ['maxProceduralFallbacks', summary.maxProceduralFallbacks, limits.maxProceduralFallbacks],
    ['maxDegradedAtlases', summary.maxDegradedAtlases, limits.maxDegradedAtlases],
  ];
  for (const [metric, actual, maximum] of checks) {
    if (actual > maximum) failures.push(freeze({ metric, actual, maximum }));
  }
  if (summary.smoothingViolations.length) {
    failures.push(freeze({ metric: 'imageSmoothingEnabled', actual: summary.smoothingViolations, maximum: false }));
  }
  return freeze({ passed: failures.length === 0, budget: limits, summary, failures });
}

export function assertVisualPerformance(samples, budget) {
  const report = evaluateVisualPerformance(samples, budget);
  if (!report.passed) {
    const details = report.failures.map((failure) => `${failure.metric}=${JSON.stringify(failure.actual)} (max ${JSON.stringify(failure.maximum)})`).join('; ');
    throw new Error(`Visual performance budget failed: ${details}`);
  }
  return report;
}

export function validateReleaseSceneCoverage(sceneResults, catalog = createVisualRegressionScenes()) {
  validateVisualRegressionScenes(catalog);
  if (!Array.isArray(sceneResults)) throw new TypeError('sceneResults must be an array');
  const byId = new Map(sceneResults.map((result, index) => {
    record(result, `sceneResults[${index}]`);
    return [text(result.sceneId, `sceneResults[${index}].sceneId`), result];
  }));
  const missing = catalog.scenes.map((scene) => scene.id).filter((id) => !byId.has(id));
  const failed = catalog.scenes
    .map((scene) => byId.get(scene.id))
    .filter(Boolean)
    .filter((result) => result.proceduralFallbacks > 0 || result.degradedAtlases > 0 || result.smoothingEnabled)
    .map((result) => result.sceneId)
    .sort();
  if (missing.length || failed.length) {
    throw new Error(`Release visual coverage failed; missing=${missing.join(',') || 'none'}; invalid=${failed.join(',') || 'none'}`);
  }
  return freeze({ sceneCount: catalog.scenes.length, missing: freeze([]), failed: freeze([]) });
}
