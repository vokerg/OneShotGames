#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSpriteAtlasManifest } from '../src/render/sprite-atlas-manifest.js';
import { packSpriteAtlasFile } from './pack-sprite-atlas.mjs';
import { probeImageDimensions } from './lib/sprite-atlas-packer.mjs';
import { verifyUkrainianInfantryArt } from './verify-ukrainian-infantry-art.mjs';

export async function verifySpriteAtlases(projectRoot) {
  const root = resolve(projectRoot);
  const atlasDirectory = join(root, 'assets', 'atlases');
  const entries = (await readdir(atlasDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const sources = entries.filter((name) => name.endsWith('.source.json'));
  const manifests = entries.filter((name) => name.endsWith('.atlas.json'));
  if (!sources.length) throw new Error('No sprite atlas source specs found in assets/atlases.');
  if (!manifests.length) throw new Error('No generated sprite atlas manifests found in assets/atlases.');
  for (const source of sources) await packSpriteAtlasFile(join(atlasDirectory, source), { check: true });
  for (const name of manifests) {
    const path = join(atlasDirectory, name);
    const manifest = validateSpriteAtlasManifest(JSON.parse(await readFile(path, 'utf8')), { source: path });
    const imagePath = resolve(dirname(path), manifest.image.src);
    if (!['.svg', '.png'].includes(extname(imagePath).toLowerCase())) {
      throw new Error(`${path}: atlas image must be SVG or PNG.`);
    }
    const dimensions = await probeImageDimensions(imagePath);
    if (dimensions.width !== manifest.image.width || dimensions.height !== manifest.image.height) {
      throw new Error(`${path}: image dimensions ${dimensions.width}x${dimensions.height} do not match manifest ${manifest.image.width}x${manifest.image.height}.`);
    }
  }
  const ukrainianInfantry = await verifyUkrainianInfantryArt(root);
  return Object.freeze({ sources: sources.length, manifests: manifests.length, ukrainianInfantry });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifySpriteAtlases(projectRoot)
    .then(({ sources, manifests, ukrainianInfantry }) => console.log(
      `[sprite-atlas] verified ${sources} source spec(s), ${manifests} manifest(s), `
      + `${ukrainianInfantry.units} Ukrainian infantry identities`,
    ))
    .catch((error) => {
      console.error(`[sprite-atlas] ${error.message}`);
      process.exitCode = 1;
    });
}
