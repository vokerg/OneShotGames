import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SYNTAX_EXTENSIONS = new Set(['.js', '.mjs']);
const SYNTAX_ROOTS = Object.freeze(['src', 'scripts', 'tests']);

export const VERIFICATION_COMMANDS = Object.freeze([
  Object.freeze({ id: 'tests', command: Object.freeze(['node', '--test']) }),
  Object.freeze({ id: 'content', command: Object.freeze(['node', 'scripts/validate-content.mjs']) }),
  Object.freeze({ id: 'tech-fixtures', command: Object.freeze(['node', 'scripts/validate-tech-fixtures.mjs']) }),
  Object.freeze({ id: 'sprite-atlases', command: Object.freeze(['node', 'scripts/verify-sprite-atlases.mjs']) }),
  Object.freeze({ id: 'combat-sfx', command: Object.freeze(['node', 'scripts/verify-combat-sfx.mjs']) }),
  Object.freeze({ id: 'art-sources', command: Object.freeze(['node', 'scripts/verify-art-sources.mjs']) }),
  Object.freeze({ id: 'task-dependencies', command: Object.freeze(['node', 'scripts/verify-task-dependencies.mjs']) }),
  Object.freeze({ id: 'task-doc-contract', command: Object.freeze(['node', 'scripts/verify-task-doc-contract.mjs']) }),
  Object.freeze({ id: 'completed-task-contracts', command: Object.freeze(['node', 'scripts/verify-completed-task-contracts.mjs']) }),
  Object.freeze({ id: 'runtime-content', command: Object.freeze(['node', 'scripts/verify-runtime-content.mjs']) }),
  Object.freeze({ id: 'architecture', command: Object.freeze(['node', 'scripts/verify-architecture.mjs']) }),
]);

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function walk(root, directory, output) {
  if (!existsSync(directory)) return;
  const entries = readdirSync(directory).sort(comparePaths);
  for (const entry of entries) {
    const absolute = join(directory, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walk(root, absolute, output);
      continue;
    }
    if (stats.isFile() && SYNTAX_EXTENSIONS.has(extname(entry))) {
      output.push(relative(root, absolute));
    }
  }
}

export function discoverSyntaxTargets(projectRoot = MODULE_ROOT) {
  const root = resolve(projectRoot);
  const output = [];
  for (const directory of SYNTAX_ROOTS) walk(root, join(root, directory), output);
  return output.sort(comparePaths);
}

export function createVerificationPlan(projectRoot = MODULE_ROOT) {
  const root = resolve(projectRoot);
  const stages = [
    Object.freeze({
      id: 'shell-syntax',
      command: Object.freeze(['bash', '-n', 'verify.sh', 'run.sh']),
    }),
  ];
  for (const target of discoverSyntaxTargets(root)) {
    stages.push(Object.freeze({
      id: `syntax:${target}`,
      command: Object.freeze(['node', '--check', target]),
    }));
  }
  stages.push(...VERIFICATION_COMMANDS);
  return Object.freeze(stages);
}

function defaultExecute(stage, projectRoot, streams) {
  const [command, ...args] = stage.command;
  return spawnSync(command, args, {
    cwd: projectRoot,
    stdio: ['ignore', streams.stdout, streams.stderr],
  });
}

function statusOf(result) {
  return Number.isInteger(result?.status) ? result.status : 1;
}

export function runVerificationPlan({
  projectRoot = MODULE_ROOT,
  execute = defaultExecute,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const root = resolve(projectRoot);
  const plan = createVerificationPlan(root);
  const completed = [];
  for (const stage of plan) {
    stdout.write(`[verify] ${stage.id}\n`);
    const result = execute(stage, root, { stdout, stderr });
    const status = statusOf(result);
    if (status !== 0) {
      stderr.write(`[verify] failed at ${stage.id} with status ${status}\n`);
      return Object.freeze({ status, failedStage: stage.id, completed: Object.freeze([...completed]) });
    }
    completed.push(stage.id);
  }
  stdout.write(`[verify] passed ${completed.length} stages\n`);
  return Object.freeze({ status: 0, failedStage: null, completed: Object.freeze(completed) });
}
