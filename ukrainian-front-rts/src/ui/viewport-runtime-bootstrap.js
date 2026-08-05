import { installViewportRuntime } from './viewport-runtime.js';

const viewportRuntime = installViewportRuntime({
  windowTarget: window,
  documentTarget: document,
});

addEventListener(
  'pagehide',
  () => viewportRuntime.dispose(),
  { once: true },
);
