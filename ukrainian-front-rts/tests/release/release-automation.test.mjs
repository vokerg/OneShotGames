import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseChecksums,
  validateChangelog,
  validateProductVersion,
  validateReleaseNotes,
} from '../../scripts/lib/release-automation.mjs';

const version = '1.2.3-rc.4';
const notes = `# Fields of Resolve ${version}\n\n## Highlights\n\n- Release candidate.\n\n## Verification\n\n- Automated gates passed.\n\n## Known issues\n\n- None known.\n\n## Rollback\n\n- Redeploy the previous verified artifact.\n`;

test('UFR-158 accepts a versioned changelog and complete release notes', () => {
  assert.equal(validateProductVersion(version), version);
  assert.equal(validateChangelog(`# Changelog\n\n## [${version}] - 2026-08-13\n`, version), true);
  assert.equal(validateReleaseNotes(notes, version), true);
});

test('UFR-158 release notes fail closed on template placeholders', () => {
  assert.throws(
    () => validateReleaseNotes(notes.replace('Release candidate.', 'TODO'), version),
    /template placeholders/,
  );
});

test('UFR-158 changelog rejects a version that was not recorded', () => {
  assert.throws(
    () => validateChangelog('# Changelog\n\n## [1.2.2] - 2026-08-13\n', version),
    /missing a release heading/,
  );
});

test('UFR-158 checksum parser rejects malformed and duplicate entries', () => {
  const digest = 'a'.repeat(64);
  assert.deepEqual([...parseChecksums(`${digest}  package/index.html\n`).entries()], [['package/index.html', digest]]);
  assert.throws(() => parseChecksums('not-a-checksum  package/index.html\n'), /Malformed checksum/);
  assert.throws(
    () => parseChecksums(`${digest}  package/index.html\n${digest}  package/index.html\n`),
    /Duplicate checksum path/,
  );
});
