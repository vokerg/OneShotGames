#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadSpriteAtlasSource,
  renderSpriteAtlasSvg,
  serializeSpriteAtlasManifest,
} from './lib/sprite-atlas-packer.mjs';

function usage() {
  console.error('Usage: node scripts/pack-sprite-atlas.mjs <source.json> [--check]');
}

async function compare(path, expected) {
  let actual = null;
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    // Missing generated output is stale.
  }
  if (actual !== expected) throw new Error(`Generated sprite atlas output is stale: ${path}`);
}

export async function packSpriteAtlasFile(sourcePath, { check = false } = {}) {
  const absoluteSource = resolve(sourcePath);
  const layout = await loadSpriteAtlasSource(absoluteSource);
  const sourceDirectory = dirname(absoluteSource);
  const imagePath = resolve(sourceDirectory, layout.source.output.image);
  const manifestPath = resolve(sourceDirectory, layout.source.output.manifest);
  const image = await renderSpriteAtlasSvg(layout);
  const manifest = serializeSpriteAtlasManifest(layout.manifest);
  if (check) {
    await compare(imagePath, image);
    await compare(manifestPath, manifest);
  } else {
    await mkdir(dirname(imagePath), { recursive: true });
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(imagePath, image);
    await writeFile(manifestPath, manifest);
  }
  return Object.freeze({ imagePath, manifestPath, manifest: layout.manifest });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sourcePath = args.find((argument) => !argument.startsWith('--'));
  if (!sourcePath || args.some((argument) => !['--check', sourcePath].includes(argument))) {
    usage();
    process.exitCode = 2;
  } else {
    packSpriteAtlasFile(sourcePath, { check: args.includes('--check') })
      .then(({ imagePath, manifestPath }) => {
        console.log(`[sprite-atlas] ${args.includes('--check') ? 'verified' : 'wrote'} ${manifestPath}`);
        console.log(`[sprite-atlas] ${args.includes('--check') ? 'verified' : 'wrote'} ${imagePath}`);
      })
      .catch((error) => {
        console.error(`[sprite-atlas] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
