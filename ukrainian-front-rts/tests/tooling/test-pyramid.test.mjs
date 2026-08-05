import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { TEST_PYRAMID, auditTestPyramid } from '../../scripts/lib/test-pyramid.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED_LAYERS = [
  'pure-logic',
  'systems',
  'headless-scenarios',
  'save-round-trips',
  'content-validation',
  'browser-smoke',
];

test('test pyramid exposes every release-quality layer exactly once', () => {
  assert.deepEqual(TEST_PYRAMID.map(({ id }) => id), REQUIRED_LAYERS);
  assert.equal(new Set(TEST_PYRAMID.map(({ id }) => id)).size, REQUIRED_LAYERS.length);
  for (const layer of TEST_PYRAMID) {
    assert.equal(Object.isFrozen(layer), true);
    assert.equal(Object.isFrozen(layer.command), true);
    assert.ok(layer.purpose.length > 20);
    assert.ok(layer.evidence.length > 0);
  }
});

test('current repository satisfies the test pyramid evidence contract', () => {
  const result = auditTestPyramid(projectRoot);
  assert.equal(result.status, 0, result.errors.join('\n'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.layers.length, REQUIRED_LAYERS.length);

  for (const layer of result.layers.filter(({ id }) => id !== 'content-validation' && id !== 'browser-smoke')) {
    assert.ok(layer.discoveredTests > 0, `${layer.id} must discover at least one test file`);
  }
});

test('save and browser layers retain their release-critical commands and diagnostics', () => {
  const saves = TEST_PYRAMID.find(({ id }) => id === 'save-round-trips');
  const browser = TEST_PYRAMID.find(({ id }) => id === 'browser-smoke');

  assert.deepEqual(saves.command, ['node', 'scripts/run-tests.mjs', 'campaign-save']);
  assert.ok(saves.evidence.includes('tests/campaign/campaign-save-service.test.mjs'));
  assert.ok(saves.evidence.includes('tests/campaign/campaign-save-runtime.test.mjs'));

  assert.deepEqual(browser.command, ['node', 'scripts/browser-startup-smoke.mjs']);
  assert.ok(browser.artifacts.includes('artifacts/browser-startup-smoke.json'));
  assert.ok(browser.artifacts.some((path) => path.endsWith('.png')));
  assert.ok(browser.artifacts.some((path) => path.endsWith('.log')));
});
