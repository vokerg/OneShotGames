import {
  cameraPositionForViewportCenter,
  readViewportMetrics,
  viewportWorldCenter,
} from '../core/viewport-model.js';

function setCanvasSize(canvas, context, metrics) {
  canvas.width = metrics.backingWidth;
  canvas.height = metrics.backingHeight;
  canvas.style.width = `${metrics.cssWidth}px`;
  canvas.style.height = `${metrics.cssHeight}px`;
  canvas.dataset.viewportPixelRatio = String(metrics.pixelRatio);
  context.setTransform(metrics.pixelRatio, 0, 0, metrics.pixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
}

export function resizeRendererViewport(renderer, metrics) {
  if (!renderer?.c || !renderer?.x) {
    throw new TypeError('Renderer viewport resize requires a canvas and 2D context.');
  }
  const previous = renderer.viewportMetrics ?? null;
  const camera = renderer.g?.camera ?? null;
  const worldCenter = previous && camera ? viewportWorldCenter(camera, previous) : null;

  renderer.dpr = metrics.pixelRatio;
  renderer.viewportMetrics = metrics;
  setCanvasSize(renderer.c, renderer.x, metrics);

  if (renderer.fogCanvas) {
    renderer.fogCanvas.width = metrics.cssWidth;
    renderer.fogCanvas.height = metrics.cssHeight;
  }

  if (worldCenter && camera) {
    const next = cameraPositionForViewportCenter(camera, worldCenter, metrics);
    camera.x = next.x;
    camera.y = next.y;
  }

  return metrics;
}

export function installRendererViewportPatch({
  RendererClass,
  windowTarget = globalThis.window,
  documentTarget = windowTarget?.document ?? globalThis.document,
} = {}) {
  if (!RendererClass?.prototype) throw new TypeError('RendererClass is required.');
  const prototype = RendererClass.prototype;
  const previousResize = prototype.resize;
  const patchedResize = function patchedViewportResize() {
    return resizeRendererViewport(this, readViewportMetrics(windowTarget, documentTarget));
  };

  prototype.resize = patchedResize;

  return Object.freeze({
    dispose() {
      if (prototype.resize === patchedResize) prototype.resize = previousResize;
    },
  });
}
