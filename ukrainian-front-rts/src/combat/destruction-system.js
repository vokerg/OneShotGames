import { TARGET_DOMAINS } from './combat-schema.js';

export const DESTRUCTION_SYSTEM_VERSION = 1;

export const DAMAGE_CONDITIONS = Object.freeze({
  HEALTHY: 'healthy',
  DAMAGED: 'damaged',
  DISABLED: 'disabled',
});

export const DESTRUCTION_PHASES = Object.freeze({
  ACTIVE: 'active',
  BURNING: 'burning',
  DESTROYED: 'destroyed',
  WRECK: 'wreck',
  SALVAGED: 'salvaged',
  CLEARED: 'cleared',
});

export const BAILOUT_TRIGGERS = Object.freeze({
  DISABLED: 'disabled',
  BURNING: 'burning',
  DESTROYED: 'destroyed',
});

const CONDITION_VALUES = new Set(Object.values(DAMAGE_CONDITIONS));
const PHASE_VALUES = new Set(Object.values(DESTRUCTION_PHASES));
const TRIGGER_VALUES = new Set(Object.values(BAILOUT_TRIGGERS));
const DOMAIN_VALUES = new Set(Object.values(TARGET_DOMAINS));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function normalizePoint(point, label = 'position') {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
  return deepFreeze({ x: point.x, y: point.y });
}

function sortedResourceRecord(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Resource values must be an object.');
  }
  const entries = Object.entries(record)
    .map(([resource, value]) => [resource, finiteNonNegative(Number(value), `Resource ${resource}`)])
    .filter(([, value]) => value > 0)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return deepFreeze(Object.fromEntries(entries));
}

function normalizeDomains(domains, label) {
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new TypeError(`${label} must be a non-empty array.`);
  }
  const unique = [...new Set(domains)];
  if (unique.some((domain) => !DOMAIN_VALUES.has(domain))) {
    throw new TypeError(`${label} contains an unknown target domain.`);
  }
  unique.sort();
  return deepFreeze(unique);
}

export function createDestructionPolicy(overrides = {}) {
  const policy = {
    schemaVersion: DESTRUCTION_SYSTEM_VERSION,
    damagedThresholdRatio: overrides.damagedThresholdRatio ?? 0.65,
    disabledThresholdRatio: overrides.disabledThresholdRatio ?? 0.25,
    autoIgniteWhenDisabled: overrides.autoIgniteWhenDisabled ?? false,
    burnDamagePerSecond: overrides.burnDamagePerSecond ?? 8,
    burnDurationSeconds: overrides.burnDurationSeconds ?? 10,
    destroyWhenBurnExpires: overrides.destroyWhenBurnExpires ?? true,
    bailoutTrigger: overrides.bailoutTrigger ?? BAILOUT_TRIGGERS.DISABLED,
    bailoutDomains: normalizeDomains(
      overrides.bailoutDomains ?? [TARGET_DOMAINS.GROUND],
      'bailoutDomains',
    ),
    bailoutSurvivorRatio: overrides.bailoutSurvivorRatio ?? 0.75,
    burningSurvivorPenalty: overrides.burningSurvivorPenalty ?? 0.35,
    destroyedSurvivorPenalty: overrides.destroyedSurvivorPenalty ?? 0.25,
    wreckHpRatio: overrides.wreckHpRatio ?? 0.3,
    salvageValueRatio: overrides.salvageValueRatio ?? 0.25,
    salvageWorkRequired: overrides.salvageWorkRequired ?? 100,
    clearObstructionOnSalvage: overrides.clearObstructionOnSalvage ?? true,
    wreckBlocksMovement: overrides.wreckBlocksMovement ?? true,
    wreckBlocksLineOfSight: overrides.wreckBlocksLineOfSight ?? false,
  };
  const errors = validateDestructionPolicy(policy);
  if (errors.length) throw new TypeError(errors.join('; '));
  return deepFreeze(policy);
}

export const DEFAULT_DESTRUCTION_POLICY = createDestructionPolicy();

export function validateDestructionPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['destruction policy must be an object'];
  if (policy.schemaVersion !== DESTRUCTION_SYSTEM_VERSION) {
    errors.push(`schemaVersion must be ${DESTRUCTION_SYSTEM_VERSION}`);
  }
  for (const key of ['damagedThresholdRatio', 'disabledThresholdRatio']) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0 || policy[key] > 1) {
      errors.push(`${key} must be between 0 and 1`);
    }
  }
  if (
    Number.isFinite(policy.damagedThresholdRatio) &&
    Number.isFinite(policy.disabledThresholdRatio) &&
    policy.disabledThresholdRatio > policy.damagedThresholdRatio
  ) {
    errors.push('disabledThresholdRatio cannot exceed damagedThresholdRatio');
  }
  for (const key of [
    'bailoutSurvivorRatio',
    'burningSurvivorPenalty',
    'destroyedSurvivorPenalty',
    'wreckHpRatio',
    'salvageValueRatio',
  ]) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0 || policy[key] > 1) {
      errors.push(`${key} must be between 0 and 1`);
    }
  }
  for (const key of ['burnDamagePerSecond', 'burnDurationSeconds', 'salvageWorkRequired']) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      errors.push(`${key} must be a positive finite number`);
    }
  }
  if (!TRIGGER_VALUES.has(policy.bailoutTrigger)) {
    errors.push(`unknown bailoutTrigger: ${policy.bailoutTrigger}`);
  }
  if (
    !Array.isArray(policy.bailoutDomains) ||
    policy.bailoutDomains.length === 0 ||
    policy.bailoutDomains.some((domain) => !DOMAIN_VALUES.has(domain))
  ) {
    errors.push('bailoutDomains must contain known target domains');
  }
  for (const key of [
    'autoIgniteWhenDisabled',
    'destroyWhenBurnExpires',
    'clearObstructionOnSalvage',
    'wreckBlocksMovement',
    'wreckBlocksLineOfSight',
  ]) {
    if (typeof policy[key] !== 'boolean') errors.push(`${key} must be boolean`);
  }
  return errors;
}

function assertPolicy(policy) {
  const errors = validateDestructionPolicy(policy);
  if (errors.length) throw new TypeError(errors.join('; '));
}

function normalizeEntity(entity) {
  if (!entity || typeof entity !== 'object') throw new TypeError('Destruction entity must be an object.');
  if (entity.id == null || String(entity.id).length === 0) {
    throw new TypeError('Destruction entity requires a stable id.');
  }
  const maxHp = positiveFinite(Number(entity.maxHp), 'Entity maxHp');
  const hp = clamp(finiteNonNegative(Number(entity.hp), 'Entity hp'), 0, maxHp);
  if (!DOMAIN_VALUES.has(entity.domain)) throw new TypeError(`Unknown entity domain: ${entity.domain}`);
  const crew = entity.crew == null ? 0 : Math.floor(finiteNonNegative(Number(entity.crew), 'Entity crew'));
  const position = normalizePoint(entity.position ?? entity, 'Entity position');
  const radius = finiteNonNegative(Number(entity.radius ?? 0), 'Entity radius');
  return {
    id: String(entity.id),
    team: entity.team ?? null,
    domain: entity.domain,
    maxHp,
    hp,
    crew,
    position,
    radius,
    footprint: entity.footprint == null ? null : deepFreeze({ ...entity.footprint }),
    cost: sortedResourceRecord(entity.cost ?? {}),
    salvageBase: entity.salvageBase == null ? null : sortedResourceRecord(entity.salvageBase),
  };
}

export function deriveDamageCondition(hp, maxHp, policy = DEFAULT_DESTRUCTION_POLICY) {
  assertPolicy(policy);
  const normalizedMax = positiveFinite(Number(maxHp), 'maxHp');
  const ratio = clamp(finiteNonNegative(Number(hp), 'hp') / normalizedMax);
  if (ratio <= policy.disabledThresholdRatio) return DAMAGE_CONDITIONS.DISABLED;
  if (ratio <= policy.damagedThresholdRatio) return DAMAGE_CONDITIONS.DAMAGED;
  return DAMAGE_CONDITIONS.HEALTHY;
}

function event(type, state, details = {}) {
  return deepFreeze({
    type,
    entityId: state.entityId,
    sequence: state.sequence,
    ...details,
  });
}

function freezeResult(state, events = [], extra = {}) {
  return deepFreeze({ state: deepFreeze(state), events: deepFreeze([...events]), ...extra });
}

function assertState(state, entity) {
  if (!state || typeof state !== 'object' || state.schemaVersion !== DESTRUCTION_SYSTEM_VERSION) {
    throw new TypeError('Destruction state must come from createDestructionState().');
  }
  if (!PHASE_VALUES.has(state.phase) || !CONDITION_VALUES.has(state.condition)) {
    throw new TypeError('Destruction state contains an unknown phase or condition.');
  }
  if (entity && String(entity.id) !== state.entityId) {
    throw new TypeError('Destruction state and entity ids do not match.');
  }
}

export function createDestructionState(entity, policy = DEFAULT_DESTRUCTION_POLICY) {
  assertPolicy(policy);
  const normalized = normalizeEntity(entity);
  const condition = deriveDamageCondition(normalized.hp, normalized.maxHp, policy);
  return deepFreeze({
    schemaVersion: DESTRUCTION_SYSTEM_VERSION,
    entityId: normalized.id,
    phase: normalized.hp === 0 ? DESTRUCTION_PHASES.DESTROYED : DESTRUCTION_PHASES.ACTIVE,
    condition,
    hp: normalized.hp,
    maxHp: normalized.maxHp,
    burningRemaining: 0,
    bailout: null,
    wreck: null,
    recoveredSalvage: deepFreeze({}),
    sequence: 0,
    lastTransition: normalized.hp === 0 ? 'initially-destroyed' : 'initialized',
  });
}

const TRIGGER_RANK = Object.freeze({
  [BAILOUT_TRIGGERS.DISABLED]: 1,
  [BAILOUT_TRIGGERS.BURNING]: 2,
  [BAILOUT_TRIGGERS.DESTROYED]: 3,
});

function reachedBailoutTrigger(policy, state) {
  const currentRank =
    state.phase === DESTRUCTION_PHASES.DESTROYED
      ? TRIGGER_RANK.destroyed
      : state.phase === DESTRUCTION_PHASES.BURNING
        ? TRIGGER_RANK.burning
        : state.condition === DAMAGE_CONDITIONS.DISABLED
          ? TRIGGER_RANK.disabled
          : 0;
  return currentRank >= TRIGGER_RANK[policy.bailoutTrigger];
}

function createBailout(state, entity, policy) {
  if (
    state.bailout ||
    entity.crew <= 0 ||
    !policy.bailoutDomains.includes(entity.domain) ||
    !reachedBailoutTrigger(policy, state)
  ) {
    return null;
  }
  let survivorRatio = policy.bailoutSurvivorRatio;
  if (state.phase === DESTRUCTION_PHASES.BURNING) survivorRatio -= policy.burningSurvivorPenalty;
  if (state.phase === DESTRUCTION_PHASES.DESTROYED) survivorRatio -= policy.destroyedSurvivorPenalty;
  const survivors = Math.floor(entity.crew * clamp(survivorRatio));
  return deepFreeze({
    sourceEntityId: entity.id,
    team: entity.team,
    survivors,
    casualties: entity.crew - survivors,
    position: entity.position,
    trigger:
      state.phase === DESTRUCTION_PHASES.DESTROYED
        ? BAILOUT_TRIGGERS.DESTROYED
        : state.phase === DESTRUCTION_PHASES.BURNING
          ? BAILOUT_TRIGGERS.BURNING
          : BAILOUT_TRIGGERS.DISABLED,
  });
}

function withBailout(state, entity, policy, events) {
  const bailout = createBailout(state, entity, policy);
  if (!bailout) return state;
  const next = { ...state, bailout, sequence: state.sequence + 1, lastTransition: 'crew-bailed-out' };
  events.push(event('crew-bailed-out', next, { bailout }));
  return next;
}

function transitionAfterHpChange(state, entity, nextHp, { ignite = false } = {}, policy) {
  const events = [];
  const previousCondition = state.condition;
  const condition = deriveDamageCondition(nextHp, state.maxHp, policy);
  let next = {
    ...state,
    hp: nextHp,
    condition,
    sequence: state.sequence + 1,
    lastTransition: 'damage-applied',
  };

  if (condition !== previousCondition) {
    events.push(event('condition-changed', next, { from: previousCondition, to: condition }));
  }

  if (nextHp === 0) {
    next = {
      ...next,
      phase: DESTRUCTION_PHASES.DESTROYED,
      burningRemaining: 0,
      sequence: next.sequence + 1,
      lastTransition: 'destroyed',
    };
    events.push(event('entity-destroyed', next, { hp: 0 }));
    next = withBailout(next, entity, policy, events);
    return freezeResult(next, events);
  }

  const shouldBurn =
    state.phase === DESTRUCTION_PHASES.BURNING ||
    ignite === true ||
    (policy.autoIgniteWhenDisabled && condition === DAMAGE_CONDITIONS.DISABLED);

  if (shouldBurn) {
    const enteringBurning = state.phase !== DESTRUCTION_PHASES.BURNING;
    next = {
      ...next,
      phase: DESTRUCTION_PHASES.BURNING,
      burningRemaining: enteringBurning ? policy.burnDurationSeconds : state.burningRemaining,
      sequence: next.sequence + (enteringBurning ? 1 : 0),
      lastTransition: enteringBurning ? 'ignited' : next.lastTransition,
    };
    if (enteringBurning) {
      events.push(event('burning-started', next, { duration: next.burningRemaining }));
    }
  } else {
    next.phase = DESTRUCTION_PHASES.ACTIVE;
  }

  next = withBailout(next, entity, policy, events);
  return freezeResult(next, events);
}

export function applyDestructionDamage(
  state,
  entity,
  amount,
  context = {},
  policy = DEFAULT_DESTRUCTION_POLICY,
) {
  assertPolicy(policy);
  const normalized = normalizeEntity(entity);
  assertState(state, normalized);
  finiteNonNegative(Number(amount), 'Damage amount');
  if (![DESTRUCTION_PHASES.ACTIVE, DESTRUCTION_PHASES.BURNING].includes(state.phase)) {
    return freezeResult(state, [], { appliedDamage: 0, reason: 'not-damageable' });
  }
  const appliedDamage = Math.min(state.hp, Number(amount));
  if (appliedDamage === 0 && context.ignite !== true) {
    return freezeResult(state, [], { appliedDamage: 0, reason: 'no-damage' });
  }
  const result = transitionAfterHpChange(
    state,
    normalized,
    state.hp - appliedDamage,
    { ignite: context.ignite === true },
    policy,
  );
  return deepFreeze({ ...result, appliedDamage, reason: null });
}

export function tickBurning(
  state,
  entity,
  elapsedSeconds,
  policy = DEFAULT_DESTRUCTION_POLICY,
) {
  assertPolicy(policy);
  const normalized = normalizeEntity(entity);
  assertState(state, normalized);
  finiteNonNegative(Number(elapsedSeconds), 'Burning elapsedSeconds');
  if (state.phase !== DESTRUCTION_PHASES.BURNING) {
    return freezeResult(state, [], { appliedDamage: 0, reason: 'not-burning' });
  }
  if (elapsedSeconds === 0) return freezeResult(state, [], { appliedDamage: 0, reason: null });

  const activeTime = Math.min(elapsedSeconds, state.burningRemaining);
  const appliedDamage = Math.min(state.hp, policy.burnDamagePerSecond * activeTime);
  let result = transitionAfterHpChange(
    { ...state, burningRemaining: Math.max(0, state.burningRemaining - activeTime) },
    normalized,
    state.hp - appliedDamage,
    { ignite: true },
    policy,
  );

  if (
    result.state.phase === DESTRUCTION_PHASES.BURNING &&
    result.state.burningRemaining === 0
  ) {
    if (policy.destroyWhenBurnExpires) {
      result = transitionAfterHpChange(
        result.state,
        normalized,
        0,
        { ignite: false },
        policy,
      );
    } else {
      const extinguished = {
        ...result.state,
        phase: DESTRUCTION_PHASES.ACTIVE,
        burningRemaining: 0,
        sequence: result.state.sequence + 1,
        lastTransition: 'burning-ended',
      };
      result = freezeResult(extinguished, [
        ...result.events,
        event('burning-ended', extinguished, { destroyed: false }),
      ]);
    }
  }
  return deepFreeze({ ...result, appliedDamage, reason: null });
}

function computeSalvageValue(entity, policy) {
  if (entity.salvageBase) return entity.salvageBase;
  return sortedResourceRecord(
    Object.fromEntries(
      Object.entries(entity.cost).map(([resource, value]) => [
        resource,
        Math.floor(value * policy.salvageValueRatio),
      ]),
    ),
  );
}

export function materializeWreck(
  state,
  entity,
  policy = DEFAULT_DESTRUCTION_POLICY,
) {
  assertPolicy(policy);
  const normalized = normalizeEntity(entity);
  assertState(state, normalized);
  if (state.phase !== DESTRUCTION_PHASES.DESTROYED) {
    return freezeResult(state, [], { reason: 'not-destroyed' });
  }

  const maxHp = Math.max(1, Math.ceil(normalized.maxHp * policy.wreckHpRatio));
  const salvageValue = computeSalvageValue(normalized, policy);
  const wreck = deepFreeze({
    id: `${normalized.id}:wreck`,
    sourceEntityId: normalized.id,
    team: normalized.team,
    domain: normalized.domain,
    position: normalized.position,
    radius: normalized.radius,
    footprint: normalized.footprint,
    hp: maxHp,
    maxHp,
    salvageValue,
    salvageWorkRemaining: policy.salvageWorkRequired,
    obstruction: deepFreeze({
      blocksMovement: policy.wreckBlocksMovement,
      blocksLineOfSight: policy.wreckBlocksLineOfSight,
      cleared: false,
    }),
  });
  const next = {
    ...state,
    phase: DESTRUCTION_PHASES.WRECK,
    wreck,
    sequence: state.sequence + 1,
    lastTransition: 'wreck-created',
  };
  return freezeResult(next, [event('wreck-created', next, { wreck })], { reason: null });
}

function replaceWreck(state, wreck, transition) {
  return {
    ...state,
    wreck: deepFreeze(wreck),
    sequence: state.sequence + 1,
    lastTransition: transition,
  };
}

export function applyWreckSalvage(
  state,
  work,
  policy = DEFAULT_DESTRUCTION_POLICY,
) {
  assertPolicy(policy);
  assertState(state);
  finiteNonNegative(Number(work), 'Salvage work');
  if (state.phase !== DESTRUCTION_PHASES.WRECK) {
    return freezeResult(state, [], { appliedWork: 0, reason: 'not-wreck' });
  }
  const appliedWork = Math.min(state.wreck.salvageWorkRemaining, Number(work));
  if (appliedWork === 0) return freezeResult(state, [], { appliedWork: 0, reason: null });

  const remaining = state.wreck.salvageWorkRemaining - appliedWork;
  let next = replaceWreck(
    state,
    { ...state.wreck, salvageWorkRemaining: remaining },
    'salvage-progressed',
  );
  const events = [event('salvage-progressed', next, { appliedWork, remaining })];

  if (remaining === 0) {
    const obstruction = deepFreeze({
      ...next.wreck.obstruction,
      blocksMovement: policy.clearObstructionOnSalvage
        ? false
        : next.wreck.obstruction.blocksMovement,
      blocksLineOfSight: policy.clearObstructionOnSalvage
        ? false
        : next.wreck.obstruction.blocksLineOfSight,
      cleared: policy.clearObstructionOnSalvage,
    });
    next = {
      ...next,
      phase: DESTRUCTION_PHASES.SALVAGED,
      recoveredSalvage: next.wreck.salvageValue,
      wreck: deepFreeze({ ...next.wreck, obstruction }),
      sequence: next.sequence + 1,
      lastTransition: 'salvage-completed',
    };
    events.push(
      event('salvage-completed', next, {
        recoveredSalvage: next.recoveredSalvage,
        obstructionCleared: obstruction.cleared,
      }),
    );
  }
  return deepFreeze({ ...freezeResult(next, events), appliedWork, reason: null });
}

export function damageWreck(state, amount) {
  assertState(state);
  finiteNonNegative(Number(amount), 'Wreck damage');
  if (state.phase !== DESTRUCTION_PHASES.WRECK) {
    return freezeResult(state, [], { appliedDamage: 0, reason: 'not-wreck' });
  }
  const appliedDamage = Math.min(state.wreck.hp, Number(amount));
  if (appliedDamage === 0) return freezeResult(state, [], { appliedDamage: 0, reason: null });

  const hp = state.wreck.hp - appliedDamage;
  let next = replaceWreck(state, { ...state.wreck, hp }, 'wreck-damaged');
  const events = [event('wreck-damaged', next, { appliedDamage, hp })];

  if (hp === 0) {
    const obstruction = deepFreeze({
      ...next.wreck.obstruction,
      blocksMovement: false,
      blocksLineOfSight: false,
      cleared: true,
    });
    next = {
      ...next,
      phase: DESTRUCTION_PHASES.CLEARED,
      wreck: deepFreeze({ ...next.wreck, obstruction }),
      sequence: next.sequence + 1,
      lastTransition: 'wreck-destroyed',
    };
    events.push(event('obstruction-cleared', next, { reason: 'wreck-destroyed' }));
  }
  return deepFreeze({ ...freezeResult(next, events), appliedDamage, reason: null });
}

export function clearWreckObstruction(state, reason = 'manual-clearance') {
  assertState(state);
  if (![DESTRUCTION_PHASES.WRECK, DESTRUCTION_PHASES.SALVAGED].includes(state.phase)) {
    return freezeResult(state, [], { reason: 'not-clearable' });
  }
  if (state.wreck.obstruction.cleared) return freezeResult(state, [], { reason: null });
  const obstruction = deepFreeze({
    ...state.wreck.obstruction,
    blocksMovement: false,
    blocksLineOfSight: false,
    cleared: true,
  });
  const next = {
    ...state,
    phase: DESTRUCTION_PHASES.CLEARED,
    wreck: deepFreeze({ ...state.wreck, obstruction }),
    sequence: state.sequence + 1,
    lastTransition: reason,
  };
  return freezeResult(next, [event('obstruction-cleared', next, { reason })], { reason: null });
}
