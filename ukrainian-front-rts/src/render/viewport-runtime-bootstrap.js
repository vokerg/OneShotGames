import { Renderer } from '../render.js';
import { installRendererViewportPatch } from './viewport-runtime.js';

const rendererPatch = installRendererViewportPatch({
  RendererClass: Renderer,
  windowTarget: window,
  documentTarget: document,
});

addEventListener(
  'pagehide',
  () => rendererPatch.dispose(),
  { once: true },
);
