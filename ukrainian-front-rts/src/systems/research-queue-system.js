export const RESEARCH_QUEUE_VERSION = 1;

export const RESEARCH_CONTENTION_POLICIES = Object.freeze({
  RESEARCH_PAUSES: 'researchPauses',
  PRODUCTION_PAUSES: 'productionPauses',
  PARALLEL: 'parallel',
});

export const RESEARCH_ITEM_STATUSES = Object.freeze({
  QUEUED: 'queued',
  ACTIVE: 'active',
  PAUSED: 'paused',
});

export const RESEARCH_EVENT_TYPES = Object.freeze({
  QUEUED: 'researchQueued',
  STARTED: 'researchStarted',
  COMPLETED: 'researchCompleted',
  CANCELLED: 'researchCancelled',
  PAUSE_CHANGED: 'researchPauseChanged',
});

const CONTENTION_VALUES = new Set(Object.values(RESEARCH_CONTENTION_POLICIES));
const EPSILON = 1e-9;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function stableUniqueStrings(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const normalized = values.map((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(`${label} must contain non-empty strings.`);
    }
    return value.trim();
  });
  return [...new Set(normalized)].sort();
}

function normalizeCost(cost = {}) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) {
    throw new TypeError('Research cost must be an object.');
  }
  const result = {};
  for (const resource of Object.keys(cost).sort()) {
    const amount = Number(cost[resource]);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new TypeError(`Research cost for ${resource} must be a non-negative finite number.`);
    }
    if (amount > 0) result[resource] = amount;
  }
  return result;
}

function copyCost(cost) {
  return Object.fromEntries(Object.entries(cost));
}

function addCost(left, right) {
  const result = { ...left };
  for (const [resource, amount] of Object.entries(right)) {
    result[resource] = (result[resource] || 0) + amount;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function refundCost(cost, fraction) {
  const result = {};
  for (const [resource, amount] of Object.entries(cost)) {
    const refunded = Math.max(0, Math.min(amount, Math.floor(amount * fraction + EPSILON)));
    if (refunded > 0) result[resource] = refunded;
  }
  return result;
}

function event(type, payload) {
  return deepFreeze({
    version: RESEARCH_QUEUE_VERSION,
    type,
    ...payload,
  });
}

function cloneItem(item) {
  return {
    id: item.id,
    techId: item.techId,
    name: item.name,
    duration: item.duration,
    remaining: item.remaining,
    cost: copyCost(item.cost),
    requires: [...item.requires],
    exclusiveGroup: item.exclusiveGroup,
    started: Boolean(item.started),
    sequence: item.sequence,
  };
}

function assertState(state) {
  if (!state || state.version !== RESEARCH_QUEUE_VERSION || !Array.isArray(state.queue)) {
    throw new TypeError('Research queue state must come from createResearchQueueState().');
  }
}

function mutableState(state) {
  assertState(state);
  return {
    version: RESEARCH_QUEUE_VERSION,
    facilityId: state.facilityId,
    maxQueueLength: state.maxQueueLength,
    contentionPolicy: state.contentionPolicy,
    paused: state.paused,
    nextSequence: state.nextSequence,
    completedTechIds: [...state.completedTechIds],
    exclusiveSelections: { ...state.exclusiveSelections },
    queue: state.queue.map(cloneItem),
  };
}

function freezeState(state) {
  state.completedTechIds = [...new Set(state.completedTechIds)].sort();
  state.exclusiveSelections = Object.fromEntries(
    Object.entries(state.exclusiveSelections).sort(([a], [b]) => a.localeCompare(b)),
  );
  return deepFreeze(state);
}

export function createResearchDefinition({
  id,
  name = null,
  researchTime,
  cost = {},
  requires = [],
  exclusiveGroup = null,
} = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('Research definition id is required.');
  if (!Number.isFinite(researchTime) || researchTime <= 0) {
    throw new TypeError('Research time must be a positive finite number.');
  }
  if (name != null && (typeof name !== 'string' || !name.trim())) {
    throw new TypeError('Research name must be null or a non-empty string.');
  }
  if (exclusiveGroup != null && (typeof exclusiveGroup !== 'string' || !exclusiveGroup.trim())) {
    throw new TypeError('Research exclusiveGroup must be null or a non-empty string.');
  }
  return deepFreeze({
    id: id.trim(),
    name: name?.trim() || id.trim(),
    researchTime,
    cost: normalizeCost(cost),
    requires: stableUniqueStrings(requires, 'Research prerequisites'),
    exclusiveGroup: exclusiveGroup?.trim() || null,
  });
}

export function createResearchQueueState({
  facilityId,
  maxQueueLength = 5,
  contentionPolicy = RESEARCH_CONTENTION_POLICIES.RESEARCH_PAUSES,
  completedTechIds = [],
  exclusiveSelections = {},
} = {}) {
  if (typeof facilityId !== 'string' || !facilityId.trim()) {
    throw new TypeError('Research facilityId is required.');
  }
  if (!Number.isInteger(maxQueueLength) || maxQueueLength < 1) {
    throw new TypeError('Research maxQueueLength must be a positive integer.');
  }
  if (!CONTENTION_VALUES.has(contentionPolicy)) {
    throw new TypeError(`Unknown research contention policy: ${contentionPolicy}`);
  }
  if (!exclusiveSelections || typeof exclusiveSelections !== 'object' || Array.isArray(exclusiveSelections)) {
    throw new TypeError('Research exclusiveSelections must be an object.');
  }
  const normalizedSelections = {};
  for (const [group, techId] of Object.entries(exclusiveSelections)) {
    if (!group.trim() || typeof techId !== 'string' || !techId.trim()) {
      throw new TypeError('Research exclusiveSelections must map non-empty group IDs to tech IDs.');
    }
    normalizedSelections[group.trim()] = techId.trim();
  }
  return freezeState({
    version: RESEARCH_QUEUE_VERSION,
    facilityId: facilityId.trim(),
    maxQueueLength,
    contentionPolicy,
    paused: false,
    nextSequence: 1,
    completedTechIds: stableUniqueStrings(completedTechIds, 'Completed technology IDs'),
    exclusiveSelections: normalizedSelections,
    queue: [],
  });
}

export function validateResearchRequest(state, definition, { availableResources = {} } = {}) {
  assertState(state);
  const tech = createResearchDefinition(definition);
  const resources = normalizeCost(availableResources);
  if (state.queue.length >= state.maxQueueLength) {
    return deepFreeze({ ok: false, reason: 'Research queue is full.' });
  }
  if (state.completedTechIds.includes(tech.id)) {
    return deepFreeze({ ok: false, reason: 'Technology is already researched.' });
  }
  if (state.queue.some((item) => item.techId === tech.id)) {
    return deepFreeze({ ok: false, reason: 'Technology is already queued.' });
  }
  const missing = tech.requires.filter((id) => !state.completedTechIds.includes(id));
  if (missing.length) {
    return deepFreeze({ ok: false, reason: 'Research prerequisites are incomplete.', missing });
  }
  if (
    tech.exclusiveGroup &&
    state.exclusiveSelections[tech.exclusiveGroup] &&
    state.exclusiveSelections[tech.exclusiveGroup] !== tech.id
  ) {
    return deepFreeze({
      ok: false,
      reason: 'A mutually exclusive technology has already been selected.',
      selectedTechId: state.exclusiveSelections[tech.exclusiveGroup],
    });
  }
  const insufficient = Object.entries(tech.cost)
    .filter(([resource, amount]) => (resources[resource] || 0) < amount)
    .map(([resource]) => resource);
  if (insufficient.length) {
    return deepFreeze({ ok: false, reason: 'Insufficient resources for research.', insufficient });
  }
  return deepFreeze({ ok: true, definition: tech });
}

export function queueResearch(state, definition, context = {}) {
  const validation = validateResearchRequest(state, definition, context);
  if (!validation.ok) return deepFreeze({ ...validation, state });
  const next = mutableState(state);
  const tech = validation.definition;
  const sequence = next.nextSequence++;
  const item = {
    id: `${next.facilityId}:research:${sequence}`,
    techId: tech.id,
    name: tech.name,
    duration: tech.researchTime,
    remaining: tech.researchTime,
    cost: copyCost(tech.cost),
    requires: [...tech.requires],
    exclusiveGroup: tech.exclusiveGroup,
    started: false,
    sequence,
  };
  next.queue.push(item);
  return deepFreeze({
    ok: true,
    state: freezeState(next),
    charged: copyCost(item.cost),
    event: event(RESEARCH_EVENT_TYPES.QUEUED, {
      facilityId: next.facilityId,
      itemId: item.id,
      techId: item.techId,
      sequence: item.sequence,
    }),
  });
}

export function cancelResearch(state, itemId) {
  assertState(state);
  if (typeof itemId !== 'string' || !itemId) {
    return deepFreeze({ ok: false, reason: 'Choose a valid research queue item.', state });
  }
  const index = state.queue.findIndex((item) => item.id === itemId);
  if (index < 0) return deepFreeze({ ok: false, reason: 'Research queue item was not found.', state });
  const next = mutableState(state);
  const [item] = next.queue.splice(index, 1);
  const refundFraction = item.started
    ? Math.max(0, Math.min(1, item.remaining / item.duration))
    : 1;
  const refunded = refundCost(item.cost, refundFraction);
  return deepFreeze({
    ok: true,
    state: freezeState(next),
    item: deepFreeze(cloneItem(item)),
    refundFraction,
    refunded,
    event: event(RESEARCH_EVENT_TYPES.CANCELLED, {
      facilityId: next.facilityId,
      itemId: item.id,
      techId: item.techId,
      refundFraction,
      refunded,
    }),
  });
}

export function setResearchPaused(state, paused) {
  const next = mutableState(state);
  next.paused = Boolean(paused);
  return deepFreeze({
    ok: true,
    state: freezeState(next),
    event: event(RESEARCH_EVENT_TYPES.PAUSE_CHANGED, {
      facilityId: next.facilityId,
      paused: next.paused,
    }),
  });
}

export function resolveResearchContention(state, { productionBusy = false } = {}) {
  assertState(state);
  if (state.paused) {
    return deepFreeze({ researchAdvances: false, productionBlocked: false, reason: 'Research is paused.' });
  }
  if (!productionBusy) {
    return deepFreeze({ researchAdvances: true, productionBlocked: false, reason: '' });
  }
  if (state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.RESEARCH_PAUSES) {
    return deepFreeze({
      researchAdvances: false,
      productionBlocked: false,
      reason: 'Production is using this facility.',
    });
  }
  if (state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.PRODUCTION_PAUSES) {
    return deepFreeze({
      researchAdvances: true,
      productionBlocked: true,
      reason: 'Research is using this facility.',
    });
  }
  return deepFreeze({ researchAdvances: true, productionBlocked: false, reason: '' });
}

export function updateResearchQueue(state, elapsedSeconds, context = {}) {
  assertState(state);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Research elapsedSeconds must be a non-negative finite number.');
  }
  const contention = resolveResearchContention(state, context);
  if (elapsedSeconds <= EPSILON || !state.queue.length || !contention.researchAdvances) {
    return deepFreeze({
      state,
      events: [],
      completedTechIds: [],
      productionBlocked: contention.productionBlocked,
      blockedReason: contention.reason,
      consumedSeconds: 0,
      unusedSeconds: elapsedSeconds,
    });
  }

  const next = mutableState(state);
  const events = [];
  const completedTechIds = [];
  let remainingStep = elapsedSeconds;
  let consumedSeconds = 0;
  let safety = next.maxQueueLength * 4;

  while (remainingStep > EPSILON && next.queue.length && safety-- > 0) {
    const item = next.queue[0];
    if (!item.started) {
      item.started = true;
      events.push(event(RESEARCH_EVENT_TYPES.STARTED, {
        facilityId: next.facilityId,
        itemId: item.id,
        techId: item.techId,
        sequence: item.sequence,
      }));
    }
    const consumed = Math.min(remainingStep, item.remaining);
    item.remaining = Math.max(0, item.remaining - consumed);
    remainingStep -= consumed;
    consumedSeconds += consumed;
    if (item.remaining > EPSILON) break;

    next.queue.shift();
    next.completedTechIds.push(item.techId);
    if (item.exclusiveGroup) next.exclusiveSelections[item.exclusiveGroup] = item.techId;
    completedTechIds.push(item.techId);
    events.push(event(RESEARCH_EVENT_TYPES.COMPLETED, {
      facilityId: next.facilityId,
      itemId: item.id,
      techId: item.techId,
      sequence: item.sequence,
    }));
  }

  return deepFreeze({
    state: freezeState(next),
    events,
    completedTechIds,
    productionBlocked: contention.productionBlocked,
    blockedReason: contention.reason,
    consumedSeconds,
    unusedSeconds: remainingStep,
  });
}

function itemStatus(item, index, state, contention) {
  if (state.paused || (index === 0 && !contention.researchAdvances)) {
    return RESEARCH_ITEM_STATUSES.PAUSED;
  }
  return index === 0 ? RESEARCH_ITEM_STATUSES.ACTIVE : RESEARCH_ITEM_STATUSES.QUEUED;
}

export function describeResearchQueue(state, context = {}) {
  assertState(state);
  const contention = resolveResearchContention(state, context);
  const items = state.queue.map((item, index) => {
    const elapsed = item.duration - item.remaining;
    const progress = item.duration <= EPSILON ? 1 : Math.max(0, Math.min(1, elapsed / item.duration));
    return deepFreeze({
      id: item.id,
      techId: item.techId,
      name: item.name,
      status: itemStatus(item, index, state, contention),
      position: index,
      duration: item.duration,
      remaining: item.remaining,
      elapsed,
      progress,
      percent: Math.floor(progress * 100 + EPSILON),
      cancellable: true,
    });
  });
  return deepFreeze({
    version: RESEARCH_QUEUE_VERSION,
    facilityId: state.facilityId,
    paused: state.paused,
    contentionPolicy: state.contentionPolicy,
    productionBlocked: contention.productionBlocked,
    blockedReason: contention.reason,
    queueLength: items.length,
    maxQueueLength: state.maxQueueLength,
    active: items[0] || null,
    items,
    completedTechIds: [...state.completedTechIds],
  });
}

export function totalResearchRefund(state) {
  assertState(state);
  let total = {};
  for (const item of state.queue) {
    const fraction = item.started ? Math.max(0, Math.min(1, item.remaining / item.duration)) : 1;
    total = addCost(total, refundCost(item.cost, fraction));
  }
  return deepFreeze(total);
}
