export const INPUT_ACTIONS = Object.freeze({
  CAMERA_UP: 'w',
  CAMERA_DOWN: 's',
  CAMERA_LEFT: 'a',
  CAMERA_RIGHT: 'd',
  CANCEL: 'cancel',
  ATTACK_MOVE: 'attackMove',
  ATTACK_GROUND: 'attackGround',
  STOP: 'stop',
  TOGGLE_AUTO_FIRE: 'toggleAutoFire',
  CYCLE_SELECTION_SUBGROUP: 'cycleSelectionSubgroup',
  DISEMBARK: 'disembark',
  PATROL: 'patrol',
  GUARD: 'guard',
  FOLLOW: 'follow',
  HOLD_POSITION: 'holdPosition',
  RETURN_FOR_REPAIR: 'returnForRepair',
});

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  w: INPUT_ACTIONS.CAMERA_UP,
  arrowup: INPUT_ACTIONS.CAMERA_UP,
  s: INPUT_ACTIONS.CAMERA_DOWN,
  arrowdown: INPUT_ACTIONS.CAMERA_DOWN,
  a: INPUT_ACTIONS.CAMERA_LEFT,
  arrowleft: INPUT_ACTIONS.CAMERA_LEFT,
  d: INPUT_ACTIONS.CAMERA_RIGHT,
  arrowright: INPUT_ACTIONS.CAMERA_RIGHT,
  escape: INPUT_ACTIONS.CANCEL,
  q: INPUT_ACTIONS.ATTACK_MOVE,
  f: INPUT_ACTIONS.ATTACK_GROUND,
  x: INPUT_ACTIONS.STOP,
  t: INPUT_ACTIONS.TOGGLE_AUTO_FIRE,
  tab: INPUT_ACTIONS.CYCLE_SELECTION_SUBGROUP,
  e: INPUT_ACTIONS.DISEMBARK,
  p: INPUT_ACTIONS.PATROL,
  g: INPUT_ACTIONS.GUARD,
  y: INPUT_ACTIONS.FOLLOW,
  h: INPUT_ACTIONS.HOLD_POSITION,
  r: INPUT_ACTIONS.RETURN_FOR_REPAIR,
});

const HELD_ACTIONS = new Set([
  INPUT_ACTIONS.CAMERA_UP,
  INPUT_ACTIONS.CAMERA_DOWN,
  INPUT_ACTIONS.CAMERA_LEFT,
  INPUT_ACTIONS.CAMERA_RIGHT,
]);

export function normalizeInputKey(key) {
  return String(key || '').trim().toLowerCase();
}

export function createKeyBindings(overrides = {}) {
  const bindings = { ...DEFAULT_KEY_BINDINGS };
  for (const [key, action] of Object.entries(overrides)) {
    const normalizedKey = normalizeInputKey(key);
    if (!normalizedKey) continue;
    if (action == null) delete bindings[normalizedKey];
    else bindings[normalizedKey] = action;
  }
  return Object.freeze(bindings);
}

export function resolveInputAction(bindings, key) {
  return bindings[normalizeInputKey(key)] || null;
}

export function isHeldInputAction(action) {
  return HELD_ACTIONS.has(action);
}
