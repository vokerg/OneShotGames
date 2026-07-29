import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(projectRoot, 'src');
const failures = [];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function importsOf(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[^'\"]+\s+from\s+)?['\"]([^'\"]+)['\"]/g)].map(
    (match) => match[1],
  );
}

const files = walk(sourceRoot).filter((path) => path.endsWith('.js'));
for (const file of files) {
  const projectPath = relative(projectRoot, file).replaceAll('\\', '/');
  const source = readFileSync(file, 'utf8');
  const imports = importsOf(source);

  if (projectPath.startsWith('src/core/')) {
    const forbidden = imports.filter((specifier) => !specifier.startsWith('./'));
    if (forbidden.length) {
      failures.push(`${projectPath}: core modules may import sibling core modules only: ${forbidden.join(', ')}`);
    }
  }

  if (projectPath.startsWith('src/systems/')) {
    const forbidden = imports.filter((specifier) =>
      ['../game.js', '../render.js', '../ui.js', '../input/', '../app/'].some((prefix) =>
        specifier.startsWith(prefix),
      ),
    );
    if (forbidden.length) {
      failures.push(`${projectPath}: forbidden system import(s): ${forbidden.join(', ')}`);
    }
  }

  if (projectPath === 'src/game.js') {
    const forbidden = imports.filter((specifier) =>
      ['./render.js', './ui.js', './input/', './app/'].some((prefix) => specifier.startsWith(prefix)),
    );
    if (forbidden.length) {
      failures.push(`src/game.js: simulation cannot depend on presentation/input: ${forbidden.join(', ')}`);
    }
  }
}

const main = readFileSync(join(sourceRoot, 'main.js'), 'utf8');
for (const requiredImport of ['./app/runtime.js', './input/battlefield-input.js']) {
  if (!main.includes(requiredImport)) failures.push(`src/main.js: missing ${requiredImport}`);
}

const game = readFileSync(join(sourceRoot, 'game.js'), 'utf8');
for (const requiredSystem of [
  './systems/objective-system.js',
  './systems/projectile-system.js',
  './systems/wave-system.js',
]) {
  if (!game.includes(requiredSystem)) failures.push(`src/game.js: missing ${requiredSystem}`);
}

if (failures.length) {
  console.error('Architecture verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Architecture verification passed for ${files.length} JavaScript modules.`);
