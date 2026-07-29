import { UNIT_TYPES } from '../config.js';

export const TERRAIN_CURSOR_STATES = Object.freeze({
  FAST: 'fast',
  NORMAL: 'normal',
  SLOW: 'slow',
  VERY_SLOW: 'very-slow',
  AMPHIBIOUS: 'amphibious',
  BLOCKED: 'blocked',
});

const CURSOR_BY_STATE = Object.freeze({
  [TERRAIN_CURSOR_STATES.FAST]: 'cell',
  [TERRAIN_CURSOR_STATES.NORMAL]: 'crosshair',
  [TERRAIN_CURSOR_STATES.SLOW]: 'progress',
  [TERRAIN_CURSOR_STATES.VERY_SLOW]: 'wait',
  [TERRAIN_CURSOR_STATES.AMPHIBIOUS]: 'cell',
  [TERRAIN_CURSOR_STATES.BLOCKED]: 'not-allowed',
});

const TONE_BY_STATE = Object.freeze({
  [TERRAIN_CURSOR_STATES.FAST]: Object.freeze({ border: '#b8e58c', background: 'rgba(31, 58, 31, .92)' }),
  [TERRAIN_CURSOR_STATES.NORMAL]: Object.freeze({ border: '#e1ca79', background: 'rgba(35, 40, 31, .92)' }),
  [TERRAIN_CURSOR_STATES.SLOW]: Object.freeze({ border: '#e1a85c', background: 'rgba(61, 45, 25, .92)' }),
  [TERRAIN_CURSOR_STATES.VERY_SLOW]: Object.freeze({ border: '#e47d5f', background: 'rgba(68, 35, 28, .94)' }),
  [TERRAIN_CURSOR_STATES.AMPHIBIOUS]: Object.freeze({ border: '#7ec8e8', background: 'rgba(25, 47, 61, .92)' }),
  [TERRAIN_CURSOR_STATES.BLOCKED]: Object.freeze({ border: '#ef7f73', background: 'rgba(68, 28, 27, .94)' }),
});

function selectedMovementLayer(game) {
  const selectedUnits = game?.selectedUnits?.() ?? [];
  const selectedEntities = game?.selectedEntities?.() ?? [];
  const unit = selectedUnits[0] ?? selectedEntities.find((entity) => UNIT_TYPES[entity.type]);
  const stats = unit ? UNIT_TYPES[unit.type] : null;
  if (stats?.movementLayer) return stats.movementLayer;
  return stats?.air ? 'air' : 'ground';
}

function stateForProfile(profile, passable) {
  if (!passable || !profile.passable) return TERRAIN_CURSOR_STATES.BLOCKED;
  if (profile.terrain === 'water' && profile.layer === 'amphibious') return TERRAIN_CURSOR_STATES.AMPHIBIOUS;
  if (profile.band === 'fast') return TERRAIN_CURSOR_STATES.FAST;
  if (profile.band === 'slow') return TERRAIN_CURSOR_STATES.SLOW;
  if (profile.band === 'very-slow') return TERRAIN_CURSOR_STATES.VERY_SLOW;
  return TERRAIN_CURSOR_STATES.NORMAL;
}

function movementSummary(profile, passable) {
  if (!passable || !profile.passable) return profile.detail || 'Impassable';
  if (profile.layer === 'air') return 'Air movement unaffected';
  const percent = Math.round(profile.speedMultiplier * 100);
  if (profile.band === 'fast') return `Fast route · ${percent}% relative pace`;
  if (profile.band === 'slow') return `Reduced pace · ${percent}%`;
  if (profile.band === 'very-slow') return `Severely reduced · ${percent}%`;
  return profile.detail || 'Standard movement';
}

export function terrainCursorFeedback(game, worldPosition) {
  const grid = game?.navigationState?.grid;
  if (!grid || typeof grid.movementProfileAtWorld !== 'function' || !worldPosition) return null;
  if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.y)) return null;

  let profile;
  let cell;
  try {
    const layer = selectedMovementLayer(game);
    profile = grid.movementProfileAtWorld(worldPosition.x, worldPosition.y, layer);
    cell = profile.cell ?? grid.worldToCell(worldPosition.x, worldPosition.y);
  } catch {
    return null;
  }

  let passable = profile.passable;
  if (typeof grid.isPassable === 'function') {
    try {
      passable = grid.isPassable(cell.x, cell.y, { layer: profile.layer });
    } catch {
      passable = false;
    }
  }

  const state = stateForProfile(profile, passable);
  return Object.freeze({
    terrain: profile.terrain,
    layer: profile.layer,
    label: profile.label,
    detail: movementSummary(profile, passable),
    cost: profile.cost,
    speedMultiplier: profile.speedMultiplier,
    passable,
    state,
    cursor: CURSOR_BY_STATE[state],
    cell: Object.freeze({ x: cell.x, y: cell.y }),
  });
}

function createBadge(documentTarget) {
  const badge = documentTarget.createElement('div');
  badge.className = 'terrainCursorFeedback';
  badge.setAttribute('aria-hidden', 'true');
  Object.assign(badge.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '6',
    maxWidth: '240px',
    padding: '5px 8px',
    border: '2px solid #e1ca79',
    borderRadius: '3px',
    background: 'rgba(35, 40, 31, .92)',
    color: '#f6e8bd',
    boxShadow: '0 3px 12px rgba(0, 0, 0, .65)',
    font: '700 11px/1.25 monospace',
    textShadow: '1px 1px #111',
    whiteSpace: 'nowrap',
  });
  return badge;
}

export function createTerrainCursorPresenter({
  canvas,
  documentTarget = globalThis.document,
  root = documentTarget?.body,
} = {}) {
  if (!canvas?.style || !canvas?.dataset || !documentTarget?.createElement || !root?.appendChild) {
    const clear = () => {};
    return Object.freeze({ update: clear, clear, dispose: clear, element: null });
  }

  const badge = createBadge(documentTarget);
  root.appendChild(badge);
  const originalCursor = canvas.style.cursor;

  const clear = () => {
    badge.style.display = 'none';
    badge.textContent = '';
    delete canvas.dataset.terrainCursor;
    canvas.style.cursor = originalCursor;
  };

  const update = (feedback, pointer) => {
    if (!feedback || !pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) {
      clear();
      return;
    }
    const tone = TONE_BY_STATE[feedback.state] ?? TONE_BY_STATE[TERRAIN_CURSOR_STATES.NORMAL];
    canvas.dataset.terrainCursor = feedback.state;
    canvas.style.cursor = feedback.cursor;
    badge.textContent = `${feedback.label} · ${feedback.detail}`;
    badge.style.borderColor = tone.border;
    badge.style.background = tone.background;
    badge.style.left = `${pointer.x + 16}px`;
    badge.style.top = `${pointer.y + 18}px`;
    badge.style.display = 'block';
  };

  const dispose = () => {
    clear();
    badge.remove?.();
  };

  return Object.freeze({ update, clear, dispose, element: badge });
}
