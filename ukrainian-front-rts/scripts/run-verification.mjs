import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runVerificationPlan } from './lib/verification-runner.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const result = runVerificationPlan({ projectRoot });
  if (result.status !== 0) process.exit(result.status);
} catch (error) {
  console.error(`[verify] unexpected failure: ${error.stack || error.message}`);
  process.exit(1);
}
