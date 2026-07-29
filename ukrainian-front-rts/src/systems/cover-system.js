const TILE_SIZE = 32;

export const COVER_LEVELS = Object.freeze({
  exposed: Object.freeze({ id: 'exposed', accuracyMultiplier: 1, damageMultiplier: 1 }),
  concealed: Object.freeze({ id: 'concealed', accuracyMultiplier: 0.82, damageMultiplier: 1 }),
  light: Object.freeze({ id: 'light', accuracyMultiplier: 0.88, damageMultiplier: 0.9 }),
  heavy: Object.freeze({ id: 'heavy', accuracyMultiplier: 0.7, damageMultiplier: 0.72 }),
});

const TERRAIN_COVER = Object.freeze({
  0: 'exposed',
  1: 'concealed',
  2: 'light',
});

function terrainAt(game, x, y) {
  if (!Array.isArray(game?.terrain) || game.terrain.length === 0) return 0;
  const worldWidth = Number(game?.world?.w) || 2560;
  const columns = Math.max(1, Math.floor(worldWidth / TILE_SIZE));
  const cellX = Math.max(0, Math.floor(x / TILE_SIZE));
  const cellY = Math.max(0, Math.floor(y / TILE_SIZE));
  return game.terrain[cellY * columns + cellX] ?? 0;
}

export function resolveCoverState(game, target) {
  if (!target) return COVER_LEVELS.exposed;
  const explicit = target.coverLevel || target.fortificationCover;
  const level = explicit && COVER_LEVELS[explicit]
    ? explicit
    : TERRAIN_COVER[terrainAt(game, target.x, target.y)] || 'exposed';
  return COVER_LEVELS[level];
}

export function applyCoverState(game, target) {
  const state = resolveCoverState(game, target);
  target.coverState = state.id;
  return state;
}
