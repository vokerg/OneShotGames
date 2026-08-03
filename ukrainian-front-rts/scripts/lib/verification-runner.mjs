import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs']);

export const VERIFICATION_COMMANDS = Object.freeze([
  Object.freeze({ id: 'tests', label: 'unit and simulation tests', script: 'scripts/run-tests.mjs' }),
  Object.freeze({ id: 'queue-fixtures', label: 'task queue validator fixtures', script: 'scripts/verify-task-queue.test.mjs' }),
  Object.freeze({ id: 'queue', label: 'task queue contract', script: 'scripts/verify-task-queue.mjs' }),
  Object.freeze({ id: 'content-schema', label: 'content schema contract', script: 'scripts/verify-content-schema.mjs' }),
  Object.freeze({ id: 'content-fixtures', label: 'content validator fixtures', script: 'scripts/content-validator.test.mjs' }),
  Object.freeze({ id: 'content', label: 'production content validation', script: 'scripts/verify-content.mjs' }),
  Object.freeze({ id: 'tech-fixtures', label: 'technology graph fixtures', script: 'scripts/verify-tech-graph.test.mjs' }),
  Object.freeze({ id: 'tech-content', label: 'production technology graph', script: 'scripts/verify-tech-content.mjs' }),
  Object.freeze({ id: 'runtime-content', label: 'runtime content reconciliation', script: 'scripts/verify-runtime-content.mjs' }),
  Object.freeze({ id: 'seeded-random', label: 'seeded simulation randomness', script: 'scripts/verify-seeded-random.mjs' }),
  Object.freeze({ id: 'art-sources', label: 'source art and export manifests', script: 'scripts/verify-art-sources.mjs' }),
  Object.freeze({ id: 'sprite-atlases', label: 'sprite atlas sources and manifests', script: 'scripts/verify-sprite-atlases.mjs' }),
  Object.freeze({ id: 'combat-sfx', label: 'deterministic combat sound effects', script: 'scripts/verify-combat-sfx.mjs' }),
  Object.freeze({
    id: 'runtime-composition',
    label: 'runtime composition ownership',
    script: 'scripts/verify-runtime-composition.mjs',
  }),
  Object.freeze({ id: 'architecture', label: 'architecture boundaries', script: 'scripts/verify-architecture.mjs' }),
]);

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

export function discoverSyntaxTargets(projectRoot) {
  const root = resolve(projectRoot);
  return ['src', 'scripts', 'tests']
    .flatMap((directory) => walk(join(root, directory)))
    .filter((path) => JAVASCRIPT_EXTENSIONS.has(extensionOf(path)))
    .map((path) => relative(root, path).replaceAll('\\', '/'))
    .sort();
}

export function createVerificationPlan(projectRoot) {
  const root = resolve(projectRoot);
  const syntaxStages = discoverSyntaxTargets(root).map((path) =>
    Object.freeze({
      id: `syntax:${path}`,
      label: `syntax ${path}`,
      command: process.execPath,
      args: Object.freeze(['--check', path]),
      cwd: root,
    }),
  );
  const commandStages = VERIFICATION_COMMANDS.map(({ id, label, script }) =>
    Object.freeze({
      id,
      label,
      command: process.execPath,
      args: Object.freeze([script]),
      cwd: root,
    }),
  );

  return Object.freeze([
    Object.freeze({
      id: 'shell-syntax',
      label: 'shell syntax verify.sh',
      command: 'bash',
      args: Object.freeze(['-n', 'verify.sh']),
      cwd: root,
    }),
    ...syntaxStages,
    ...commandStages,
  ]);
}

function executeStage(stage) {
  const result = spawnSync(stage.command, stage.args, {
    cwd: stage.cwd,
    stdio: 'inherit',
  });
  if (result.error) return { status: 1, error: result.error };
  return { status: result.status ?? 1, signal: result.signal ?? null };
}

export function runVerificationPlan({
  projectRoot,
  execute = executeStage,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  if (!projectRoot) throw new TypeError('Verification requires a projectRoot.');
  if (typeof execute !== 'function') throw new TypeError('Verification execute must be a function.');

  const plan = createVerificationPlan(projectRoot);
  const completed = [];
  stdout.write(`[verify] ${plan.length} ordered stages\n`);

  for (const stage of plan) {
    stdout.write(`[verify] ${stage.label}\n`);
    const result = execute(stage) ?? {};
    const status = Number.isInteger(result.status) ? result.status : 1;
    if (status !== 0) {
      const detail = result.error ? `: ${result.error.message}` : '';
      stderr.write(`[verify] failed at ${stage.id} with status ${status}${detail}\n`);
      return Object.freeze({
        status,
        failedStage: stage.id,
        completed: Object.freeze([...completed]),
        totalStages: plan.length,
      });
    }
    completed.push(stage.id);
  }

  stdout.write(`[verify] passed ${plan.length} stages\n`);
  return Object.freeze({
    status: 0,
    failedStage: null,
    completed: Object.freeze([...completed]),
    totalStages: plan.length,
  });
}
