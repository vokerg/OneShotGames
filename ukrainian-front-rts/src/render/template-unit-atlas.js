import { loadSpriteAtlas } from './sprite-atlas-runtime.js';

export const TEMPLATE_UNIT_ID = 'template.pathfinder-car';
export const TEMPLATE_UNIT_ATLAS_URL = new URL('../../assets/atlases/template-unit.atlas.json', import.meta.url);
export const TEMPLATE_UNIT_DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const TEMPLATE_UNIT_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

export function templateUnitDirectionFromAngle(angleRadians) {
  if (!Number.isFinite(angleRadians)) return TEMPLATE_UNIT_DIRECTIONS[0];
  const index = Math.round((angleRadians + Math.PI / 2) / (Math.PI / 4));
  return TEMPLATE_UNIT_DIRECTIONS[((index % TEMPLATE_UNIT_DIRECTIONS.length) + TEMPLATE_UNIT_DIRECTIONS.length) % TEMPLATE_UNIT_DIRECTIONS.length];
}

export function loadTemplateUnitAtlas(options = {}) {
  return loadSpriteAtlas(TEMPLATE_UNIT_ATLAS_URL, options);
}
