import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  createVerificationPlan,
  discoverSyntaxTargets,
  runVerificationPlan,
  VERIFICATION_COMMANDS,
} from '../../scripts/lib/verification-runner.mjs';

function write(root, path, content = '') {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ufr-verification-'));
  write(root, 'verify.sh', '#!/usr/bin/env bash\nexit 0\n');
  write(root, 'src/z.js', 'export const z = 1;\n');
  write(root, 'src/nested/a.js', 'export const a = 1;\n');
  write(root, 'scripts/tool.mjs', 'export const tool = true;\n');
  write(root, 'tests/example.test.mjs', 'export const testFixture = true;\n');
  write(root, 'tests/ignored.txt', 'not JavaScript\n');
  return root;
}

function sink() {
  let value = '';
  return {
    write(chunk) {
      value += String(chunk);
    },
    value() {
      return value;
    },
  };
}

test('discovers JavaScript syntax targets recursively in stable path order', () => {
  const root = fixture();
  try {
    assert.deepEqual(discoverSyntaxTargets(root), [
      'scripts/tool.mjs',
      'src/nested/a.js',
      'src/z.js',
      'tests/example.test.mjs',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('builds one ordered plan from shell syntax through architecture verification', () => {
  const root = fixture();
  try {
    const plan = createVerificationPlan(root);
    assert.equal(plan[0].id, 'shell-syntax');
    assert.deepEqual(
      plan.filter((stage) => stage.id.startsWith('syntax:')).map((stage) => stage.id),
      [
        'syntax:scripts/tool.mjs',
        'syntax:src/nested/a.js',
        'syntax:src/z.js',
        'syntax:tests/example.test.mjs',
      ],
    );
    assert.deepEqual(
      plan.slice(-VERIFICATION_COMMANDS.length).map((stage) => stage.id),
      VERIFICATION_COMMANDS.map((stage) => stage.id),
    );
    assert.equal(plan.at(-1).id, 'architecture');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runs every stage exactly once and reports success only after the final stage', () => {
  const root = fixture();
  const stdout = sink();
  const stderr = sink();
  const executed = [];
  try {
    const plan = createVerificationPlan(root);
    const result = runVerificationPlan({
      projectRoot: root,
      stdout,
      stderr,
      execute(stage) {
        executed.push(stage.id);
        return { status: 0 };
      },
    });

    assert.equal(result.status, 0);
    assert.equal(result.failedStage, null);
    assert.deepEqual(executed, plan.map((stage) => stage.id));
    assert.deepEqual(result.completed, executed);
    assert.match(stdout.value(), /passed \d+ stages/);
    assert.equal(stderr.value(), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stops at the first failing stage and preserves its non-zero status', () => {
  const root = fixture();
  const stdout = sink();
  const stderr = sink();
  const executed = [];
  try {
    const result = runVerificationPlan({
      projectRoot: root,
      stdout,
      stderr,
      execute(stage) {
        executed.push(stage.id);
        return { status: stage.id === 'content' ? 17 : 0 };
      },
    });

    assert.equal(result.status, 17);
    assert.equal(result.failedStage, 'content');
    assert.equal(executed.at(-1), 'content');
    assert.equal(executed.includes('tech-fixtures'), false);
    assert.deepEqual(result.completed, executed.slice(0, -1));
    assert.match(stderr.value(), /failed at content with status 17/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalizes an invalid executor result to a failing status', () => {
  const root = fixture();
  const stderr = sink();
  try {
    const result = runVerificationPlan({
      projectRoot: root,
      stdout: sink(),
      stderr,
      execute() {
        return {};
      },
    });
    assert.equal(result.status, 1);
    assert.equal(result.failedStage, 'shell-syntax');
    assert.deepEqual(result.completed, []);
    assert.match(stderr.value(), /status 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
