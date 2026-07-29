import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsRoot = join(projectRoot, 'tests');

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const filters = process.argv.slice(2);
const allTests = walk(testsRoot)
  .filter((path) => path.endsWith('.test.mjs'))
  .sort((left, right) => left.localeCompare(right));
const selectedTests = filters.length
  ? allTests.filter((path) => {
      const projectPath = relative(projectRoot, path).replaceAll('\\', '/');
      return filters.some((filter) => projectPath.includes(filter));
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

console.log(`Running ${selectedTests.length} unit test file(s).`);
const result = spawnSync(process.execPath, ['--test', ...selectedTests], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
