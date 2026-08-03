#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildArtSources } from './build-art-sources.mjs';

export async function verifyArtSources(projectRoot) {
  return buildArtSources(projectRoot, { check: true });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyArtSources(projectRoot)
    .then(({ assetCount, frameCount }) => console.log(`[art-source] verified ${assetCount} asset(s) and ${frameCount} frame(s)`))
    .catch((error) => {
      console.error(`[art-source] ${error.message}`);
      process.exitCode = 1;
    });
}
