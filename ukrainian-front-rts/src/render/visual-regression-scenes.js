import { UNIT_TYPES } from '../config.js';
import { BUILDING_ATLAS_IDS } from './building-atlas.js';
import { TERRAIN_BIOME_PROFILES, TERRAIN_VISUAL_FAMILIES } from './terrain-tile-system.js';
import { EFFECT_ATLAS_FAMILIES } from './effects-atlas-contract.js';

export const VISUAL_REGRESSION_SCHEMA = 'fields-of-resolve.visual-regression-scenes';
export const VISUAL_REGRESSION_VERSION = 1;
export const VISUAL_REGRESSION_FACTIONS = Object.freeze(['Ukraine', 'Russia']);
export const VISUAL_REGRESSION_UI_SCREENS = Object.freeze([
  'startMenu',
  'gameHUD',
  'campaignFlow',
  'campaignDebrief',
  'skirmishOverlay',
  'pauseScreen',
  'settingsScreen',
  'helpScreen',
  'techTree',
]);
export const VISUAL_REGRESSION_ZOOMS = Object.freeze([
  Object.freeze({ id: 'overview', scale: 0.75 }),
  Object.freeze({ id: 'standard', scale: 1 }),
  Object.freeze({ id: 'detail', scale: 1.5 }),
]);
export const VISUAL_REGRESSION_DISPLAY_MODES = Object.freeze([
  'color',
  'grayscale',
  'protanopia',
  'deuteranopia',
  'tritanopia',
]);

function stable(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function scene(category, id, payload = {}) {
  return Object.freeze({ category, id: `${category}:${id}`, ...payload });
}

function factionName(id) {
  return id === 'ukraine' ? 'Ukraine' : id === 'russia' ? 'Russia' : id;
}

export function createVisualRegressionScenes() {
  const unitIds = stable(Object.keys(UNIT_TYPES));
  const biomeIds = stable(Object.keys(TERRAIN_BIOME_PROFILES));
  const tileFamilies = stable(TERRAIN_VISUAL_FAMILIES);
  const effectFamilies = stable(EFFECT_ATLAS_FAMILIES);
  const buildingScenes = Object.entries(BUILDING_ATLAS_IDS)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([factionId, buildingIds]) =>
      stable(buildingIds).map((buildingId) => scene('building', `${factionId}/${buildingId}`, {
        faction: factionName(factionId),
        buildingId,
      })),
    );

  const scenes = [
    ...VISUAL_REGRESSION_FACTIONS.flatMap((faction) =>
      unitIds.map((unitId) => scene('unit', `${faction.toLowerCase()}/${unitId}`, { faction, unitId })),
    ),
    ...buildingScenes,
    ...biomeIds.flatMap((biomeId) =>
      tileFamilies.map((tileId) => scene('terrain', `${biomeId}/${tileId}`, { biomeId, tileId })),
    ),
    ...effectFamilies.map((effectFamily) => scene('effect', effectFamily, { effectFamily })),
    ...VISUAL_REGRESSION_UI_SCREENS.map((screenId) => scene('ui', screenId, { screenId })),
    ...VISUAL_REGRESSION_ZOOMS.map(({ id, scale }) => scene('zoom', id, { zoomId: id, scale })),
    ...VISUAL_REGRESSION_DISPLAY_MODES.map((displayMode) => scene('display', displayMode, { displayMode })),
  ];

  return Object.freeze({ schema: VISUAL_REGRESSION_SCHEMA, version: VISUAL_REGRESSION_VERSION, scenes: Object.freeze(scenes) });
}

export function summarizeVisualRegressionScenes(catalog = createVisualRegressionScenes()) {
  const categories = {};
  for (const entry of catalog.scenes) categories[entry.category] = (categories[entry.category] ?? 0) + 1;
  return Object.freeze({ total: catalog.scenes.length, categories: Object.freeze(categories) });
}

export function validateVisualRegressionScenes(catalog = createVisualRegressionScenes()) {
  if (catalog?.schema !== VISUAL_REGRESSION_SCHEMA || catalog?.version !== VISUAL_REGRESSION_VERSION) throw new TypeError('Unsupported visual-regression scene catalog.');
  if (!Array.isArray(catalog.scenes) || !catalog.scenes.length) throw new TypeError('Visual-regression scenes must be non-empty.');
  const ids = new Set();
  for (const entry of catalog.scenes) {
    if (!entry?.id || !entry.category) throw new TypeError('Every visual-regression scene requires an id and category.');
    if (ids.has(entry.id)) throw new TypeError(`Duplicate visual-regression scene id ${entry.id}.`);
    ids.add(entry.id);
  }
  if (JSON.stringify(catalog) !== JSON.stringify(createVisualRegressionScenes())) throw new TypeError('Visual-regression scene catalog is not deterministic.');
  return catalog;
}
