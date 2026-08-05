#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UNIT_TYPES } from '../src/config.js';
import { BUILDING_ATLAS_IDS } from '../src/render/building-atlas.js';
import { TERRAIN_BIOME_PROFILES, TERRAIN_VISUAL_FAMILIES } from '../src/render/terrain-tile-system.js';
import { EFFECT_ATLAS_FAMILIES } from '../src/render/effects-atlas-contract.js';
import {
  VISUAL_REGRESSION_DISPLAY_MODES,
  VISUAL_REGRESSION_FACTIONS,
  VISUAL_REGRESSION_UI_SCREENS,
  VISUAL_REGRESSION_ZOOMS,
  createVisualRegressionScenes,
  summarizeVisualRegressionScenes,
  validateVisualRegressionScenes,
} from '../src/render/visual-regression-scenes.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireIds(catalog, category, expected) {
  const actual = new Set(catalog.scenes.filter((entry) => entry.category === category).map((entry) => entry.id));
  for (const id of expected) assert(actual.has(`${category}:${id}`), `Missing ${category} scene ${id}.`);
  assert(actual.size === expected.length, `${category} scene count drifted: expected ${expected.length}, found ${actual.size}.`);
}

export async function verifyVisualRegression(projectRoot) {
  const root = resolve(projectRoot);
  const catalog = validateVisualRegressionScenes(createVisualRegressionScenes());
  const unitIds = Object.keys(UNIT_TYPES).sort();
  const biomeIds = Object.keys(TERRAIN_BIOME_PROFILES).sort();
  const tileFamilies = [...TERRAIN_VISUAL_FAMILIES].sort();
  const buildingScenes = Object.entries(BUILDING_ATLAS_IDS)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([factionId, buildingIds]) => [...buildingIds].sort().map((buildingId) => `${factionId}/${buildingId}`));

  requireIds(catalog, 'unit', VISUAL_REGRESSION_FACTIONS.flatMap((faction) => unitIds.map((unitId) => `${faction.toLowerCase()}/${unitId}`)));
  requireIds(catalog, 'building', buildingScenes);
  requireIds(catalog, 'terrain', biomeIds.flatMap((biomeId) => tileFamilies.map((tileId) => `${biomeId}/${tileId}`)));
  requireIds(catalog, 'effect', [...EFFECT_ATLAS_FAMILIES].sort());
  requireIds(catalog, 'ui', [...VISUAL_REGRESSION_UI_SCREENS]);
  requireIds(catalog, 'zoom', VISUAL_REGRESSION_ZOOMS.map(({ id }) => id));
  requireIds(catalog, 'display', [...VISUAL_REGRESSION_DISPLAY_MODES]);

  const [html, css, runtime] = await Promise.all([
    readFile(resolve(root, 'visual-regression.html'), 'utf8'),
    readFile(resolve(root, 'visual-regression.css'), 'utf8'),
    readFile(resolve(root, 'src/render/visual-regression.js'), 'utf8'),
  ]);
  assert(html.includes('id="sceneGrid"'), 'Visual-regression page is missing the scene grid.');
  assert(html.includes('src/render/visual-regression.js'), 'Visual-regression page is missing its render-layer entrypoint.');
  assert(css.includes('grid-template-columns: repeat(12'), 'Visual-regression grid must fit the complete catalog in a review capture.');
  assert(runtime.includes("dataset.visualRegressionReady = 'true'"), 'Visual-regression runtime must expose a deterministic ready signal.');
  assert(runtime.includes('window.__visualRegression'), 'Visual-regression runtime must expose diagnostics for browser verification.');

  return summarizeVisualRegressionScenes(catalog);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyVisualRegression(projectRoot)
    .then(({ total, categories }) => console.log(`[visual-regression] verified ${total} deterministic scenes: ${JSON.stringify(categories)}`))
    .catch((error) => { console.error(`[visual-regression] ${error.message}`); process.exitCode = 1; });
}
