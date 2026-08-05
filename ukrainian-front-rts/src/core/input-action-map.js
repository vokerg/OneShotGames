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
  SELECT_IDLE_WORKER: 'selectIdleWorker',
});

export const INPUT_ACTION_IDS = Object.freeze(Object.values(INPUT_ACTIONS));

export const INPUT_ACTION_LABELS = Object.freeze({
  [INPUT_ACTIONS.CAMERA_UP]: 'Camera up',
  [INPUT_ACTIONS.CAMERA_DOWN]: 'Camera down',
  [INPUT_ACTIONS.CAMERA_LEFT]: 'Camera left',
  [INPUT_ACTIONS.CAMERA_RIGHT]: 'Camera right',
  [INPUT_ACTIONS.CANCEL]: 'Cancel current action',
  [INPUT_ACTIONS.ATTACK_MOVE]: 'Attack-move',
  [INPUT_ACTIONS.ATTACK_GROUND]: 'Attack ground',
  [INPUT_ACTIONS.STOP]: 'Stop selected units',
  [INPUT_ACTIONS.TOGGLE_AUTO_FIRE]: 'Toggle auto-fire',
  [INPUT_ACTIONS.CYCLE_SELECTION_SUBGROUP]: 'Cycle selection subgroup',
  [INPUT_ACTIONS.DISEMBARK]: 'Disembark',
  [INPUT_ACTIONS.PATROL]: 'Patrol',
  [INPUT_ACTIONS.GUARD]: 'Guard',
  [INPUT_ACTIONS.FOLLOW]: 'Follow',
  [INPUT_ACTIONS.HOLD_POSITION]: 'Hold position',
  [INPUT_ACTIONS.RETURN_FOR_REPAIR]: 'Return for repair',
  [INPUT_ACTIONS.SELECT_IDLE_WORKER]: 'Select idle worker',
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
  i: INPUT_ACTIONS.SELECT_IDLE_WORKER,
});

const ACTION_SET = new Set(INPUT_ACTION_IDS);
const HELD_ACTIONS = new Set([
  INPUT_ACTIONS.CAMERA_UP,
  INPUT_ACTIONS.CAMERA_DOWN,
  INPUT_ACTIONS.CAMERA_LEFT,
  INPUT_ACTIONS.CAMERA_RIGHT,
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function normalizeInputKey(key) {
  const value = String(key ?? '').toLowerCase();
  const trimmed = value.trim();
  if (value === ' ' || trimmed === 'space' || trimmed === 'spacebar') return 'space';
  return trimmed;
}

function actionBindingsFromKeyBindings(bindings) {
  const result = Object.fromEntries(INPUT_ACTION_IDS.map((action) => [action, []]));
  for (const [key, action] of Object.entries(bindings)) {
    if (!ACTION_SET.has(action)) continue;
    const normalizedKey = normalizeInputKey(key);
    if (normalizedKey && !result[action].includes(normalizedKey)) result[action].push(normalizedKey);
  }
  return deepFreeze(Object.fromEntries(INPUT_ACTION_IDS.map((action) => [action, Object.freeze(result[action])] )));
}

export const DEFAULT_ACTION_BINDINGS = actionBindingsFromKeyBindings(DEFAULT_KEY_BINDINGS);

export function normalizeActionBindings(value = DEFAULT_ACTION_BINDINGS) {
  const input = plainObject(value) ? value : {};
  const claimedKeys = new Set();
  const normalized = {};
  for (const action of INPUT_ACTION_IDS) {
    const supplied = Array.isArray(input[action]) ? input[action] : DEFAULT_ACTION_BINDINGS[action];
    const keys = [];
    for (const key of supplied) {
      const normalizedKey = normalizeInputKey(key);
      if (!normalizedKey || claimedKeys.has(normalizedKey) || keys.includes(normalizedKey)) continue;
      claimedKeys.add(normalizedKey);
      keys.push(normalizedKey);
    }
    normalized[action] = Object.freeze(keys);
  }
  return deepFreeze(normalized);
}

export function actionBindingsToKeyBindings(actionBindings = DEFAULT_ACTION_BINDINGS) {
  const profile = normalizeActionBindings(actionBindings);
  const result = {};
  for (const action of INPUT_ACTION_IDS) {
    for (const key of profile[action]) result[key] = action;
  }
  return Object.freeze(result);
}

let runtimeKeyBindings = DEFAULT_KEY_BINDINGS;
const runtimeKeyBindingsView = new Proxy({}, {
  get(_target, property) {
    if (property === Symbol.toStringTag) return 'RuntimeKeyBindings';
    return runtimeKeyBindings[property];
  },
  has(_target, property) {
    return property in runtimeKeyBindings;
  },
  ownKeys() {
    return Reflect.ownKeys(runtimeKeyBindings);
  },
  getOwnPropertyDescriptor(_target, property) {
    if (!(property in runtimeKeyBindings)) return undefined;
    return { configurable: true, enumerable: true, value: runtimeKeyBindings[property], writable: false };
  },
  set() {
    return false;
  },
  deleteProperty() {
    return false;
  },
});

export function createKeyBindings(overrides = {}) {
  if (!plainObject(overrides)) throw new TypeError('Key binding overrides must be a plain object.');
  if (Object.keys(overrides).length === 0) return runtimeKeyBindingsView;
  const bindings = { ...DEFAULT_KEY_BINDINGS };
  for (const [key, action] of Object.entries(overrides)) {
    const normalizedKey = normalizeInputKey(key);
    if (!normalizedKey) continue;
    if (action == null) delete bindings[normalizedKey];
    else if (ACTION_SET.has(action)) bindings[normalizedKey] = action;
  }
  return Object.freeze(bindings);
}

export function setRuntimeActionBindings(actionBindings = DEFAULT_ACTION_BINDINGS) {
  const previous = runtimeKeyBindings;
  runtimeKeyBindings = actionBindingsToKeyBindings(actionBindings);
  return previous;
}

export function setRuntimeKeyBindings(keyBindings = DEFAULT_KEY_BINDINGS) {
  if (!plainObject(keyBindings)) throw new TypeError('Runtime key bindings must be a plain object.');
  const next = {};
  for (const [key, action] of Object.entries(keyBindings)) {
    const normalizedKey = normalizeInputKey(key);
    if (!normalizedKey || !ACTION_SET.has(action)) continue;
    next[normalizedKey] = action;
  }
  const previous = runtimeKeyBindings;
  runtimeKeyBindings = Object.freeze(next);
  return previous;
}

export function getRuntimeKeyBindings() {
  return runtimeKeyBindings;
}

export function resolveInputAction(bindings, key) {
  return bindings[normalizeInputKey(key)] || null;
}

export function resolveRuntimeInputAction(key) {
  return resolveInputAction(runtimeKeyBindings, key);
}

export function findInputBindingConflict(actionBindings, action, key) {
  if (!ACTION_SET.has(action)) throw new RangeError(`Unknown input action: ${action}`);
  const normalizedKey = normalizeInputKey(key);
  if (!normalizedKey) return null;
  const profile = normalizeActionBindings(actionBindings);
  return INPUT_ACTION_IDS.find((candidate) => candidate !== action && profile[candidate].includes(normalizedKey)) ?? null;
}

export function rebindInputAction(actionBindings, action, key, { replace = false } = {}) {
  if (!ACTION_SET.has(action)) throw new RangeError(`Unknown input action: ${action}`);
  const normalizedKey = normalizeInputKey(key);
  if (!normalizedKey) throw new TypeError('Input binding key must be non-empty.');
  const profile = normalizeActionBindings(actionBindings);
  const conflict = findInputBindingConflict(profile, action, normalizedKey);
  if (conflict && !replace) return deepFreeze({ ok: false, conflict, bindings: profile });
  const next = Object.fromEntries(INPUT_ACTION_IDS.map((candidate) => [candidate, [...profile[candidate]]]));
  if (conflict) next[conflict] = next[conflict].filter((candidate) => candidate !== normalizedKey);
  next[action] = [normalizedKey];
  return deepFreeze({ ok: true, conflict, bindings: normalizeActionBindings(next) });
}

export function unbindInputAction(actionBindings, action) {
  if (!ACTION_SET.has(action)) throw new RangeError(`Unknown input action: ${action}`);
  const profile = normalizeActionBindings(actionBindings);
  return normalizeActionBindings({ ...profile, [action]: [] });
}

export function isHeldInputAction(action) {
  return HELD_ACTIONS.has(action);
}
