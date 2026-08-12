import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = join(projectRoot, 'tests');
const TIMING_SENSITIVE_TESTS = new Set([
  'tests/app/release-performance-budget.test.mjs',
]);

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function projectPath(path) {
  return relative(projectRoot, path).replaceAll('\\', '/');
}

function runTestFiles(testFiles, { isolated = false } = {}) {
  if (!testFiles.length) return 0;
  const label = isolated ? 'isolated timing-sensitive' : 'unit';
  console.log(`Running ${testFiles.length} ${label} test file(s).`);
  const result = spawnSync(process.execPath, [
    '--test',
    ...(isolated ? ['--test-concurrency=1'] : []),
    ...testFiles,
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const filters = process.argv.slice(2);
const allTests = walk(testsRoot)
  .filter((path) => path.endsWith('.test.mjs'))
  .sort((left, right) => left.localeCompare(right));
const selectedTests = filters.length
  ? allTests.filter((path) => {
      const pathFromRoot = projectPath(path);
      return filters.some((filter) => pathFromRoot.includes(filter));
    })
  : allTests;

if (!allTests.length) {
  console.error('Unit test runner found no tests matching tests/**/*.test.mjs.');
  process.exit(1);
}
if (!selectedTests.length) {
  console.error(`Unit test runner found no tests for filter(s): ${filters.join(', ')}`);
  process.exit(1);
}

// Wall-clock release budgets must not inherit scheduler contention from unrelated
// test workers. Keep them in the authoritative test stage, but execute them in a
// dedicated process after the parallel correctness suite.
const timingSensitiveTests = selectedTests.filter((path) => TIMING_SENSITIVE_TESTS.has(projectPath(path)));
const regularTests = selectedTests.filter((path) => !TIMING_SENSITIVE_TESTS.has(projectPath(path)));

const regularStatus = runTestFiles(regularTests);
if (regularStatus !== 0) process.exit(regularStatus);

const timingStatus = runTestFiles(timingSensitiveTests, { isolated: true });
process.exit(timingStatus);