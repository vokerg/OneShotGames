import { resolve } from 'node:path';
import { verifyReleaseArtifact } from './lib/release-automation.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Expected artifact directory.');
const result = await verifyReleaseArtifact(resolve(directory), { expectedVersion: process.argv[3] ?? null });
console.log(`[artifact] ${result.productVersion} ${result.releaseId}: ${result.files} files, ${result.checksums} checksums`);
