import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAudioReleaseLedger,
  validateReleaseProvenance,
  validateVisualSourceCatalog,
  verifyReleaseProvenance,
} from '../scripts/verify-release-provenance.mjs';

function manifest(records) {
  return {
    schema: 'fields-of-resolve.release-provenance',
    version: 1,
    policy: {
      requiredFields: ['id', 'kind', 'source', 'license', 'redistribution', 'validator'],
      allowedRedistribution: ['allowed', 'generated', 'repository-authored'],
      failClosed: true,
    },
    records,
  };
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

test('release provenance requires its fail-closed policy and declared metadata contract', () => {
  const candidate = manifest(base);
  candidate.policy.failClosed = false;
  candidate.policy.requiredFields = candidate.policy.requiredFields.filter((field) => field !== 'source');
  const errors = validateReleaseProvenance(candidate).join('\n');
  assert.match(errors, /policy\.failClosed must be true/);
  assert.match(errors, /policy\.requiredFields must include source/);
});

test('release provenance rejects unapproved redistribution status', () => {
  const records = structuredClone(base);
  records[0].redistribution = 'restricted';
  assert.match(validateReleaseProvenance(manifest(records)).join('\n'), /redistribution is not permitted: restricted/);
});

test('release provenance rejects duplicate ids and missing domains', () => {
  const records = structuredClone(base.slice(0, -1));
  records[1].id = records[0].id;
  const errors = validateReleaseProvenance(manifest(records)).join('\n');
  assert.match(errors, /duplicate provenance id/);
  assert.match(errors, /missing required provenance kind: procedural-output/);
});

test('visual provenance rejects nested missing licenses and untracked source frames', () => {
  const catalog = {
    schema: 'fields-of-resolve.art-source-catalog',
    assets: [{
      id: 'visual.test',
      provenance: { creator: 'repo', source: 'original', license: 'TBD', redistribution: 'allowed' },
      frames: [{ path: 'units/test.svg' }],
    }],
  };
  const errors = validateVisualSourceCatalog(catalog, ['units/test.svg', 'units/orphan.svg']).join('\n');
  assert.match(errors, /visual asset visual\.test missing provenance\.license/);
  assert.match(errors, /untracked visual source: units\/orphan\.svg/);
});

test('audio provenance rejects family-level missing source and license metadata', () => {
  const ledger = {
    schema: 'fields-of-resolve.audio-release-qa',
    families: [{ id: 'combat', sourcePath: '', license: 'unknown', redistribution: 'allowed' }],
  };
  const errors = validateAudioReleaseLedger(ledger).join('\n');
  assert.match(errors, /audio family combat missing sourcePath/);
  assert.match(errors, /audio family combat missing license/);
});
