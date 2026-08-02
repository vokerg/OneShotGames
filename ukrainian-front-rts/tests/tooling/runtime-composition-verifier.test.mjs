import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  AUTHORIZED_UPDATE_ASSIGNMENTS,
  verifyRuntimeCompositionProject,
} from '../../scripts/lib/runtime-composition-verifier.mjs';

function write(root, path, content = '') {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function validFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ufr-runtime-composition-'));
  write(root, 'src/main.js', [
    'createApplicationComposition();',
    'installControllerWithSimulationDelegates();',
    'acquireBrowserStorage();',
    "const stance = { name: 'stance-controller' };",
    "const tactical = { name: 'tactical-command-controller' };",
    "const capacity = { name: 'command-capacity-controller' };",
  ].join('\n'));
  write(root, 'src/systems/simulation-phases.js', [
    'SIMULATION_DELEGATE_PHASES.STEP_BEGIN;',
    'SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE;',
    'SIMULATION_DELEGATE_PHASES.STANCE_PREPARE;',
    'SIMULATION_DELEGATE_PHASES.STANCE_RECONCILE;',
    'SIMULATION_DELEGATE_PHASES.TACTICAL_RECONCILE;',
    'SIMULATION_DELEGATE_PHASES.COMMAND_CAPACITY;',
    'SIMULATION_DELEGATE_PHASES.STEP_END;',
  ].join('\n'));
  for (const path of Object.keys(AUTHORIZED_UPDATE_ASSIGNMENTS)) {
    if (path === 'src/systems/simulation-phases.js') continue;
    write(root, path, 'game.update = replacement;\n');
  }
  return root;
}

test('accepts the explicit wrapper inventory and named composition ownership', () => {
  const root = validFixture();
  try {
    const result = verifyRuntimeCompositionProject({ projectRoot: root });
    assert.deepEqual(result.failures, []);
    assert.equal(result.assignments.length, Object.keys(AUTHORIZED_UPDATE_ASSIGNMENTS).length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects undeclared dot and bracket gameplay update wrappers', () => {
  const root = validFixture();
  try {
    write(root, 'src/systems/hidden-phase.js', [
      'game.update = () => true;',
      "game['update'] = replacement;",
      'game["update"] = replacement;',
    ].join('\n'));
    const result = verifyRuntimeCompositionProject({ projectRoot: root });
    const assignment = result.assignments.find(({ path }) => path === 'src/systems/hidden-phase.js');
    assert.equal(assignment?.count, 3);
    assert.equal(
      result.failures.some((failure) => failure.includes('hidden-phase.js: unauthorized assignment')),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores update-assignment examples in comments and strings', () => {
  const root = validFixture();
  try {
    write(root, 'src/systems/inert-examples.js', [
      '// game.update = replacement;',
      "/* game['update'] = replacement; */",
      "const dotExample = 'game.update = replacement';",
      'const bracketExample = "game[\'update\'] = replacement";',
      'const templateExample = `game["update"] = replacement`;',
    ].join('\n'));
    const result = verifyRuntimeCompositionProject({ projectRoot: root });
    assert.equal(result.assignments.some(({ path }) => path === 'src/systems/inert-examples.js'), false);
    assert.equal(result.failures.some((failure) => failure.includes('inert-examples.js')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe storage acquisition and manual disposer chains', () => {
  const root = validFixture();
  try {
    write(root, 'src/main.js', [
      'createApplicationComposition();',
      'installControllerWithSimulationDelegates();',
      'acquireBrowserStorage();',
      "const stance = { name: 'stance-controller' };",
      "const tactical = { name: 'tactical-command-controller' };",
      "const capacity = { name: 'command-capacity-controller' };",
      'const storage = window.localStorage;',
      'disposeFeature();',
    ].join('\n'));
    const result = verifyRuntimeCompositionProject({ projectRoot: root });
    assert.equal(result.failures.some((failure) => failure.includes('acquire localStorage')), true);
    assert.equal(result.failures.some((failure) => failure.includes('manual disposer sequence')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
