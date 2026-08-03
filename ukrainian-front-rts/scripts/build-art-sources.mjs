#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildArtSourceOutputs } from './lib/art-source-pipeline.mjs';

async function compare(path, expected) {
  let actual = null;
  try { actual = await readFile(path, 'utf8'); } catch { /* Missing output is stale. */ }
  if (actual !== expected) throw new Error(`Generated art source output is stale: ${path}`);
}

export async function buildArtSources(projectRoot, { catalog = 'art-src/manifest.json', check = false } = {}) {
  const outputs = await buildArtSourceOutputs(projectRoot, catalog);
  if (check) {
    await compare(outputs.manifestPath, outputs.manifest);
    await compare(outputs.contactSheetPath, outputs.contactSheet);
  } else {
    await mkdir(dirname(outputs.manifestPath), { recursive: true });
    await mkdir(dirname(outputs.contactSheetPath), { recursive: true });
    await writeFile(outputs.manifestPath, outputs.manifest);
    await writeFile(outputs.contactSheetPath, outputs.contactSheet);
  }
  return outputs;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowed = new Set(['--check']);
  if (args.some((argument) => argument.startsWith('--') && !allowed.has(argument))) {
    console.error('Usage: node scripts/build-art-sources.mjs [--check]');
    process.exitCode = 2;
  } else {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    buildArtSources(projectRoot, { check: args.includes('--check') })
      .then((result) => {
        const verb = args.includes('--check') ? 'verified' : 'wrote';
        console.log(`[art-source] ${verb} ${result.manifestPath}`);
        console.log(`[art-source] ${verb} ${result.contactSheetPath}`);
        console.log(`[art-source] ${result.assetCount} asset(s), ${result.frameCount} frame(s)`);
      })
      .catch((error) => {
        console.error(`[art-source] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
