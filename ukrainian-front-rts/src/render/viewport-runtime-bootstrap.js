import '../app/diagnostics-bootstrap.js';
import { Renderer } from '../render.js';
import { installRendererViewportPatch } from './viewport-runtime.js';

const rendererPatch = installRendererViewportPatch({
  RendererClass: Renderer,
  windowTarget: window,
  documentTarget: document,
});

addEventListener(
  'DOMContentLoaded',
  () => {
    import('./ukrainian-vehicle-runtime-install.js')
      .then(() => import('./russian-vehicle-runtime-install.js'))
      .catch((error) => {
        console.error('[vehicle-art] runtime installation failed', error);
      });
  },
  { once: true },
);

addEventListener(
  'pagehide',
  () => rendererPatch.dispose(),
  { once: true },
);