import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleasePackage, compareReleaseTrees, verifyReleasePackage } from './lib/release-package.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'ufr-release-package-'));
const first = join(temporaryRoot, 'first');
const second = join(temporaryRoot, 'second');
try {
  const firstManifest = await buildReleasePackage({ projectRoot, outputRoot: first });
  const secondManifest = await buildReleasePackage({ projectRoot, outputRoot: second });
  if (firstManifest.releaseId !== secondManifest.releaseId) {
    throw new Error(`Release package is not reproducible: ${firstManifest.releaseId} != ${secondManifest.releaseId}`);
  }
  if (!(await compareReleaseTrees(first, second))) {
    throw new Error('Release package is not byte-for-byte reproducible across consecutive builds.');
  }
  const result = await verifyReleasePackage(first);
  console.log(`[release-package] verified ${result.releaseId}: ${result.files} files, ${result.cached} offline cache entries; reproducible build passed`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
