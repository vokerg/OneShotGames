import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleasePackage, verifyReleasePackage } from './lib/release-package.mjs';
import { verifyReleaseProvenance } from './verify-release-provenance.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(projectRoot, process.argv[2] ?? 'artifacts/release-package');
await verifyReleaseProvenance(projectRoot);
const manifest = await buildReleasePackage({ projectRoot, outputRoot });
const verified = await verifyReleasePackage(outputRoot);
console.log(`[release-package] ${verified.releaseId}: ${verified.files} files, ${verified.cached} offline cache entries -> ${outputRoot}`);
console.log(`[release-package] source inputs: ${manifest.sourceInventory.length}; provenance gate passed`);
