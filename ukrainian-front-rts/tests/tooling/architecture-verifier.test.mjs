import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { importsOf, verifyArchitectureProject } from '../../scripts/lib/architecture-verifier.mjs';

function write(root, path, content = '') {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function validProject() {
  const root = mkdtempSync(join(tmpdir(), 'ufr-architecture-'));
  write(root, 'src/core/fixed-step-clock.js', 'export const tick = 1 / 30;');
  write(root, 'src/core/events.js', 'export const EVENT = "event";');
  write(root, 'src/config.js', 'export const TEAM = { UA: 0, RU: 1 };');
  write(root, 'src/content-schema.js', 'export const CONTENT_SCHEMA_VERSION = 1; export const CONTENT_SCHEMA_FAMILIES = []; export const CONTENT_SCHEMAS = {};');
  write(root, 'src/navigation/navigation-grid.js', "import { tick } from '../core/fixed-step-clock.js'; export const cellSize = tick;");
  write(root, 'src/navigation/path-service.js', "import { cellSize } from './navigation-grid.js'; export const route = cellSize;");
  write(root, 'src/systems/navigation-movement-system.js', "import { route } from '../navigation/path-service.js'; export { route };");
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
  write(root, 'src/app/simulation-harness.js', "import { Game } from '../game.js'; export const create = () => new Game();");
  write(root, 'src/input/battlefield-input.js', "import { TEAM } from '../config.js'; export { TEAM };");
  write(root, 'src/ui.js', "import { TEAM } from './config.js'; export const mount = () => document.body.dataset.team = TEAM.UA;");
  write(root, 'src/render.js', "import { TEAM } from './config.js'; export const canvas = document.createElement('canvas');");
  write(root, 'src/main.js', "import './app/runtime.js'; import './input/battlefield-input.js'; import './ui.js'; import './render.js';");
  return root;
}

function verifyMutation(path, content) {
  const root = validProject();
  try {
    write(root, path, content);
    return verifyArchitectureProject({ projectRoot: root }).failures;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('extracts static, side-effect, re-export, and dynamic imports without duplicates', () => {
  assert.deepEqual(importsOf(`
    import value from './a.js';
    import './side.js';
    export { value } from './a.js';
    export * from './b.js';
    const lazy = import('./lazy.js');
  `), ['./a.js', './side.js', './b.js', './lazy.js']);
});

test('accepts the documented production dependency direction', () => {
  const root = validProject();
  try {
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }), {
      filesChecked: 18,
      failures: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts focused content and AI modules with inward-only imports', () => {
  const root = validProject();
  try {
    write(root, 'src/content/faction-tech-trees.js', "import { TEAM } from '../config.js'; export { TEAM };");
    write(root, 'src/ai/ai-contracts.js', "import { TEAM } from '../content/faction-tech-trees.js'; export { TEAM };");
    write(root, 'src/systems/ai-runtime.js', "import { TEAM } from '../ai/ai-contracts.js'; export { TEAM };");
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }), {
      filesChecked: 21,
      failures: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts navigation, shared contracts, and focused simulation namespaces', () => {
  const root = validProject();
  try {
    write(root, 'src/combat/combat-schema.js', 'export const DAMAGE = "damage";');
    write(root, 'src/combat/air-defense-system.js', 'export const AIR_TARGET = "air";');
    write(root, 'src/combat/target-policy.js', "import { DAMAGE } from './combat-schema.js'; export { DAMAGE };");
    write(root, 'src/status/suppression-morale.js', "import { EVENT } from '../core/events.js'; export { EVENT };");
    write(root, 'src/visibility/line-of-sight.js', "import { EVENT } from '../core/events.js'; export { EVENT };");
    write(root, 'src/systems/research-queue-system.js', 'export const QUEUE = [];');
    write(root, 'src/ui/combat-readability.js', 'export const CUES = [];');
    write(root, 'src/content/combat-content.js', "import { DAMAGE } from '../combat/combat-schema.js'; import { AIR_TARGET } from '../combat/air-defense-system.js'; export { DAMAGE, AIR_TARGET };");
    write(root, 'src/systems/combat-runtime.js', "import { DAMAGE } from '../combat/target-policy.js'; import { route } from '../navigation/path-service.js'; export { DAMAGE, route };");
    write(root, 'src/render/combat-overlay.js', "import { CUES } from '../ui/combat-readability.js'; export { CUES };");
    write(root, 'src/ui/research-hud.js', "import { QUEUE } from '../systems/research-queue-system.js'; export { QUEUE };");
    write(root, 'src/art-lab.js', "import { Game } from './game.js'; import './render.js'; export const mount = () => document.querySelector('#game') && new Game();");
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts dedicated UI modules as the UI layer and permits UI-owned DOM adapters', () => {
  const root = validProject();
  try {
    write(root, 'src/ui/ui-contract.js', 'export const REGIONS = [];');
    write(root, 'src/ui/dom-adapter.js', "import { REGIONS } from './ui-contract.js'; export const mount = () => document.querySelector(REGIONS[0]);");
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }), {
      filesChecked: 20,
      failures: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects forbidden layer imports and imports outside src', () => {
  assert.ok(verifyMutation('src/core/events.js', "import { Game } from '../game.js'; export { Game };")
    .some((failure) => failure.includes('core layer cannot import game layer')));
  assert.ok(verifyMutation('src/navigation/path-service.js', "import { route } from '../systems/navigation-movement-system.js'; export { route };")
    .some((failure) => failure.includes('navigation layer cannot import systems layer')));
  assert.ok(verifyMutation('src/systems/wave-system.js', "import { UI } from '../ui.js'; export { UI };")
    .some((failure) => failure.includes('systems layer cannot import ui layer')));
  assert.ok(verifyMutation('src/app/simulation-harness.js', "import { TEAM } from '../systems/simulation-phases.js'; export { TEAM };")
    .some((failure) => failure.includes('app layer cannot import systems layer')));
  assert.ok(verifyMutation('src/ui.js', "import helper from '../tests/helper.js'; export { helper };")
    .some((failure) => failure.includes('cannot import outside src')));
  assert.ok(verifyMutation('src/ui/ui-state.js', "import { Game } from '../game.js'; export { Game };")
    .some((failure) => failure.includes('ui layer cannot import game layer')));
  assert.ok(verifyMutation('src/ai/planner.js', "import { Game } from '../game.js'; export { Game };")
    .some((failure) => failure.includes('ai layer cannot import game layer')));
  assert.ok(verifyMutation('src/ai/planner.js', "import { TEAM } from '../systems/wave-system.js'; export { TEAM };")
    .some((failure) => failure.includes('ai layer cannot import systems layer')));
  assert.ok(verifyMutation('src/content/bad-combat-content.js', "import { target } from '../combat/target-policy.js'; export { target };")
    .some((failure) => failure.includes('config layer cannot import systems layer')));
});

test('rejects unclassified source modules instead of allowing a boundary bypass', () => {
  assert.ok(verifyMutation('src/rogue.js', 'export const rogue = true;')
    .some((failure) => failure.includes('has no declared architecture layer')));
});

test('rejects direct DOM access outside browser-owned modules', () => {
  const failures = verifyMutation(
    'src/app/simulation-harness.js',
    "import { Game } from '../game.js'; export const create = () => document.createElement('canvas') && new Game();",
  );
  assert.ok(failures.some((failure) => failure.includes('direct DOM access is forbidden here (document)')));
  assert.ok(failures.some((failure) => failure.includes('direct DOM access is forbidden here (DOM query/mutation)')));
  assert.ok(verifyMutation('src/ai/debug.js', 'export const inspect = () => document.body;')
    .some((failure) => failure.includes('direct DOM access is forbidden here (document)')));
});

test('rejects direct audio calls outside the audio service boundary', () => {
  assert.ok(verifyMutation('src/ui.js', "export const play = () => new Audio('alert.ogg').play();")
    .some((failure) => failure.includes('direct audio access must be owned by src/audio/')));

  const root = validProject();
  try {
    write(root, 'src/audio/mixer.js', 'export const create = () => new window.AudioContext();');
    assert.deepEqual(verifyArchitectureProject({ projectRoot: root }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('enforces one content-schema owner and required schema declarations', () => {
  assert.ok(verifyMutation('src/config.js', 'export const CONTENT_SCHEMAS = {};')
    .some((failure) => failure.includes('schema ownership belongs to src/content-schema.js')));
  assert.ok(verifyMutation('src/content-schema.js', 'export const CONTENT_SCHEMA_VERSION = 1; export const CONTENT_SCHEMAS = {};')
    .some((failure) => failure.includes('missing schema owner declaration CONTENT_SCHEMA_FAMILIES')));
});

test('enforces composition and fixed-step integration imports', () => {
  assert.ok(verifyMutation('src/main.js', "import './app/runtime.js';")
    .some((failure) => failure.includes('missing required import ./input/battlefield-input.js')));
  assert.ok(verifyMutation('src/app/runtime.js', 'export const start = () => {};')
    .some((failure) => failure.includes('missing required import ../core/fixed-step-clock.js')));
  assert.ok(verifyMutation('src/game.js', "import './systems/objective-system.js'; import './systems/projectile-system.js'; import './systems/wave-system.js';")
    .some((failure) => failure.includes('missing required import ./systems/simulation-phases.js')));
});
