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
  const root = mkdtempSync(join(tmpdir(), 'ufr-skirmish-architecture-'));
  write(root, 'src/core/fixed-step-clock.js', 'export const tick = 1 / 30;');
  write(root, 'src/config.js', 'export const TEAM = { UA: 0, RU: 1 };');
  write(root, 'src/content-schema.js', 'export const CONTENT_SCHEMA_VERSION = 1; export const CONTENT_SCHEMA_FAMILIES = []; export const CONTENT_SCHEMAS = {};');
  write(root, 'src/ai/ai-difficulty-profiles.js', "import { TEAM } from '../config.js'; export const ids = [TEAM.UA];");
  write(root, 'src/navigation/navigation-grid.js', "import { tick } from '../core/fixed-step-clock.js'; export { tick };");
  write(root, 'src/systems/objective-system.js', "import { TEAM } from '../config.js'; export { TEAM };");
  write(root, 'src/systems/projectile-system.js', "import { tick } from '../core/fixed-step-clock.js'; export { tick };");
  write(root, 'src/systems/simulation-phases.js', "import { TEAM } from '../config.js'; export { TEAM };");
  write(root, 'src/systems/wave-system.js', "import { TEAM } from '../config.js'; export { TEAM };");
  write(root, 'src/game.js', [
    "import './systems/objective-system.js';",
    "import './systems/projectile-system.js';",
    "import './systems/simulation-phases.js';",
    "import './systems/wave-system.js';",
    'export class Game {}',
  ].join('\n'));
  write(root, 'src/app/runtime.js', "import '../core/fixed-step-clock.js'; export const start = () => window.requestAnimationFrame(() => {});");
  write(root, 'src/input/battlefield-input.js', "import { TEAM } from '../config.js'; export { TEAM };");
  write(root, 'src/ui.js', "import { TEAM } from './config.js'; export { TEAM };");
  write(root, 'src/render.js', "import { TEAM } from './config.js'; export { TEAM };");
  write(root, 'src/main.js', "import './app/runtime.js'; import './input/battlefield-input.js';");
  write(root, 'src/skirmish/skirmish-catalog.js', 'export const MAPS = [];');
  write(root, 'src/skirmish/skirmish-config.js', "import { ids } from '../ai/ai-difficulty-profiles.js'; import { MAPS } from './skirmish-catalog.js'; export { ids, MAPS };");
  write(root, 'src/skirmish/skirmish-runtime.js', "import { ids } from './skirmish-config.js'; import { tick } from '../core/fixed-step-clock.js'; export { ids, tick };");
  write(root, 'src/ui/skirmish-setup.js', "import { MAPS } from '../skirmish/skirmish-catalog.js'; export { MAPS };");
  return root;
}

test('skirmish catalog is declarative config while skirmish runtime modules obey systems boundaries', () => {
  const root = project();
  try {
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skirmish systems cannot import UI and UI cannot import skirmish runtime modules', () => {
  const root = project();
  try {
    write(root, 'src/skirmish/skirmish-runtime.js', "import { MAPS } from '../ui/skirmish-setup.js'; export { MAPS };");
    write(root, 'src/ui/skirmish-setup.js', "import { ids } from '../skirmish/skirmish-runtime.js'; export { ids };");
    const failures = verifyArchitectureProject({ projectRoot: root }).failures;
    assert.ok(failures.some((failure) => failure.includes('systems layer cannot import ui layer')));
    assert.ok(failures.some((failure) => failure.includes('ui layer cannot import systems layer')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
