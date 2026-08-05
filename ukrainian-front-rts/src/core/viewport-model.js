const DEFAULT_LIMITS = Object.freeze({
  minimumWidth: 960,
  minimumHeight: 600,
  compactWidth: 1280,
  compactHeight: 720,
  minimumPixelRatio: 0.75,
  maximumPixelRatio: 2,
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positiveInteger(value, fallback = 1) {
  return Math.max(1, Math.round(finiteNumber(value, fallback)));
}

function normalizeLimits(limits = {}) {
  const minimumPixelRatio = Math.max(
    0.1,
    finiteNumber(limits.minimumPixelRatio, DEFAULT_LIMITS.minimumPixelRatio),
  );
  return Object.freeze({
    minimumWidth: positiveInteger(limits.minimumWidth, DEFAULT_LIMITS.minimumWidth),
    minimumHeight: positiveInteger(limits.minimumHeight, DEFAULT_LIMITS.minimumHeight),
    compactWidth: positiveInteger(limits.compactWidth, DEFAULT_LIMITS.compactWidth),
    compactHeight: positiveInteger(limits.compactHeight, DEFAULT_LIMITS.compactHeight),
    minimumPixelRatio,
    maximumPixelRatio: Math.max(
      minimumPixelRatio,
      finiteNumber(limits.maximumPixelRatio, DEFAULT_LIMITS.maximumPixelRatio),
    ),
  });
}

export function createViewportMetrics({
  width,
  height,
  pixelRatio = 1,
  fullscreen = false,
  limits,
} = {}) {
  const resolvedLimits = normalizeLimits(limits);
  const cssWidth = positiveInteger(width);
  const cssHeight = positiveInteger(height);
  const resolvedPixelRatio = clamp(
    finiteNumber(pixelRatio, 1),
    resolvedLimits.minimumPixelRatio,
    resolvedLimits.maximumPixelRatio,
  );
  const belowMinimum =
    cssWidth < resolvedLimits.minimumWidth || cssHeight < resolvedLimits.minimumHeight;
  const compact =
    belowMinimum ||
    cssWidth < resolvedLimits.compactWidth ||
    cssHeight < resolvedLimits.compactHeight;

  return Object.freeze({
    cssWidth,
    cssHeight,
    pixelRatio: resolvedPixelRatio,
    backingWidth: positiveInteger(cssWidth * resolvedPixelRatio),
    backingHeight: positiveInteger(cssHeight * resolvedPixelRatio),
    fullscreen: Boolean(fullscreen),
    belowMinimum,
    layoutMode: belowMinimum ? 'minimum' : compact ? 'compact' : 'standard',
    limits: resolvedLimits,
  });
}

export function viewportWorldCenter(camera, metrics) {
  const zoom = Math.max(0.0001, finiteNumber(camera?.z, 1));
  return Object.freeze({
    x: (metrics.cssWidth / 2 - finiteNumber(camera?.x, 0)) / zoom,
    y: (metrics.cssHeight / 2 - finiteNumber(camera?.y, 0)) / zoom,
  });
}

export function cameraPositionForViewportCenter(camera, worldCenter, metrics) {
  const zoom = Math.max(0.0001, finiteNumber(camera?.z, 1));
  return Object.freeze({
    x: metrics.cssWidth / 2 - finiteNumber(worldCenter?.x, 0) * zoom,
    y: metrics.cssHeight / 2 - finiteNumber(worldCenter?.y, 0) * zoom,
  });
}

export function readViewportMetrics(viewportTarget, fullscreenTarget = viewportTarget?.['document']) {
  return createViewportMetrics({
    width: viewportTarget?.innerWidth,
    height: viewportTarget?.innerHeight,
    pixelRatio: viewportTarget?.devicePixelRatio,
    fullscreen: Boolean(fullscreenTarget?.fullscreenElement),
  });
}

export const VIEWPORT_LIMITS = DEFAULT_LIMITS;
