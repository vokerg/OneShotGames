export const COMBAT_READABILITY_VERSION = 1;

export const COMBAT_CUE_KINDS = Object.freeze({
  INCOMING: 'incoming',
  STATUS: 'status',
  ARMOR: 'armor',
  IMPACT: 'impact',
  DAMAGE: 'damage',
});

export const COMBAT_CUE_SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
});

export const COMBAT_IMPACT_OUTCOMES = Object.freeze({
  HIT: 'hit',
  MISS: 'miss',
  DEFLECT: 'deflect',
  PENETRATE: 'penetrate',
});

export const DEFAULT_COMBAT_READABILITY_PREFERENCES = Object.freeze({
  showDamageNumbers: true,
  maxTransientCues: 96,
});

const CUE_KINDS = new Set(Object.values(COMBAT_CUE_KINDS));
const SEVERITIES = new Set(Object.values(COMBAT_CUE_SEVERITIES));
const IMPACT_OUTCOMES = new Set(Object.values(COMBAT_IMPACT_OUTCOMES));
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const DEFAULT_DURATIONS = Object.freeze({
  [COMBAT_CUE_KINDS.INCOMING]: 90,
  [COMBAT_CUE_KINDS.STATUS]: 120,
  [COMBAT_CUE_KINDS.ARMOR]: 45,
  [COMBAT_CUE_KINDS.IMPACT]: 30,
  [COMBAT_CUE_KINDS.DAMAGE]: 45,
});
const SEVERITY_RANK = Object.freeze({ info: 0, warning: 1, critical: 2 });
const KIND_RANK = Object.freeze({ incoming: 0, armor: 1, status: 2, impact: 3, damage: 4 });

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function stableId(value, label, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if ((typeof value !== 'string' && !Number.isInteger(value)) || !ID_PATTERN.test(String(value))) {
    throw new TypeError(`${label} must be a stable string or integer identifier.`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function nonNegativeFinite(value, label) {
  const normalized = finiteNumber(value, label);
  if (normalized < 0) throw new TypeError(`${label} must be non-negative.`);
  return normalized;
}

function normalizePoint(value, label) {
  assertPlainObject(value, label);
  return Object.freeze({
    x: finiteNumber(value.x, `${label}.x`),
    y: finiteNumber(value.y, `${label}.y`),
  });
}

function optionalText(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 160) throw new TypeError(`${label} must be a string of at most 160 characters.`);
  return value;
}

function compareIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function normalizePreferences(preferences = DEFAULT_COMBAT_READABILITY_PREFERENCES) {
  assertPlainObject(preferences, 'Combat readability preferences');
  return Object.freeze({
    showDamageNumbers: preferences.showDamageNumbers ?? DEFAULT_COMBAT_READABILITY_PREFERENCES.showDamageNumbers,
    maxTransientCues: positiveInteger(
      preferences.maxTransientCues ?? DEFAULT_COMBAT_READABILITY_PREFERENCES.maxTransientCues,
      'Combat readability maxTransientCues',
    ),
  });
}

function normalizeCue(cue) {
  assertPlainObject(cue, 'Combat readability cue');
  if (!CUE_KINDS.has(cue.kind)) throw new TypeError(`Unknown combat readability cue kind: ${cue.kind}`);
  const severity = cue.severity ?? COMBAT_CUE_SEVERITIES.INFO;
  if (!SEVERITIES.has(severity)) throw new TypeError(`Unknown combat readability severity: ${severity}`);
  const outcome = cue.outcome ?? null;
  if (outcome !== null && !IMPACT_OUTCOMES.has(outcome)) {
    throw new TypeError(`Unknown combat impact outcome: ${outcome}`);
  }
  if (
    outcome !== null &&
    cue.kind !== COMBAT_CUE_KINDS.IMPACT &&
    cue.kind !== COMBAT_CUE_KINDS.ARMOR
  ) {
    throw new TypeError('Combat impact outcomes are only valid for impact and armor cues.');
  }
  const value = cue.value ?? null;
  if (value !== null) nonNegativeFinite(value, 'Combat readability cue value');
  if (cue.kind === COMBAT_CUE_KINDS.DAMAGE && !(value > 0)) {
    throw new TypeError('Damage-number cues require a positive value.');
  }
  return Object.freeze({
    id: stableId(cue.id, 'Combat readability cue ID'),
    kind: cue.kind,
    severity,
    createdTick: nonNegativeInteger(cue.createdTick, 'Combat readability cue createdTick'),
    durationTicks: positiveInteger(cue.durationTicks, 'Combat readability cue durationTicks'),
    sequence: positiveInteger(cue.sequence, 'Combat readability cue sequence'),
    sourceId: stableId(cue.sourceId ?? null, 'Combat readability source ID', { nullable: true }),
    targetId: stableId(cue.targetId ?? null, 'Combat readability target ID', { nullable: true }),
    position: normalizePoint(cue.position, 'Combat readability cue position'),
    targetPosition: cue.targetPosition ? normalizePoint(cue.targetPosition, 'Combat readability cue targetPosition') : null,
    text: optionalText(cue.text, 'Combat readability cue text'),
    value,
    outcome,
    dedupeKey: cue.dedupeKey === null || cue.dedupeKey === undefined
      ? null
      : stableId(cue.dedupeKey, 'Combat readability cue dedupeKey'),
  });
}

function normalizeState(state) {
  assertPlainObject(state, 'Combat readability state');
  if (state.version !== COMBAT_READABILITY_VERSION) {
    throw new RangeError(`Unsupported combat readability version: ${state.version}`);
  }
  if (!Array.isArray(state.cues)) throw new TypeError('Combat readability cues must be an array.');
  const preferences = normalizePreferences(state.preferences);
  const cues = state.cues.map(normalizeCue);
  if (cues.length > preferences.maxTransientCues) {
    throw new RangeError('Combat readability state exceeds maxTransientCues.');
  }
  return Object.freeze({
    version: COMBAT_READABILITY_VERSION,
    preferences,
    nextSequence: positiveInteger(state.nextSequence, 'Combat readability nextSequence'),
    cues: Object.freeze(cues),
  });
}

function cueId(kind, sequence) {
  return `${kind}:${sequence}`;
}

export function createCombatReadabilityState({
  preferences = DEFAULT_COMBAT_READABILITY_PREFERENCES,
} = {}) {
  return normalizeState({
    version: COMBAT_READABILITY_VERSION,
    preferences,
    nextSequence: 1,
    cues: [],
  });
}

export function setDamageNumbersVisible(state, visible) {
  const current = normalizeState(state);
  if (typeof visible !== 'boolean') throw new TypeError('Damage-number visibility must be a boolean.');
  const cues = visible
    ? current.cues
    : current.cues.filter((cue) => cue.kind !== COMBAT_CUE_KINDS.DAMAGE);
  return normalizeState({
    ...current,
    preferences: { ...current.preferences, showDamageNumbers: visible },
    cues,
  });
}

export function enqueueCombatCue(state, input) {
  const current = normalizeState(state);
  assertPlainObject(input, 'Combat readability cue input');
  if (!CUE_KINDS.has(input.kind)) throw new TypeError(`Unknown combat readability cue kind: ${input.kind}`);
  if (input.kind === COMBAT_CUE_KINDS.DAMAGE && !current.preferences.showDamageNumbers) return current;
  const sequence = current.nextSequence;
  const dedupeKey = input.dedupeKey ?? null;
  const cue = normalizeCue({
    ...input,
    id: input.id ?? cueId(input.kind, sequence),
    createdTick: input.createdTick,
    durationTicks: input.durationTicks ?? DEFAULT_DURATIONS[input.kind],
    sequence,
    dedupeKey,
  });
  const retained = dedupeKey === null
    ? [...current.cues]
    : current.cues.filter((candidate) => candidate.kind !== cue.kind || candidate.dedupeKey !== cue.dedupeKey);
  retained.push(cue);
  const bounded = retained
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-current.preferences.maxTransientCues);
  return normalizeState({
    ...current,
    nextSequence: sequence + 1,
    cues: bounded,
  });
}

export function advanceCombatReadability(state, currentTick) {
  const current = normalizeState(state);
  const tick = nonNegativeInteger(currentTick, 'Combat readability currentTick');
  const cues = current.cues.filter((cue) => cue.createdTick + cue.durationTicks > tick);
  if (cues.length === current.cues.length) return current;
  return normalizeState({ ...current, cues });
}

export function createRangeRingSnapshot(sources = []) {
  if (!Array.isArray(sources)) throw new TypeError('Combat range-ring sources must be an array.');
  const rings = sources
    .filter((source) => source?.selected === true && source.visible !== false)
    .map((source) => {
      const maxRange = nonNegativeFinite(source.maxRange ?? source.range, 'Combat range-ring maxRange');
      const minRange = nonNegativeFinite(source.minRange ?? 0, 'Combat range-ring minRange');
      if (minRange > maxRange) throw new RangeError('Combat range-ring minRange must not exceed maxRange.');
      return Object.freeze({
        entityId: stableId(source.id, 'Combat range-ring entity ID'),
        position: normalizePoint(source.position ?? source, 'Combat range-ring position'),
        minRange,
        maxRange,
        domain: optionalText(source.domain ?? null, 'Combat range-ring domain'),
      });
    })
    .sort((left, right) => compareIds(left.entityId, right.entityId));
  return Object.freeze(rings);
}

export function createTargetLineSnapshot(sources = []) {
  if (!Array.isArray(sources)) throw new TypeError('Combat target-line sources must be an array.');
  const lines = sources
    .filter((source) => source?.selected === true && source.visible !== false && source.targetPosition)
    .map((source) => Object.freeze({
      sourceId: stableId(source.sourceId ?? source.id, 'Combat target-line source ID'),
      targetId: stableId(source.targetId ?? null, 'Combat target-line target ID', { nullable: true }),
      from: normalizePoint(source.position ?? source.from, 'Combat target-line source position'),
      to: normalizePoint(source.targetPosition ?? source.to, 'Combat target-line target position'),
      command: optionalText(source.command ?? null, 'Combat target-line command'),
    }))
    .sort((left, right) => compareIds(left.sourceId, right.sourceId));
  return Object.freeze(lines);
}

function compareCues(left, right) {
  return (
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    KIND_RANK[left.kind] - KIND_RANK[right.kind] ||
    left.createdTick - right.createdTick ||
    left.sequence - right.sequence
  );
}

export function createCombatReadabilitySnapshot({
  state,
  currentTick,
  rangeSources = [],
  targetSources = [],
}) {
  const current = advanceCombatReadability(state, currentTick);
  const cues = current.cues
    .map((cue) => Object.freeze({
      ...cue,
      remainingTicks: cue.createdTick + cue.durationTicks - currentTick,
    }))
    .sort(compareCues);
  return Object.freeze({
    version: COMBAT_READABILITY_VERSION,
    tick: currentTick,
    preferences: current.preferences,
    rangeRings: createRangeRingSnapshot(rangeSources),
    targetLines: createTargetLineSnapshot(targetSources),
    cues: Object.freeze(cues),
  });
}
