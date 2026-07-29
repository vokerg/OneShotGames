import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyArchitectureProject } from './lib/architecture-verifier.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = verifyArchitectureProject({ projectRoot });

if (result.failures.length) {
  console.error('Architecture verification failed:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Architecture verification passed for ${result.filesChecked} JavaScript modules.`);
