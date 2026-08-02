import { resolve } from 'node:path';

import { verifyRuntimeCompositionProject } from './lib/runtime-composition-verifier.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const result = verifyRuntimeCompositionProject({ projectRoot });

if (result.failures.length) {
  console.error(`[runtime-composition] ${result.failures.length} failure(s)`);
  for (const failure of result.failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `[runtime-composition] passed ${result.filesChecked} source files; ` +
    `${result.assignments.length} inventoried update-assignment modules`,
  );
}
