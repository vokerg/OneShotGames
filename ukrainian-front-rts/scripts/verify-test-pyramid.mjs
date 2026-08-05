import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditTestPyramid } from './lib/test-pyramid.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = auditTestPyramid(projectRoot);

for (const layer of result.layers) {
  const count = layer.discoveredTests ? `; ${layer.discoveredTests} discovered test file(s)` : '';
  console.log(`[test-pyramid] ${layer.id}: ${layer.execution}${count}`);
}

if (result.errors.length) {
  for (const error of result.errors) console.error(`[test-pyramid] ${error}`);
  process.exit(1);
}

console.log(`[test-pyramid] passed ${result.layers.length} required layers`);
