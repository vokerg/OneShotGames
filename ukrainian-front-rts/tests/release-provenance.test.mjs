import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReleaseProvenance, verifyReleaseProvenance } from '../scripts/verify-release-provenance.mjs';

function manifest(records) {
  return { schema: 'fields-of-resolve.release-provenance', version: 1, records };
}

const base = [
  ['visual', 'art-src/manifest.json', 'scripts/verify-art-sources.mjs'],
  ['audio', 'assets/audio/release-qa.json', 'scripts/verify-audio-release-qa.mjs'],
  ['font', 'index.html', 'scripts/verify-release-provenance.mjs'],
  ['text', 'src/localization/', 'scripts/verify-localization.mjs'],
  ['reference', 'docs/', 'scripts/verify-campaign-art.mjs'],
  ['procedural-output', 'art-src/', 'scripts/verify-art-sources.mjs'],
].map(([kind, source, validator], index) => ({ id: `record-${index}`, kind, source, license: 'repository-license', redistribution: 'allowed', validator }));

test('release provenance accepts all required provenance domains', () => {
  assert.deepEqual(validateReleaseProvenance(manifest(base)), []);
});

test('release provenance filesystem gate validates the committed release manifest', async () => {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await verifyReleaseProvenance(projectRoot);
  assert.ok(result.recordCount >= 7);
  assert.deepEqual(result.kinds, ['audio', 'font', 'procedural-output', 'reference', 'text', 'visual']);
});

test('release provenance fails closed on missing license metadata', () => {
  const records = structuredClone(base);
  records[0].license = 'TBD';
  assert.match(validateReleaseProvenance(manifest(records)).join('\n'), /license must contain explicit metadata/);
});

test('release provenance rejects duplicate ids and missing domains', () => {
  const records = structuredClone(base.slice(0, -1));
  records[1].id = records[0].id;
  const errors = validateReleaseProvenance(manifest(records)).join('\n');
  assert.match(errors, /duplicate provenance id/);
  assert.match(errors, /missing required provenance kind: procedural-output/);
});
