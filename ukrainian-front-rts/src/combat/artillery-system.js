export const ARTILLERY_STATES = Object.freeze({ PACKED: 'packed', SETTING_UP: 'setting-up', READY: 'ready', PACKING: 'packing' });

export function createArtilleryState(config = {}) {
  return {
    state: ARTILLERY_STATES.PACKED,
    timer: 0,
    ammo: config.ammo ?? 6,
    cooldown: 0,
    salvoRemaining: 0,
    signature: 0,
  };
}

export function beginSetup(state, config) {
  if (state.state !== ARTILLERY_STATES.PACKED) return state;
  return { ...state, state: ARTILLERY_STATES.SETTING_UP, timer: config.setupTime ?? 3 };
}

export function beginPack(state, config) {
  if (state.state !== ARTILLERY_STATES.READY) return state;
  return { ...state, state: ARTILLERY_STATES.PACKING, timer: config.packTime ?? 2, salvoRemaining: 0 };
}

export function canFire(state, shot, config) {
  if (state.state !== ARTILLERY_STATES.READY) return { ok: false, reason: 'not-ready' };
  if (state.cooldown > 0) return { ok: false, reason: 'cooldown' };
  if (state.ammo <= 0) return { ok: false, reason: 'no-ammo' };
  if ((shot.distance ?? 0) < (config.minimumRange ?? 0)) return { ok: false, reason: 'minimum-range' };
  if (config.requiresSpotter && !shot.spotted) return { ok: false, reason: 'spotting-required' };
  return { ok: true, reason: null };
}

export function startSalvo(state, shot, config) {
  const verdict = canFire(state, shot, config);
  if (!verdict.ok) return { state, verdict };
  return { state: { ...state, salvoRemaining: Math.min(config.salvoSize ?? 1, state.ammo) }, verdict };
}

export function fireSalvoRound(state, config) {
  if (state.salvoRemaining <= 0 || state.ammo <= 0 || state.cooldown > 0) return state;
  return {
    ...state,
    ammo: state.ammo - 1,
    salvoRemaining: state.salvoRemaining - 1,
    cooldown: config.shotCadence ?? 1,
    signature: Math.min(1, state.signature + (config.signaturePerShot ?? 0.25)),
  };
}

export function scatterPoint(origin, random, config = {}) {
  const radius = config.scatterRadius ?? 0;
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * radius;
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

export function tickArtillery(state, dt, config = {}) {
  let next = { ...state, timer: Math.max(0, state.timer - dt), cooldown: Math.max(0, state.cooldown - dt), signature: Math.max(0, state.signature - (config.signatureDecay ?? 0.05) * dt) };
  if (next.timer === 0 && next.state === ARTILLERY_STATES.SETTING_UP) next.state = ARTILLERY_STATES.READY;
  if (next.timer === 0 && next.state === ARTILLERY_STATES.PACKING) next.state = ARTILLERY_STATES.PACKED;
  return next;
}
