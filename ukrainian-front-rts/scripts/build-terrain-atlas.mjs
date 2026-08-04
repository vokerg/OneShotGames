#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateTerrainAtlas } from './lib/terrain-atlas-generator.mjs';

async function compare(path, expected) {
  let actual = null;
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    // Missing output is stale.
  }
  if (actual !== expected) throw new Error(`Generated terrain atlas output is stale: ${path}`);
}

export async function buildTerrainAtlas(projectRoot, { check = false } = {}) {
  const root = resolve(projectRoot);
  const output = generateTerrainAtlas();
  const manifestPath = resolve(root, 'assets/atlases/terrain.atlas.json');
  const imagePath = resolve(root, 'assets/atlases/terrain.svg');
  if (check) {
    await compare(manifestPath, output.manifest);
    await compare(imagePath, output.svg);
  } else {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, output.manifest);
    await writeFile(imagePath, output.svg);
  }
  return Object.freeze({ ...output, manifestPath, imagePath });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--check')) {
    console.error('Usage: node scripts/build-terrain-atlas.mjs [--check]');
    process.exitCode = 2;
  } else {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    buildTerrainAtlas(root, { check: args.includes('--check') })
      .then((result) => {
        const verb = args.includes('--check') ? 'verified' : 'wrote';
        console.log(`[terrain-atlas] ${verb} ${result.frameCount} frames at ${result.width}x${result.height}`);
      })
      .catch((error) => {
        console.error(`[terrain-atlas] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
