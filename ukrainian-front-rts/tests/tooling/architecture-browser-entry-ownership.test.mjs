import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { verifyArchitectureProject } from '../../scripts/lib/architecture-verifier.mjs';

function write(root, path, content = '') {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'ufr-architecture-browser-entry-'));
  write(root, 'src/core/fixed-step-clock.js', 'export const tick = 1 / 30;');
  write(root, 'src/config.js', 'export const TEAM = { UA: 0, RU: 1 };');
  write(root, 'src/content-schema.js', 'export const CONTENT_SCHEMA_VERSION = 1; export const CONTENT_SCHEMA_FAMILIES = []; export const CONTENT_SCHEMAS = {};');
  write(root, 'src/systems/objective-system.js', 'export const objective = true;');
  write(root, 'src/systems/projectile-system.js', 'export const projectile = true;');
  write(root, 'src/systems/simulation-phases.js', 'export const phases = [];');
  write(root, 'src/systems/wave-system.js', 'export const wave = true;');
  write(root, 'src/game.js', [
    "import './systems/objective-system.js';",
    "import './systems/projectile-system.js';",
    "import './systems/simulation-phases.js';",
    "import './systems/wave-system.js';",
    'export class Game {}',
  ].join('\n'));
  write(root, 'src/app/runtime.js', "import '../core/fixed-step-clock.js'; export const runtime = true;");
  write(root, 'src/input/battlefield-input.js', 'export const input = true;');
  write(root, 'src/main.js', "import './app/runtime.js'; import './input/battlefield-input.js';");
  return root;
}

test('accepts only the declared browser bootstrap and runtime diagnostics ownership overrides', () => {
  const root = project();
  try {
    write(root, 'src/app/browser-capabilities.js', 'export const acquireBrowserStorage = () => null;');
    write(root, 'src/localization/localization.js', 'export const createLocalizer = () => ({ t: () => "copy" });');
    write(root, 'src/localization/runtime-diagnostics-catalogs.js', 'export const RUNTIME_DIAGNOSTICS_CATALOGS = {};');
    write(root, 'src/app/diagnostics.js', [
      "import { createLocalizer } from '../localization/localization.js';",
      "import { RUNTIME_DIAGNOSTICS_CATALOGS } from '../localization/runtime-diagnostics-catalogs.js';",
      'export const mountDiagnostics = () => document.createElement(createLocalizer(RUNTIME_DIAGNOSTICS_CATALOGS).t());',
    ].join('\n'));
    write(root, 'src/app/diagnostics-bootstrap.js', [
      "import { acquireBrowserStorage } from './browser-capabilities.js';",
      "import { mountDiagnostics } from './diagnostics.js';",
      'export const diagnostics = mountDiagnostics(window, document, acquireBrowserStorage(window));',
    ].join('\n'));
    write(root, 'src/render.js', 'export class Renderer {}');
    write(root, 'src/render/viewport-runtime.js', 'export const installRendererViewportPatch = () => ({ dispose() {} });');
    write(root, 'src/render/viewport-runtime-bootstrap.js', [
      "import '../app/diagnostics-bootstrap.js';",
      "import { Renderer } from '../render.js';",
      "import { installRendererViewportPatch } from './viewport-runtime.js';",
      'export const patch = installRendererViewportPatch({ RendererClass: Renderer, windowTarget: window, documentTarget: document });',
    ].join('\n'));
    write(root, 'src/ui/onboarding-help.js', 'export const installOnboardingHelp = () => () => {};');
    write(root, 'src/ui/onboarding-help-bootstrap.js', [
      "import { acquireBrowserStorage } from '../app/browser-capabilities.js';",
      "import { installOnboardingHelp } from './onboarding-help.js';",
      'export const dispose = installOnboardingHelp({ windowTarget: window, documentTarget: document, storage: acquireBrowserStorage(window) });',
    ].join('\n'));
    write(root, 'src/ui/viewport-runtime.js', 'export const installViewportRuntime = () => ({ dispose() {} });');
    write(root, 'src/ui/viewport-runtime-bootstrap.js', [
      "import './onboarding-help-bootstrap.js';",
      "import { installViewportRuntime } from './viewport-runtime.js';",
      'export const viewport = installViewportRuntime({ windowTarget: window, documentTarget: document });',
    ].join('\n'));

    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps ordinary app modules browser-independent and unable to import UI', () => {
  const root = project();
  try {
    write(root, 'src/ui/panel.js', 'export const panel = true;');
    write(root, 'src/app/controller-adapter.js', "import { panel } from '../ui/panel.js'; export const mount = () => document.createElement(String(panel));");
    const failures = verifyArchitectureProject({ projectRoot: root }).failures;
    assert.ok(failures.some((failure) => failure.includes('app layer cannot import ui layer')));
    assert.ok(failures.some((failure) => failure.includes('direct DOM access is forbidden here (document)')));
    assert.ok(failures.some((failure) => failure.includes('direct DOM access is forbidden here (DOM query/mutation)')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
