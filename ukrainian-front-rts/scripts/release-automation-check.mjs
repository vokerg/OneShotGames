import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReleaseArtifact, validateReleaseNotes, verifyReleaseArtifact } from './lib/release-automation.mjs';
import { smokeReleaseArtifact } from './smoke-release-artifact.mjs';
import { verifyReleaseProvenance } from './verify-release-provenance.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '0.0.0-dev.158';
const temporaryRoot = await mkdtemp(join(tmpdir(), 'ufr-release-check-'));
const notesPath = join(temporaryRoot, 'release-notes.md');
const artifactRoot = join(temporaryRoot, 'artifact');
const notes = `# Fields of Resolve ${version}\n\n## Highlights\n\n- UFR-158 verification fixture.\n\n## Verification\n\n- Automated release gates run from verify.sh.\n\n## Known issues\n\n- Development fixture only; no release-candidate sign-off.\n\n## Rollback\n\n- Reuse a previously verified complete artifact.\n`;

try {
  validateReleaseNotes(notes, version);
  await writeFile(notesPath, notes);
  await verifyReleaseProvenance(projectRoot);
  const built = await buildReleaseArtifact({ projectRoot, outputRoot: artifactRoot, version, notesPath });
  const verified = await verifyReleaseArtifact(artifactRoot, { expectedVersion: version });
  const smoke = await smokeReleaseArtifact(artifactRoot);
  if (built.releaseId !== verified.releaseId || verified.releaseId !== smoke.releaseId) throw new Error('Release ID drifted across stages.');
  console.log(`[release-check] ${version} ${verified.releaseId}: ${verified.checksums} checksums, ${smoke.requests} HTTP checks`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
