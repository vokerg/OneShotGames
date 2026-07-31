import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const SCHEMA_EXPORTS = Object.freeze([
  'CONTENT_SCHEMA_VERSION',
  'CONTENT_SCHEMA_FAMILIES',
  'CONTENT_SCHEMAS',
]);

const REQUIRED_IMPORTS = Object.freeze({
  'src/main.js': ['./app/runtime.js', './input/battlefield-input.js'],
  'src/app/runtime.js': ['../core/fixed-step-clock.js'],
  'src/game.js': [
    './systems/objective-system.js',
    './systems/projectile-system.js',
    './systems/simulation-phases.js',
    './systems/wave-system.js',
  ],
});

const ALLOWED_IMPORTS = Object.freeze({
  core: new Set(['core']),
  schema: new Set(['core', 'schema']),
  config: new Set(['core', 'schema', 'config']),
  navigation: new Set(['core', 'navigation']),
  ai: new Set(['core', 'schema', 'config', 'ai']),
  systems: new Set(['core', 'schema', 'config', 'navigation', 'ai', 'systems']),
  game: new Set(['core', 'schema', 'config', 'ai', 'systems', 'game']),
  app: new Set(['core', 'schema', 'config', 'game', 'app']),
  input: new Set(['core', 'schema', 'config', 'input']),
  ui: new Set(['core', 'schema', 'config', 'ui']),
  render: new Set(['core', 'schema', 'config', 'render']),
  audio: new Set(['core', 'schema', 'config', 'audio']),
  main: new Set(['core', 'schema', 'config', 'ai', 'systems', 'game', 'app', 'input', 'ui', 'render', 'audio', 'main']),
});

const DOM_CHECKS = Object.freeze([
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['DOM constructor', /\b(?:HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas)\b/],
  ['DOM query/mutation', /\b(?:querySelector|querySelectorAll|getElementById|createElement)\s*\(/],
]);

const AUDIO_CHECKS = Object.freeze([
  ['Audio constructor', /\bnew\s+(?:window\s*\.\s*)?Audio\s*\(/],
  ['Web Audio context', /\b(?:new\s+)?(?:window\s*\.\s*)?(?:AudioContext|webkitAudioContext)\s*\(/],
  ['HTMLAudioElement', /\bHTMLAudioElement\b/],
  ['Web Audio decode', /\bdecodeAudioData\s*\(/],
  ['Web Audio media source', /\bcreateMediaElementSource\s*\(/],
]);

const slash = (value) => value.replaceAll('\\', '/');

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function importsOf(source) {
  const result = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) result.push(match[1]);
  }
  return [...new Set(result)];
}

function scrub(source) {
  let output = '';
  let state = 'code';
  let quote = '';
  for (let index = 0; index < source.length;) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code' && char === '/' && next === '/') {
      output += '  '; index += 2; state = 'line'; continue;
    }
    if (state === 'code' && char === '/' && next === '*') {
      output += '  '; index += 2; state = 'block'; continue;
    }
    if (state === 'code' && ['"', "'", '`'].includes(char)) {
      output += ' '; index += 1; quote = char; state = 'string'; continue;
    }
    if (state === 'line') {
      output += char === '\n' ? '\n' : ' ';
      index += 1;
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        output += '  '; index += 2; state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' '; index += 1;
      }
      continue;
    }
    if (state === 'string') {
      if (char === '\\') {
        output += '  '; index += Math.min(2, source.length - index);
      } else {
        output += char === '\n' ? '\n' : ' '; index += 1;
        if (char === quote) state = 'code';
      }
      continue;
    }
    output += char; index += 1;
  }
  return output;
}

function layerOf(path) {
  if (path === 'src/main.js') return 'main';
  if (path === 'src/game.js') return 'game';
  if (path === 'src/config.js' || path.startsWith('src/content/')) return 'config';
  if (path === 'src/content-schema.js') return 'schema';
  if (path === 'src/ui.js' || path.startsWith('src/ui/')) return 'ui';
  if (['src/render.js', 'src/art-pass.js', 'src/environment-art-pass.js'].includes(path) || path.startsWith('src/render/')) return 'render';
  for (const layer of ['core', 'navigation', 'systems', 'ai', 'app', 'input', 'audio']) {
    if (path.startsWith(`src/${layer}/`)) return layer;
  }
  return 'other';
}

function resolvedImport(sourcePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  let target = slash(normalize(join(dirname(sourcePath), specifier)));
  if (!extname(target)) target += '.js';
  return target;
}

function ownsDom(path) {
  return path === 'src/main.js' || path === 'src/ui.js' || path.startsWith('src/ui/') || path === 'src/render.js' ||
    path === 'src/art-pass.js' || path === 'src/environment-art-pass.js' ||
    path === 'src/app/runtime.js' || path.startsWith('src/input/') ||
    path.startsWith('src/render/') || path.startsWith('src/audio/');
}

function schemaDeclarations(source) {
  const clean = scrub(source);
  return SCHEMA_EXPORTS.filter((name) =>
    new RegExp(`\\b(?:const|let|var|class|function)\\s+${name}\\b`).test(clean));
}

export function verifyArchitectureProject({ projectRoot }) {
  const root = resolve(projectRoot);
  const files = new Map(walk(join(root, 'src')).filter((path) => path.endsWith('.js')).map((path) => [
    slash(relative(root, path)),
    readFileSync(path, 'utf8'),
  ]));
  const failures = [];

  for (const [path, source] of files) {
    const layer = layerOf(path);
    if (layer === 'other') failures.push(`${path}: source module has no declared architecture layer`);

    for (const specifier of importsOf(source)) {
      const target = resolvedImport(path, specifier);
      if (!target) {
        failures.push(`${path}: production source must use repository-relative imports: ${specifier}`);
        continue;
      }
      if (!target.startsWith('src/')) {
        failures.push(`${path}: production source cannot import outside src/: ${specifier}`);
        continue;
      }
      const targetLayer = layerOf(target);
      if (layer !== 'other' && !ALLOWED_IMPORTS[layer].has(targetLayer)) {
        failures.push(`${path}: ${layer} layer cannot import ${targetLayer} layer (${specifier})`);
      }
    }

    const clean = scrub(source);
    if (!ownsDom(path)) {
      for (const [label, pattern] of DOM_CHECKS) {
        if (pattern.test(clean)) failures.push(`${path}: direct DOM access is forbidden here (${label})`);
      }
    }
    if (!path.startsWith('src/audio/')) {
      for (const [label, pattern] of AUDIO_CHECKS) {
        if (pattern.test(clean)) failures.push(`${path}: direct audio access must be owned by src/audio/ (${label})`);
      }
    }
  }

  for (const [path, required] of Object.entries(REQUIRED_IMPORTS)) {
    const source = files.get(path);
    if (source === undefined) {
      failures.push(`${path}: required architecture entry point is missing`);
      continue;
    }
    const imports = new Set(importsOf(source));
    for (const specifier of required) {
      if (!imports.has(specifier)) failures.push(`${path}: missing required import ${specifier}`);
    }
  }

  const schemaPath = 'src/content-schema.js';
  const schema = files.get(schemaPath);
  if (schema === undefined) {
    failures.push(`${schemaPath}: required schema owner is missing`);
  } else {
    const owned = new Set(schemaDeclarations(schema));
    for (const name of SCHEMA_EXPORTS) {
      if (!owned.has(name)) failures.push(`${schemaPath}: missing schema owner declaration ${name}`);
    }
  }
  for (const [path, source] of files) {
    if (path === schemaPath) continue;
    const duplicates = schemaDeclarations(source);
    if (duplicates.length) failures.push(`${path}: schema ownership belongs to ${schemaPath}: ${duplicates.join(', ')}`);
  }

  return Object.freeze({
    filesChecked: files.size,
    failures: Object.freeze([...new Set(failures)].sort()),
  });
}
