import { TARGET_DOMAINS } from './combat-schema.js';

export const ABILITY_TARGETING_VERSION = 1;
export const ABILITY_TARGET_MODES = Object.freeze({
  POINT: 'point', UNIT: 'unit', AREA: 'area', DIRECTION: 'direction',
  SELF: 'self', TOGGLE: 'toggle', CHANNEL: 'channel',
});
export const ABILITY_TARGET_PHASES = Object.freeze({ IDLE: 'idle', TARGETING: 'targeting', CHANNELING: 'channeling' });
export const TARGET_ALLEGIANCES = Object.freeze({ ANY: 'any', ALLY: 'ally', ENEMY: 'enemy' });

const MODES = new Set(Object.values(ABILITY_TARGET_MODES));
const ACQUISITION_MODES = new Set([
  ABILITY_TARGET_MODES.POINT, ABILITY_TARGET_MODES.UNIT, ABILITY_TARGET_MODES.AREA,
  ABILITY_TARGET_MODES.DIRECTION, ABILITY_TARGET_MODES.SELF,
]);
const ALLEGIANCES = new Set(Object.values(TARGET_ALLEGIANCES));
const DOMAINS = new Set(Object.values(TARGET_DOMAINS));
const freeze = (value) => Object.freeze(value);

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number`);
  return number;
}
function nonNegative(value, name) {
  const number = finite(value, name);
  if (number < 0) throw new RangeError(`${name} must be non-negative`);
  return number;
}
function failure(state, reason, extra = {}) {
  return freeze({ ok: false, reason, state, ...extra });
}
function normalizeDomains(domains) {
  if (!Array.isArray(domains) || !domains.length) throw new TypeError('targetDomains must be a non-empty array');
  const normalized = [...new Set(domains)];
  if (normalized.some((domain) => !DOMAINS.has(domain))) throw new TypeError('targetDomains contains an unknown domain');
  return freeze(normalized);
}

export function createAbilityTargetingProfile({
  id, mode, range = 0, radius = 0, directionLength = null, cooldown = 0,
  targetAllegiance = TARGET_ALLEGIANCES.ANY,
  targetDomains = Object.values(TARGET_DOMAINS),
  requiresPassablePoint = false, requiresLineOfSight = false,
  channelDuration = 0, channelTargetMode = ABILITY_TARGET_MODES.SELF,
  toggleDefault = false, telegraphKind = null,
} = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('ability id must be a non-empty string');
  if (!MODES.has(mode)) throw new TypeError(`Unknown ability target mode: ${mode}`);
  if (!ALLEGIANCES.has(targetAllegiance)) throw new TypeError(`Unknown target allegiance: ${targetAllegiance}`);
  if (mode === ABILITY_TARGET_MODES.CHANNEL && !ACQUISITION_MODES.has(channelTargetMode)) throw new TypeError(`Unknown channel target mode: ${channelTargetMode}`);
  if (mode !== ABILITY_TARGET_MODES.CHANNEL && channelTargetMode !== ABILITY_TARGET_MODES.SELF) throw new TypeError('channelTargetMode is only valid for channel abilities');

  const acquisitionMode = mode === ABILITY_TARGET_MODES.CHANNEL ? channelTargetMode : mode;
  const normalizedRange = nonNegative(range, 'range');
  const normalizedRadius = nonNegative(radius, 'radius');
  const normalizedDuration = nonNegative(channelDuration, 'channelDuration');
  if ([ABILITY_TARGET_MODES.POINT, ABILITY_TARGET_MODES.UNIT, ABILITY_TARGET_MODES.AREA, ABILITY_TARGET_MODES.DIRECTION].includes(acquisitionMode) && normalizedRange === 0) throw new RangeError(`${acquisitionMode} abilities require a positive range`);
  if (acquisitionMode === ABILITY_TARGET_MODES.AREA && normalizedRadius === 0) throw new RangeError('area abilities require a positive radius');
  if (mode === ABILITY_TARGET_MODES.CHANNEL && normalizedDuration === 0) throw new RangeError('channel abilities require a positive channelDuration');

  const normalizedDirectionLength = acquisitionMode === ABILITY_TARGET_MODES.DIRECTION
    ? (directionLength == null ? normalizedRange : nonNegative(directionLength, 'directionLength'))
    : 0;
  if (acquisitionMode === ABILITY_TARGET_MODES.DIRECTION && normalizedDirectionLength === 0) throw new RangeError('directionLength must be positive');
  const kind = telegraphKind == null ? mode : String(telegraphKind).trim();
  if (!kind) throw new TypeError('telegraphKind must be a non-empty string');

  return freeze({
    schemaVersion: ABILITY_TARGETING_VERSION, id: id.trim(), mode, acquisitionMode,
    range: normalizedRange, radius: normalizedRadius, directionLength: normalizedDirectionLength,
    cooldown: nonNegative(cooldown, 'cooldown'), targetAllegiance,
    targetDomains: normalizeDomains(targetDomains),
    requiresPassablePoint: Boolean(requiresPassablePoint), requiresLineOfSight: Boolean(requiresLineOfSight),
    channelDuration: normalizedDuration, channelTargetMode,
    toggleDefault: Boolean(toggleDefault), telegraphKind: kind,
  });
}

export function validateAbilityTargetingProfile(profile) {
  try { createAbilityTargetingProfile(profile); return []; } catch (error) { return [error.message]; }
}

export function createAbilityTargetingState({ toggles = {} } = {}) {
  return freeze({
    phase: ABILITY_TARGET_PHASES.IDLE, abilityId: null, mode: null,
    channelRemaining: 0, lockedTarget: null, toggles: freeze({ ...toggles }),
    lastTransitionReason: null,
  });
}

function actorSnapshot(actor) {
  if (!actor || typeof actor !== 'object') throw new TypeError('ability actor must be an object');
  if (actor.id == null || !String(actor.id)) throw new TypeError('ability actor requires a stable id');
  const domain = actor.domain ?? TARGET_DOMAINS.GROUND;
  if (!DOMAINS.has(domain)) throw new TypeError(`Unknown actor domain: ${domain}`);
  return freeze({
    id: String(actor.id), x: finite(actor.x, 'actor.x'), y: finite(actor.y, 'actor.y'),
    side: actor.side ?? null, domain,
    alive: actor.alive !== false && !(Number.isFinite(actor.hp) && actor.hp <= 0),
  });
}
function idleState(state, reason) {
  return freeze({
    phase: ABILITY_TARGET_PHASES.IDLE, abilityId: null, mode: null,
    channelRemaining: 0, lockedTarget: null, toggles: state.toggles,
    lastTransitionReason: reason,
  });
}
function cooldownRemaining(profile, actor, context) {
  const value = context.cooldownRemaining ?? actor.cooldowns?.[profile.id] ?? 0;
  return nonNegative(value, 'cooldownRemaining');
}

export function beginAbilityTargeting(state, profile, actor, context = {}) {
  const errors = validateAbilityTargetingProfile(profile);
  if (errors.length) throw new TypeError(errors.join('; '));
  const source = actorSnapshot(actor);
  if (!source.alive) return failure(state, 'actor-unavailable');
  if (state.phase !== ABILITY_TARGET_PHASES.IDLE) return failure(state, 'ability-in-progress');
  if (cooldownRemaining(profile, actor, context) > 0) return failure(state, 'cooldown');
  if (context.abilityEnabled === false) return failure(state, 'ability-disabled');

  const next = freeze({
    phase: ABILITY_TARGET_PHASES.TARGETING, abilityId: profile.id, mode: profile.mode,
    channelRemaining: 0, lockedTarget: null, toggles: state.toggles,
    lastTransitionReason: 'targeting-started',
  });
  const automatic = profile.acquisitionMode === ABILITY_TARGET_MODES.SELF
    ? source
    : profile.acquisitionMode === ABILITY_TARGET_MODES.TOGGLE ? null : undefined;
  const preview = automatic !== undefined ? previewAbilityTarget(next, profile, actor, automatic, context) : null;
  return freeze({ ok: true, reason: null, state: next, preview });
}

function pointSnapshot(target) {
  if (!target || typeof target !== 'object') throw new TypeError('ability target point must be an object');
  return freeze({ x: finite(target.x, 'target.x'), y: finite(target.y, 'target.y') });
}
function unitSnapshot(target) {
  if (!target || typeof target !== 'object') throw new TypeError('ability unit target must be an object');
  if (target.id == null || !String(target.id)) throw new TypeError('ability unit target requires a stable id');
  const domain = target.domain ?? TARGET_DOMAINS.GROUND;
  if (!DOMAINS.has(domain)) throw new TypeError(`Unknown target domain: ${domain}`);
  return freeze({
    id: String(target.id), x: finite(target.x, 'target.x'), y: finite(target.y, 'target.y'),
    side: target.side ?? null, domain,
    collisionRadius: nonNegative(target.collisionRadius ?? 0, 'target.collisionRadius'),
    alive: target.alive !== false && !(Number.isFinite(target.hp) && target.hp <= 0),
  });
}
function distance(source, target, collisionRadius = 0) {
  return Math.max(0, Math.hypot(target.x - source.x, target.y - source.y) - collisionRadius);
}
function relationshipAllowed(source, target, allegiance) {
  if (allegiance === TARGET_ALLEGIANCES.ANY) return true;
  if (source.side == null || target.side == null) return false;
  return allegiance === TARGET_ALLEGIANCES.ALLY
    ? source.side === target.side
    : source.side !== target.side;
}
function telegraph(profile, valid, reason, extra = {}) {
  return freeze({
    owner: 'presentation', abilityId: profile.id, kind: profile.telegraphKind,
    mode: profile.mode, acquisitionMode: profile.acquisitionMode, valid, reason, ...extra,
  });
}
function validateEnvironment(source, point, profile, context) {
  if (profile.requiresPassablePoint) {
    if (typeof context.isPointPassable !== 'function') return 'passability-unavailable';
    if (!context.isPointPassable(point)) return 'point-impassable';
  }
  if (profile.requiresLineOfSight) {
    if (typeof context.hasLineOfSight !== 'function') return 'line-of-sight-unavailable';
    if (!context.hasLineOfSight(source, point)) return 'line-of-sight';
  }
  return null;
}

function targetVerdict(profile, actor, target, context) {
  const source = actorSnapshot(actor);
  const mode = profile.acquisitionMode;
  if (mode === ABILITY_TARGET_MODES.TOGGLE) {
    const normalized = freeze({ enabled: !(context.toggleState ?? false) });
    return freeze({ ok: true, reason: null, target: normalized, telegraph: telegraph(profile, true, null, normalized) });
  }
  if (mode === ABILITY_TARGET_MODES.SELF) {
    const normalized = freeze({ id: source.id, x: source.x, y: source.y, side: source.side, domain: source.domain });
    return freeze({ ok: true, reason: null, target: normalized, telegraph: telegraph(profile, true, null, { targetId: source.id, x: source.x, y: source.y }) });
  }
  if (mode === ABILITY_TARGET_MODES.UNIT) {
    const normalized = unitSnapshot(target);
    const base = { targetId: normalized.id };
    if (!normalized.alive) return failure(null, 'target-unavailable', { target: normalized, telegraph: telegraph(profile, false, 'target-unavailable', base) });
    if (!profile.targetDomains.includes(normalized.domain)) return failure(null, 'target-domain', { target: normalized, telegraph: telegraph(profile, false, 'target-domain', base) });
    if (!relationshipAllowed(source, normalized, profile.targetAllegiance)) return failure(null, 'target-allegiance', { target: normalized, telegraph: telegraph(profile, false, 'target-allegiance', base) });
    const targetDistance = distance(source, normalized, normalized.collisionRadius);
    if (targetDistance > profile.range) return failure(null, 'out-of-range', { target: normalized, telegraph: telegraph(profile, false, 'out-of-range', { ...base, distance: targetDistance, range: profile.range }) });
    if (profile.requiresLineOfSight) {
      if (typeof context.hasLineOfSight !== 'function') return failure(null, 'line-of-sight-unavailable', { target: normalized, telegraph: telegraph(profile, false, 'line-of-sight-unavailable', base) });
      if (!context.hasLineOfSight(source, normalized)) return failure(null, 'line-of-sight', { target: normalized, telegraph: telegraph(profile, false, 'line-of-sight', base) });
    }
    return freeze({ ok: true, reason: null, target: normalized, telegraph: telegraph(profile, true, null, { ...base, x: normalized.x, y: normalized.y, distance: targetDistance, range: profile.range }) });
  }

  const normalized = pointSnapshot(target);
  const targetDistance = distance(source, normalized);
  const pointData = { x: normalized.x, y: normalized.y, distance: targetDistance, range: profile.range };
  if (targetDistance > profile.range) return failure(null, 'out-of-range', { target: normalized, telegraph: telegraph(profile, false, 'out-of-range', pointData) });
  const environmentReason = validateEnvironment(source, normalized, profile, context);
  if (environmentReason) return failure(null, environmentReason, { target: normalized, telegraph: telegraph(profile, false, environmentReason, pointData) });

  if (mode === ABILITY_TARGET_MODES.DIRECTION) {
    const dx = normalized.x - source.x;
    const dy = normalized.y - source.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude === 0) return failure(null, 'direction-required', { target: normalized, telegraph: telegraph(profile, false, 'direction-required', { originX: source.x, originY: source.y }) });
    const directionX = dx / magnitude;
    const directionY = dy / magnitude;
    const directionTarget = freeze({
      x: normalized.x, y: normalized.y, directionX, directionY,
      endpointX: source.x + directionX * profile.directionLength,
      endpointY: source.y + directionY * profile.directionLength,
    });
    return freeze({ ok: true, reason: null, target: directionTarget, telegraph: telegraph(profile, true, null, {
      originX: source.x, originY: source.y, endX: directionTarget.endpointX, endY: directionTarget.endpointY,
      directionX, directionY, length: profile.directionLength,
    }) });
  }
  return freeze({
    ok: true, reason: null, target: normalized,
    telegraph: telegraph(profile, true, null, { ...pointData, radius: mode === ABILITY_TARGET_MODES.AREA ? profile.radius : 0 }),
  });
}

export function previewAbilityTarget(state, profile, actor, target, context = {}) {
  if (state.phase !== ABILITY_TARGET_PHASES.TARGETING || state.abilityId !== profile.id) return failure(state, 'not-targeting');
  const verdict = targetVerdict(profile, actor, target, {
    ...context, toggleState: state.toggles[profile.id] ?? profile.toggleDefault,
  });
  return freeze({ ...verdict, state });
}

export function confirmAbilityTarget(state, profile, actor, target, context = {}) {
  const preview = previewAbilityTarget(state, profile, actor, target, context);
  if (!preview.ok) return preview;
  const source = actorSnapshot(actor);
  if (profile.mode === ABILITY_TARGET_MODES.CHANNEL) {
    const lockedTarget = freeze({ ...preview.target });
    return freeze({
      ok: true, reason: null,
      state: freeze({
        phase: ABILITY_TARGET_PHASES.CHANNELING, abilityId: profile.id, mode: profile.mode,
        channelRemaining: profile.channelDuration, lockedTarget, toggles: state.toggles,
        lastTransitionReason: 'channel-started',
      }),
      activation: freeze({ phase: 'channel-start', abilityId: profile.id, sourceId: source.id, target: lockedTarget, channelDuration: profile.channelDuration, cooldown: 0 }),
      telegraph: preview.telegraph,
    });
  }
  const toggles = profile.mode === ABILITY_TARGET_MODES.TOGGLE
    ? freeze({ ...state.toggles, [profile.id]: preview.target.enabled })
    : state.toggles;
  const next = idleState({ ...state, toggles }, 'ability-confirmed');
  return freeze({
    ok: true, reason: null, state: freeze({ ...next, toggles }),
    activation: freeze({ phase: 'activate', abilityId: profile.id, sourceId: source.id, target: preview.target, cooldown: profile.cooldown }),
    telegraph: preview.telegraph,
  });
}

export function cancelAbilityTargeting(state, reason = 'cancelled') {
  if (state.phase === ABILITY_TARGET_PHASES.IDLE) return failure(state, 'nothing-to-cancel');
  return freeze({
    ok: true, reason: null, state: idleState(state, reason),
    cancellation: freeze({ abilityId: state.abilityId, reason, interrupted: state.phase === ABILITY_TARGET_PHASES.CHANNELING }),
  });
}

export function tickAbilityChannel(state, profile, dt, context = {}) {
  const errors = validateAbilityTargetingProfile(profile);
  if (errors.length) throw new TypeError(errors.join('; '));
  if (profile.mode !== ABILITY_TARGET_MODES.CHANNEL) throw new TypeError('tickAbilityChannel requires a channel ability');
  if (state.phase !== ABILITY_TARGET_PHASES.CHANNELING || state.abilityId !== profile.id) return failure(state, 'not-channeling');
  const elapsed = nonNegative(dt, 'dt');
  if (context.sourceAvailable === false) return cancelAbilityTargeting(state, 'source-unavailable');
  if (context.targetAvailable === false) return cancelAbilityTargeting(state, 'target-unavailable');
  if (context.inRange === false) return cancelAbilityTargeting(state, 'channel-range');
  if (context.hasLineOfSight === false) return cancelAbilityTargeting(state, 'channel-line-of-sight');
  const remaining = Math.max(0, state.channelRemaining - elapsed);
  if (remaining > 0) return freeze({
    ok: true, reason: null,
    state: freeze({ ...state, channelRemaining: remaining, lastTransitionReason: 'channel-ticked' }),
    completion: null,
  });
  return freeze({
    ok: true, reason: null, state: idleState(state, 'channel-complete'),
    completion: freeze({ phase: 'channel-complete', abilityId: profile.id, target: state.lockedTarget, cooldown: profile.cooldown }),
  });
}
