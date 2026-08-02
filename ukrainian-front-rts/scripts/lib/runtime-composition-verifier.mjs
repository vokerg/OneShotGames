import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const AUTHORIZED_UPDATE_ASSIGNMENTS = Object.freeze({
  'src/app/controller-adapter.js': 'composition adapter captures and removes legacy gameplay wrappers',
  'src/systems/building-lifecycle-system.js': 'legacy wrapper is neutralized and mapped to the building-lifecycle phase',
  'src/systems/stance-system.js': 'legacy wrapper is neutralized and mapped to stance delegate phases',
  'src/systems/tactical-command-system.js': 'legacy wrapper is neutralized and mapped to tactical delegate phases',
  'src/systems/command-capacity-system.js': 'legacy wrapper is neutralized and mapped to command-capacity phase',
  'src/ui/combat-readability-runtime.js': 'presentation observer remains outside authoritative simulation ownership',
});

const REQUIRED_MAIN_TOKENS = Object.freeze([
  'createApplicationComposition',
  'installControllerWithSimulationDelegates',
  'acquireBrowserStorage',
  "name: 'building-lifecycle-controller'",
  "name: 'stance-controller'",
  "name: 'tactical-command-controller'",
  "name: 'command-capacity-controller'",
]);

const REQUIRED_PHASE_TOKENS = Object.freeze([
  'SIMULATION_DELEGATE_PHASES.STEP_BEGIN',
  'SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE',
  'SIMULATION_DELEGATE_PHASES.STANCE_PREPARE',
  'SIMULATION_DELEGATE_PHASES.BUILDING_LIFECYCLE',
  'SIMULATION_DELEGATE_PHASES.STANCE_RECONCILE',
  'SIMULATION_DELEGATE_PHASES.TACTICAL_RECONCILE',
  'SIMULATION_DELEGATE_PHASES.COMMAND_CAPACITY',
  'SIMULATION_DELEGATE_PHASES.STEP_END',
]);

const slash = (value) => value.replaceAll('\\', '/');

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function quotedLiteral(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += Math.min(2, source.length - index);
      continue;
    }
    if (character === quote) {
      return Object.freeze({
        end: index,
        rawValue: source.slice(start + 1, index),
      });
    }
    index += 1;
  }
  return null;
}

function scrub(source, { preserveUpdateStrings = false } = {}) {
  let output = '';
  let state = 'code';
  let quote = '';
  for (let index = 0; index < source.length;) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'code' && character === '/' && next === '/') {
      output += '  ';
      index += 2;
      state = 'line';
      continue;
    }
    if (state === 'code' && character === '/' && next === '*') {
      output += '  ';
      index += 2;
      state = 'block';
      continue;
    }
    if (state === 'code' && ['"', "'", '`'].includes(character)) {
      if (preserveUpdateStrings && character !== '`') {
        const literal = quotedLiteral(source, index, character);
        if (literal?.rawValue === 'update') {
          output += source.slice(index, literal.end + 1);
          index = literal.end + 1;
          continue;
        }
      }
      output += ' ';
      index += 1;
      quote = character;
      state = 'string';
      continue;
    }
    if (state === 'line') {
      output += character === '\n' ? '\n' : ' ';
      index += 1;
      if (character === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 2;
        state = 'code';
      } else {
        output += character === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }
    if (state === 'string') {
      if (character === '\\') {
        output += '  ';
        index += Math.min(2, source.length - index);
      } else {
        output += character === '\n' ? '\n' : ' ';
        index += 1;
        if (character === quote) state = 'code';
      }
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function updateAssignments(source) {
  const clean = scrub(source);
  const bracketClean = scrub(source, { preserveUpdateStrings: true });
  const directPatterns = [
    /\bgame\s*\.\s*update\s*=/g,
    /\bGame\s*\.\s*prototype\s*\.\s*update\s*=/g,
  ];
  const directCount = directPatterns.reduce(
    (count, pattern) => count + [...clean.matchAll(pattern)].length,
    0,
  );
  const bracketCount = [...bracketClean.matchAll(/\bgame\s*\[\s*(['"])update\1\s*\]\s*=/g)].length;
  return directCount + bracketCount;
}

function requiredTokens(source, tokens, path, failures) {
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${path}: missing required runtime ownership token ${token}`);
  }
}

export function verifyRuntimeCompositionProject({ projectRoot }) {
  const root = resolve(projectRoot);
  const sourceFiles = walk(join(root, 'src'))
    .filter((path) => path.endsWith('.js'))
    .map((path) => [slash(relative(root, path)), readFileSync(path, 'utf8')]);
  const sourceMap = new Map(sourceFiles);
  const failures = [];
  const assignments = [];

  for (const [path, source] of sourceFiles) {
    const count = updateAssignments(source);
    if (!count) continue;
    assignments.push(Object.freeze({ path, count }));
    if (!AUTHORIZED_UPDATE_ASSIGNMENTS[path]) {
      failures.push(`${path}: unauthorized assignment to authoritative game.update; register a named simulation delegate instead`);
    }
  }

  for (const path of Object.keys(AUTHORIZED_UPDATE_ASSIGNMENTS)) {
    const source = sourceMap.get(path);
    if (source === undefined) {
      failures.push(`${path}: inventoried runtime wrapper is missing`);
      continue;
    }
    if (!updateAssignments(source)) failures.push(`${path}: inventory says this module assigns game.update but no assignment was found`);
  }

  const mainPath = 'src/main.js';
  const main = sourceMap.get(mainPath);
  if (main === undefined) failures.push(`${mainPath}: composition root is missing`);
  else {
    requiredTokens(main, REQUIRED_MAIN_TOKENS, mainPath, failures);
    if (/\bwindow\s*\.\s*localStorage\b/.test(scrub(main))) {
      failures.push(`${mainPath}: acquire localStorage through acquireBrowserStorage()`);
    }
    if (/\bdispose[A-Z][A-Za-z0-9_]*\s*\(\s*\)\s*;/.test(scrub(main))) {
      failures.push(`${mainPath}: manual disposer sequence is forbidden; use application composition disposal`);
    }
  }

  const phasesPath = 'src/systems/simulation-phases.js';
  const phases = sourceMap.get(phasesPath);
  if (phases === undefined) failures.push(`${phasesPath}: authoritative phase owner is missing`);
  else requiredTokens(phases, REQUIRED_PHASE_TOKENS, phasesPath, failures);

  return Object.freeze({
    filesChecked: sourceFiles.length,
    assignments: Object.freeze(assignments.sort((left, right) => left.path.localeCompare(right.path))),
    failures: Object.freeze([...new Set(failures)].sort()),
  });
}
