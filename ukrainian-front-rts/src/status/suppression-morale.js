import { DOMAIN_EVENT_TYPES } from '../core/events.js';

export const MORALE_STATES = Object.freeze({ STEADY: 'steady', SHAKEN: 'shaken', PINNED: 'pinned', BROKEN: 'broken' });
export const DEFAULT_STATUS_RULES = Object.freeze({ maxSuppression: 100, shakenThreshold: 35, pinnedThreshold: 60, brokenThreshold: 90, passiveRecoveryPerSecond: 6, commandAuraRecoveryMultiplier: 1.5, commandAuraThresholdReduction: 10 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function assertFiniteNonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a finite non-negative number.`); }
function normalizeRules(rules = {}) {
  const merged = { ...DEFAULT_STATUS_RULES, ...rules };
  for (const [key, value] of Object.entries(merged)) assertFiniteNonNegative(value, key);
  if (!(merged.shakenThreshold <= merged.pinnedThreshold && merged.pinnedThreshold <= merged.brokenThreshold)) throw new RangeError('Morale thresholds must be ordered shaken <= pinned <= broken.');
  if (merged.brokenThreshold > merged.maxSuppression) throw new RangeError('Broken threshold cannot exceed max suppression.');
  return Object.freeze(merged);
}

export function resolveMoraleState(suppression, { commandAura = false, rules = DEFAULT_STATUS_RULES } = {}) {
  assertFiniteNonNegative(suppression, 'Suppression');
  const normalized = normalizeRules(rules);
  const bonus = commandAura ? normalized.commandAuraThresholdReduction : 0;
  const shaken = normalized.shakenThreshold + bonus;
  const pinned = normalized.pinnedThreshold + bonus;
  const broken = normalized.brokenThreshold + bonus;
  if (suppression >= broken) return MORALE_STATES.BROKEN;
  if (suppression >= pinned) return MORALE_STATES.PINNED;
  if (suppression >= shaken) return MORALE_STATES.SHAKEN;
  return MORALE_STATES.STEADY;
}

export function createSuppressionStatus({ unitId, suppression = 0, commandAura = false, rules } = {}) {
  if (typeof unitId !== 'string' || !unitId.trim()) throw new TypeError('unitId must be a non-empty string.');
  const normalizedRules = normalizeRules(rules);
  assertFiniteNonNegative(suppression, 'Suppression');
  const value = clamp(suppression, 0, normalizedRules.maxSuppression);
  return Object.freeze({ unitId, suppression: value, commandAura: Boolean(commandAura), morale: resolveMoraleState(value, { commandAura, rules: normalizedRules }) });
}

function transition(status, nextSuppression, commandAura, rules, cause) {
  const next = createSuppressionStatus({ unitId: status.unitId, suppression: nextSuppression, commandAura, rules });
  return Object.freeze({ previous: status, current: next, cause, changed: status.suppression !== next.suppression || status.commandAura !== next.commandAura || status.morale !== next.morale, enteredPinned: status.morale !== MORALE_STATES.PINNED && next.morale === MORALE_STATES.PINNED, leftPinned: status.morale === MORALE_STATES.PINNED && next.morale !== MORALE_STATES.PINNED, orderRestrictions: Object.freeze({ canAdvance: ![MORALE_STATES.PINNED, MORALE_STATES.BROKEN].includes(next.morale), canAttackMove: ![MORALE_STATES.PINNED, MORALE_STATES.BROKEN].includes(next.morale), canRetreat: true, canHold: true }) });
}

export function applySuppression(status, amount, { rules } = {}) { assertFiniteNonNegative(amount, 'Suppression amount'); const normalizedRules = normalizeRules(rules); return transition(status, clamp(status.suppression + amount, 0, normalizedRules.maxSuppression), status.commandAura, normalizedRules, 'suppression'); }
export function recoverSuppression(status, seconds, { rules } = {}) { assertFiniteNonNegative(seconds, 'Recovery seconds'); const normalizedRules = normalizeRules(rules); const multiplier = status.commandAura ? normalizedRules.commandAuraRecoveryMultiplier : 1; return transition(status, clamp(status.suppression - normalizedRules.passiveRecoveryPerSecond * multiplier * seconds, 0, normalizedRules.maxSuppression), status.commandAura, normalizedRules, 'recovery'); }
export function setCommandAura(status, commandAura, { rules } = {}) { const normalizedRules = normalizeRules(rules); return transition(status, status.suppression, Boolean(commandAura), normalizedRules, 'command-aura'); }

export function emitStatusTransition(eventStream, transitionResult, { tick, source = 'suppression-morale' } = {}) {
  if (!eventStream || typeof eventStream.emit !== 'function') throw new TypeError('A domain event stream is required.');
  if (!transitionResult.changed) return null;
  return eventStream.emit(DOMAIN_EVENT_TYPES.ALERT, { category: 'unit-status', unitId: transitionResult.current.unitId, cause: transitionResult.cause, suppression: transitionResult.current.suppression, previousMorale: transitionResult.previous.morale, morale: transitionResult.current.morale, commandAura: transitionResult.current.commandAura, orderRestrictions: transitionResult.orderRestrictions }, { tick, source });
}
