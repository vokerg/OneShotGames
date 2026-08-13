import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReleaseArtifact, verifyReleaseArtifact } from './lib/release-automation.mjs';
import { smokeReleaseArtifact } from './smoke-release-artifact.mjs';
import { verifyReleaseProvenance } from './verify-release-provenance.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [version, notesArgument, outputArgument] = process.argv.slice(2);

if (!version || !notesArgument) {
  console.error('Usage: node scripts/build-release-artifact.mjs <semver> <release-notes.md> [output-directory]');
  process.exit(2);
}

const notesPath = resolve(projectRoot, notesArgument);
const outputRoot = resolve(projectRoot, outputArgument ?? `artifacts/releases/fields-of-resolve-${version}`);

await verifyReleaseProvenance(projectRoot);
const manifest = await buildReleaseArtifact({ projectRoot, outputRoot, version, notesPath });
const verified = await verifyReleaseArtifact(outputRoot, { expectedVersion: version });
const smoke = await smokeReleaseArtifact(outputRoot);

console.log(`[release] ${verified.productVersion} ${manifest.releaseId}: ${verified.files} payload files, ${verified.checksums} checksums`);
console.log(`[release] HTTP smoke passed ${smoke.requests} requests -> ${outputRoot}`);
