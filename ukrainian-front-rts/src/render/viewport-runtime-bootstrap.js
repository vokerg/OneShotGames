import '../app/diagnostics-bootstrap.js';
import { Renderer } from '../render.js';
import { installRendererViewportPatch } from './viewport-runtime.js';
import {
  installReleaseArtFallbackGuard,
  installRendererPerformancePatch,
} from './visual-performance-runtime.js';

const rendererPatch = installRendererViewportPatch({
  RendererClass: Renderer,
  windowTarget: window,
  documentTarget: document,
});
let performancePatch = null;

addEventListener(
  'DOMContentLoaded',
  () => {
    // Infantry art passes are installed by deferred module scripts before
    // DOMContentLoaded. Put the guard above them, then let vehicle/support
    // passes capture the guard as their non-procedural fallback boundary.
    installReleaseArtFallbackGuard(Renderer);
    import('./ukrainian-vehicle-runtime-install.js')
      .then(() => import('./russian-vehicle-runtime-install.js'))
      .then(() => import('./support-visual-runtime-install.js'))
      .then(() => {
        performancePatch = installRendererPerformancePatch(Renderer);
        globalThis.__fieldsOfResolveVisualPerformance = Object.freeze({
          budgets: Object.freeze({ targetFrameMs: 1000 / 60, warningP95FrameMs: 25 }),
          status(renderer) { return performancePatch?.status(renderer) ?? null; },
        });
      })
      .catch((error) => {
        console.error('[unit-art] runtime installation failed', error);
      });
  },
  { once: true },
);

addEventListener(
  'pagehide',
  () => {
    performancePatch?.restore();
    rendererPatch.dispose();
  },
  { once: true },
);
