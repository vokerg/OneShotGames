import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const matrix = JSON.parse(await readFile(resolve(root, 'release/browser-qa-matrix.json'), 'utf8'));

const REQUIRED_BROWSERS = ['chrome', 'edge', 'firefox', 'safari'];
const REQUIRED_SURFACES = ['keyboard', 'audio', 'canvas', 'storage', 'fullscreen', 'dpi', 'performance'];

test('UFR-154 matrix covers every required browser and QA surface', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.task, 'UFR-154');
  assert.deepEqual(matrix.surfaces, REQUIRED_SURFACES);
  assert.deepEqual(matrix.browsers.map((browser) => browser.id), REQUIRED_BROWSERS);
});

test('UFR-154 completion preserves the maintainer waiver boundary', () => {
  assert.equal(matrix.taskState, 'completed-with-waiver');
  assert.equal(matrix.highestEvidenceLevel, 'CONTRACT_COMPLETE');
  assert.equal(matrix.correctiveIssue, 245);
  assert.equal(matrix.waiverFollowUpIssue, 249);
  assert.deepEqual(matrix.deferredBrowserEvidence, ['edge', 'firefox', 'safari']);
  assert.deepEqual(matrix.knownVisualDefects, [242, 243, 244]);
  assert.equal(
    existsSync(resolve(root, 'tasks/completed/UFR-154.md')),
    true,
    'UFR-154 completion marker must exist when the waiver-backed task state is completed',
  );
});

test('automated browser coverage names evidence for every required surface', () => {
  const automated = matrix.browsers.filter((browser) => browser.verification === 'automated-ci');
  assert.ok(automated.length > 0, 'at least one browser must have automated CI evidence');

  for (const browser of automated) {
    for (const surface of REQUIRED_SURFACES) {
      assert.ok(Array.isArray(browser.evidence?.[surface]), `${browser.id}.${surface} evidence must be an array`);
      assert.ok(browser.evidence[surface].length > 0, `${browser.id}.${surface} must name concrete evidence`);
      assert.ok(browser.evidence[surface].every((entry) => typeof entry === 'string' && entry.trim()), `${browser.id}.${surface} evidence entries must be non-empty strings`);
    }
  }
});

test('manual browser rows fail closed with an explicit exception and procedure', () => {
  const manual = matrix.browsers.filter((browser) => browser.verification === 'manual-release');
  assert.deepEqual(manual.map((browser) => browser.id), ['edge', 'firefox', 'safari']);
  assert.deepEqual(matrix.deferredBrowserEvidence, manual.map((browser) => browser.id));

  for (const browser of manual) {
    assert.match(browser.exception, /outstanding|tracked|CI|runner|harness|available/i, `${browser.id} must explain why headed evidence remains outstanding`);
    assert.match(browser.procedure, /seven required surfaces|BROWSER_QA_MATRIX\.md/i, `${browser.id} must provide a release verification procedure`);
    assert.equal(browser.evidence, undefined, `${browser.id} must not claim automated evidence that was not executed`);
  }
});
