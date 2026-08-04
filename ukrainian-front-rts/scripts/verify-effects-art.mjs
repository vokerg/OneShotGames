#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEffectsAtlasManifestFromSource,
  validateEffectsAtlasManifest,
} from '../src/render/effects-atlas-contract.js';
import {
  EFFECTS_ATLAS_IMAGE_PATH,
  EFFECTS_ATLAS_SOURCE_PATH,
  EFFECTS_CATALOG_PATH,
  buildEffectsArtifacts,
} from './build-effects-art.mjs';
import { validateArtSourceCatalog } from './lib/art-source-contract.mjs';
import { inspectSvgSource } from './lib/art-source-image.mjs';

function equalJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label}: checked source does not match deterministic generation.`);
  }
}

async function exactFile(root, relativePath, expected) {
  const actual = await readFile(resolve(root, relativePath), 'utf8');
  if (actual !== expected) throw new Error(`${relativePath}: checked runtime output is stale.`);
}

function verifyRecipeFrames(artifacts) {
  const catalog = validateArtSourceCatalog(artifacts.catalog, { source: EFFECTS_CATALOG_PATH });
  const asset = catalog.assets[0];
  const sourceByRuntimeId = new Map(artifacts.sourceFrames.map((entry) => [entry.runtimeId, entry]));
  const atlasFrames = new Map(artifacts.atlasSource.frames.map((entry) => [entry.id, entry]));
  const allowed = catalog.paletteTokens;

  for (const frame of asset.frames) {
    const source = sourceByRuntimeId.get(frame.runtimeId);
    if (!source) throw new TypeError(`Missing deterministic source recipe ${frame.runtimeId}.`);
    const inspected = inspectSvgSource(source.content, { source: frame.path });
    if (inspected.width !== frame.canvas.width || inspected.height !== frame.canvas.height) {
      throw new TypeError(`${frame.path}: generated dimensions drifted.`);
    }
    const permitted = new Set(frame.paletteTokens.map((token) => allowed[token]));
    for (const color of inspected.colors) {
      if (!permitted.has(color)) throw new TypeError(`${frame.path}: undeclared palette color ${color}.`);
    }
    const atlasFrame = atlasFrames.get(frame.runtimeId);
    if (!atlasFrame || atlasFrame.source !== `../../art-src/${frame.path}`) {
      throw new TypeError(`${frame.path}: atlas source handoff drifted.`);
    }
    if (atlasFrame.anchor?.x !== frame.anchor.x || atlasFrame.anchor?.y !== frame.anchor.y) {
      throw new TypeError(`${frame.path}: atlas anchor handoff drifted.`);
    }
  }
  return catalog;
}

export async function verifyEffectsArt(projectRoot) {
  const root = resolve(projectRoot);
  const artifacts = buildEffectsArtifacts();
  const catalog = verifyRecipeFrames(artifacts);

  equalJson(JSON.parse(await readFile(resolve(root, EFFECTS_CATALOG_PATH), 'utf8')), artifacts.catalog, EFFECTS_CATALOG_PATH);
  equalJson(JSON.parse(await readFile(resolve(root, EFFECTS_ATLAS_SOURCE_PATH), 'utf8')), artifacts.atlasSource, EFECTTS_ATLAS_SOURCE_PATH);
  await exactFile(root, EFFECTS_ATLAS_IMAGE_PATH, artifacts.files[EFFECTS_ATLAS_IMAGE_PATH]);

  const derivedManifest = createEffectsAtlasManifestFromSource(artifacts.atlasSource, { source: EFFECTS_ATLAS_SOURCE_PATH });
  equalJson(derivedManifest, artifacts.manifest, 'derived effects atlas manifest');
  const manifest = validateEffectsAtlasManifest(derivedManifest, { source: EFFECTS_ATLAS_SOURCE_PATH });
  return Object.freeze({
    families: artifacts.summary.families,
    frames: artifacts.summary.frames,
    assets: catalog.assets.length,
    atlasId: manifest.id,
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyEffectsArt(projectRoot)
    .then(({ families, frames, assets, atlasId }) => console.log(`[effects-art] verified ${atlasId}: ${assets} asset, ${families} families, ${frames} frames`))
    .catch((error) => { console.error(`[effects-art] ${error.message}`); process.exitCode = 1; });
}
