import { acquireBrowserStorage } from './browser-capabilities.js';
import { createRuntimeDiagnostics } from './diagnostics.js';

const diagnostics = createRuntimeDiagnostics({
  windowTarget: window,
  documentTarget: document,
  storage: acquireBrowserStorage(window),
});

diagnostics.install();

window.addEventListener('pagehide', () => diagnostics.dispose(), { once: true });
