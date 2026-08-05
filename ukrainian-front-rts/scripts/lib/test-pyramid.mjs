import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REQUIRED_LAYER_IDS = Object.freeze([
  'pure-logic',
  'systems',
  'headless-scenarios',
  'save-round-trips',
  'content-validation',
  'browser-smoke',
]);

function layer(definition) {
  return Object.freeze({
    ...definition,
    command: Object.freeze([...definition.command]),
    evidence: Object.freeze([...definition.evidence]),
    testRoots: Object.freeze([...(definition.testRoots ?? [])]),
    artifacts: Object.freeze([...(definition.artifacts ?? [])]),
  });
}

export const TEST_PYRAMID = Object.freeze([
  layer({
    id: 'pure-logic',
    label: 'Pure logic',
    purpose: 'Fast deterministic functions and public state transitions without DOM, canvas, network, or wall-clock dependencies.',
    execution: 'verify.sh',
    command: ['node', 'scripts/run-tests.mjs', 'unit'],
    evidence: ['tests/unit/math.test.mjs', 'tests/unit/costs.test.mjs', 'tests/unit/objectives.test.mjs'],
    testRoots: ['tests/unit'],
  }),
  layer({
    id: 'systems',
    label: 'Systems',
    purpose: 'Deterministic subsystem behavior across combat, economy, navigation, AI, input, campaign, and application adapters.',
    execution: 'verify.sh',
    command: ['node', 'scripts/run-tests.mjs', 'combat', 'economy', 'navigation', 'ai', 'campaign'],
    evidence: ['tests/combat', 'tests/economy', 'tests/navigation', 'tests/ai', 'tests/campaign'],
    testRoots: ['tests/combat', 'tests/economy', 'tests/navigation', 'tests/ai', 'tests/campaign'],
  }),
  layer({
    id: 'headless-scenarios',
    label: 'Headless scenarios',
    purpose: 'Seeded whole-scenario tests that issue public commands and advance fixed simulation ticks without a browser.',
    execution: 'verify.sh',
    command: ['node', 'scripts/run-tests.mjs', 'sim'],
    evidence: ['tests/sim', 'src/app/simulation-harness.js'],
    testRoots: ['tests/sim'],
  }),
  layer({
    id: 'save-round-trips',
    label: 'Save round trips',
    purpose: 'Versioned campaign save envelopes, storage adapters, corruption handling, and reference-free restore transactions.',
    execution: 'verify.sh',
    command: ['node', 'scripts/run-tests.mjs', 'campaign-save'],
    evidence: [
      'tests/campaign/campaign-save-service.test.mjs',
      'tests/campaign/campaign-save-runtime.test.mjs',
      'src/core/campaign-save-service.js',
      'src/app/campaign-save-runtime.js',
    ],
    testRoots: ['tests/campaign'],
  }),
  layer({
    id: 'content-validation',
    label: 'Content validation',
    purpose: 'Schema, reference, technology graph, production-content, and runtime reconciliation gates with actionable failures.',
    execution: 'verify.sh',
    command: ['node', 'scripts/verify-content.mjs'],
    evidence: [
      'scripts/verify-content-schema.mjs',
      'scripts/content-validator.test.mjs',
      'scripts/verify-content.mjs',
      'scripts/verify-tech-content.mjs',
      'scripts/verify-runtime-content.mjs',
    ],
  }),
  layer({
    id: 'browser-smoke',
    label: 'Browser smoke',
    purpose: 'Chromium launch, mission selection/start, modal menu isolation, settings persistence, focus restoration, and runtime error capture.',
    execution: 'github-actions',
    command: ['node', 'scripts/browser-startup-smoke.mjs'],
    evidence: ['scripts/browser-startup-smoke.mjs', '../.github/workflows/ukrainian-front-rts-verify.yml'],
    artifacts: [
      'artifacts/browser-startup-smoke.json',
      'artifacts/browser-startup-failure.png',
      'artifacts/browser-startup.log',
    ],
  }),
]);

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function projectPath(projectRoot, path) {
  return resolve(projectRoot, path);
}

function countTests(projectRoot, roots) {
  return roots
    .flatMap((root) => walk(projectPath(projectRoot, root)))
    .filter((path) => path.endsWith('.test.mjs'))
    .length;
}

export function auditTestPyramid(projectRoot) {
  if (!projectRoot) throw new TypeError('Test pyramid audit requires a projectRoot.');

  const root = resolve(projectRoot);
  const errors = [];
  const ids = TEST_PYRAMID.map(({ id }) => id);
  const uniqueIds = new Set(ids);

  for (const requiredId of REQUIRED_LAYER_IDS) {
    if (!uniqueIds.has(requiredId)) errors.push(`Missing required test layer: ${requiredId}.`);
  }
  if (uniqueIds.size !== ids.length) errors.push('Test pyramid layer IDs must be unique.');

  const reports = TEST_PYRAMID.map((definition) => {
    if (!definition.command.length || definition.command[0] !== 'node') {
      errors.push(`${definition.id}: command must be an explicit Node invocation.`);
    }
    if (!definition.purpose.trim()) errors.push(`${definition.id}: purpose must be documented.`);
    if (!definition.evidence.length) errors.push(`${definition.id}: at least one evidence path is required.`);

    const missingEvidence = definition.evidence.filter((path) => !existsSync(projectPath(root, path)));
    for (const path of missingEvidence) errors.push(`${definition.id}: missing evidence path ${path}.`);

    const discoveredTests = countTests(root, definition.testRoots);
    if (definition.testRoots.length && discoveredTests === 0) {
      errors.push(`${definition.id}: no tests discovered under ${definition.testRoots.join(', ')}.`);
    }

    return Object.freeze({
      id: definition.id,
      execution: definition.execution,
      discoveredTests,
      missingEvidence: Object.freeze([...missingEvidence]),
    });
  });

  const workflowPath = resolve(root, '..', '.github', 'workflows', 'ukrainian-front-rts-verify.yml');
  if (existsSync(workflowPath)) {
    const workflow = readFileSync(workflowPath, 'utf8');
    if (!workflow.includes('node scripts/browser-startup-smoke.mjs')) {
      errors.push('browser-smoke: GitHub Actions must execute scripts/browser-startup-smoke.mjs.');
    }
    if (!workflow.includes('ukrainian-front-rts/artifacts/')) {
      errors.push('browser-smoke: GitHub Actions must upload the browser diagnostics directory.');
    }
  }

  return Object.freeze({
    status: errors.length ? 1 : 0,
    errors: Object.freeze([...errors]),
    layers: Object.freeze(reports),
    projectRoot: relative(process.cwd(), root) || '.',
  });
}
