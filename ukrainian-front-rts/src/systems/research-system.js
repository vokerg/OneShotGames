import { DOMAIN_EVENT_TYPES } from '../core/events.js';

export const RESEARCH_SYSTEM_VERSION = 1;
export const MAX_RESEARCH_QUEUE_LENGTH = 5;

export const RESEARCH_CONTENTION_POLICIES = Object.freeze({
  INDEPENDENT: 'independent',
  PRODUCTION_PRIORITY: 'production-priority',
  RESEARCH_PRIORITY: 'research-priority',
});

export const RESEARCH_RESULTS = Object.freeze({
  QUEUED: 'queued',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
  RESUMED: 'resumed',
  COMPLETED: 'completed',
  INVALID_PROFILE: 'invalid-profile',
  INVALID_FACILITY: 'invalid-facility',
  QUEUE_FULL: 'queue-full',
  ALREADY_COMPLETED: 'already-completed',
  ALREADY_QUEUED: 'already-queued',
  PREREQUISITE_MISSING: 'prerequisite-missing',
  FACTION_LOCKED: 'faction-locked',
  MISSION_LOCKED: 'mission-locked',
  EXCLUSIVE_CONFLICT: 'exclusive-conflict',
  INSUFFICIENT_RESOURCES: 'insufficient-resources',
  ITEM_NOT_FOUND: 'item-not-found',
});

const POLICY_VALUES = new Set(Object.values(RESEARCH_CONTENTION_POLICIES));
const EPSILON = 1e-9;
const freeze = (value) => Object.freeze(value);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative.`);
  return number;
}

function stableId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`${label} must be a stable non-empty identifier.`);
  }
  return String(value);
}

function normalizeIds(values = [], label = 'Identifiers') {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return freeze([...new Set(values.map((value) => stableId(value, label)))].sort());
}

function normalizeCost(cost = {}) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) {
    throw new TypeError('Research cost must be an object.');
  }
  const normalized = {};
  for (const key of Object.keys(cost).sort()) {
    const amount = nonNegative(cost[key], `Research cost ${key}`);
    if (amount > 0) normalized[key] = amount;
  }
  return freeze(normalized);
}

function immutableItem(item) {
  return freeze({
    ...item,
    cost: normalizeCost(item.cost),
    requires: normalizeIds(item.requires, 'Research prerequisites'),
    factions: normalizeIds(item.factions, 'Research factions'),
    missionLocks: normalizeIds(item.missionLocks, 'Research mission locks'),
  });
}

function immutableQueues(queues) {
  const normalized = {};
  for (const facilityId of Object.keys(queues).sort()) {
    normalized[facilityId] = freeze(queues[facilityId].map(immutableItem));
  }
  return freeze(normalized);
}

function normalizeExclusiveGroups(groups = {}) {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new TypeError('Chosen research exclusive groups must be an object.');
  }
  const normalized = {};
  for (const group of Object.keys(groups).sort()) {
    normalized[stableId(group, 'Research exclusive group')] = stableId(groups[group], 'Exclusive technology ID');
  }
  return freeze(normalized);
}

function immutableState(state, overrides = {}) {
  const next = { ...state, ...overrides };
  return freeze({
    ...next,
    completedTechIds: normalizeIds(next.completedTechIds, 'Completed technologies'),
    pausedFacilityIds: normalizeIds(next.pausedFacilityIds, 'Paused research facilities'),
    chosenExclusiveGroups: normalizeExclusiveGroups(next.chosenExclusiveGroups),
    queues: immutableQueues(next.queues),
  });
}

function assertState(state) {
  if (
    !state ||
    state.schemaVersion !== RESEARCH_SYSTEM_VERSION ||
    !Number.isInteger(state.nextItemId) ||
    state.nextItemId < 1 ||
    !POLICY_VALUES.has(state.contentionPolicy) ||
    !state.queues ||
    typeof state.queues !== 'object' ||
    Array.isArray(state.queues)
  ) {
    throw new TypeError('Research state must be created by createResearchState.');
  }
}

function success(state, status, details = {}) {
  return freeze({ ok: true, status, reason: null, state, ...details });
}

function failure(state, status, reason, details = {}) {
  return freeze({ ok: false, status, reason, state, ...details });
}

export function createResearchProfile({
  id,
  duration,
  cost = {},
  requires = [],
  factions = [],
  missionLocks = [],
  exclusiveGroup = null,
  label = null,
} = {}) {
  const techId = stableId(id, 'Research technology ID');
  const group = exclusiveGroup === null ? null : stableId(exclusiveGroup, 'Research exclusive group');
  const normalizedLabel = label === null ? techId : stableId(label, 'Research label');
  return freeze({
    id: techId,
    label: normalizedLabel,
    duration: positive(duration, 'Research duration'),
    cost: normalizeCost(cost),
    requires: normalizeIds(requires, 'Research prerequisites'),
    factions: normalizeIds(factions, 'Research factions'),
    missionLocks: normalizeIds(missionLocks, 'Research mission locks'),
    exclusiveGroup: group,
  });
}

export function validateResearchProfile(profile) {
  try {
    createResearchProfile(profile);
    return freeze([]);
  } catch (error) {
    return freeze([error.message]);
  }
}

export function createResearchState({
  completedTechIds = [],
  chosenExclusiveGroups = {},
  contentionPolicy = RESEARCH_CONTENTION_POLICIES.PRODUCTION_PRIORITY,
  maxQueueLength = MAX_RESEARCH_QUEUE_LENGTH,
} = {}) {
  if (!POLICY_VALUES.has(contentionPolicy)) {
    throw new RangeError(`Unknown research contention policy: ${String(contentionPolicy)}`);
  }
  if (!Number.isInteger(maxQueueLength) || maxQueueLength < 1) {
    throw new RangeError('Research max queue length must be a positive integer.');
  }
  return immutableState({
    schemaVersion: RESEARCH_SYSTEM_VERSION,
    nextItemId: 1,
    contentionPolicy,
    maxQueueLength,
    completedTechIds,
    pausedFacilityIds: [],
    chosenExclusiveGroups,
    queues: {},
  });
}

function queuedItems(state) {
  return Object.values(state.queues).flat();
}

function canAfford(resources, cost) {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return false;
  return Object.entries(cost).every(([kind, amount]) => Number(resources[kind] ?? 0) >= amount);
}

function techAvailability(profile, context) {
  const available = context.availableTechIds;
  if (available !== undefined && !new Set(available.map(String)).has(profile.id)) return 'not-available';
  const locked = new Set((context.lockedTechIds ?? []).map(String));
  if (locked.has(profile.id)) return 'explicitly-locked';
  if (context.missionId !== undefined && profile.missionLocks.includes(String(context.missionId))) return 'mission-lock';
  return null;
}

function prerequisiteMissing(state, profile) {
  const completed = new Set(state.completedTechIds);
  return profile.requires.find((id) => !completed.has(id)) ?? null;
}

function exclusiveConflict(state, profile) {
  if (!profile.exclusiveGroup) return null;
  const completedConflict = state.chosenExclusiveGroups[profile.exclusiveGroup];
  if (completedConflict) return completedConflict;
  return queuedItems(state).find((item) => item.exclusiveGroup === profile.exclusiveGroup)?.techId ?? null;
}

function itemFrom(profile, facilityId, sequence) {
  return immutableItem({
    id: `research:${sequence}`,
    techId: profile.id,
    label: profile.label,
    facilityId,
    duration: profile.duration,
    remaining: profile.duration,
    cost: profile.cost,
    requires: profile.requires,
    factions: profile.factions,
    missionLocks: profile.missionLocks,
    exclusiveGroup: profile.exclusiveGroup,
    started: false,
  });
}

export function enqueueResearch(state, profileInput, context = {}) {
  assertState(state);
  let profile;
  try {
    profile = createResearchProfile(profileInput);
  } catch (error) {
    return failure(state, RESEARCH_RESULTS.INVALID_PROFILE, error.message);
  }
  let facilityId;
  try {
    facilityId = stableId(context.facilityId, 'Research facility ID');
  } catch (error) {
    return failure(state, RESEARCH_RESULTS.INVALID_FACILITY, error.message);
  }
  const queue = state.queues[facilityId] ?? [];
  if (queue.length >= state.maxQueueLength) {
    return failure(state, RESEARCH_RESULTS.QUEUE_FULL, 'Research queue is full.', { facilityId });
  }
  if (state.completedTechIds.includes(profile.id)) {
    return failure(state, RESEARCH_RESULTS.ALREADY_COMPLETED, 'Technology is already completed.', { techId: profile.id });
  }
  if (queuedItems(state).some((item) => item.techId === profile.id)) {
    return failure(state, RESEARCH_RESULTS.ALREADY_QUEUED, 'Technology is already queued.', { techId: profile.id });
  }
  const missing = prerequisiteMissing(state, profile);
  if (missing) {
    return failure(state, RESEARCH_RESULTS.PREREQUISITE_MISSING, `Missing prerequisite: ${missing}.`, { prerequisiteId: missing });
  }
  const faction = context.faction == null ? null : String(context.faction);
  if (profile.factions.length && (!faction || !profile.factions.includes(faction))) {
    return failure(state, RESEARCH_RESULTS.FACTION_LOCKED, 'Technology is unavailable to this faction.', { faction });
  }
  const missionReason = techAvailability(profile, context);
  if (missionReason) {
    return failure(state, RESEARCH_RESULTS.MISSION_LOCKED, 'Technology is unavailable in this mission.', { missionReason });
  }
  const conflict = exclusiveConflict(state, profile);
  if (conflict) {
    return failure(state, RESEARCH_RESULTS.EXCLUSIVE_CONFLICT, `Mutually exclusive technology already chosen or queued: ${conflict}.`, { conflictTechId: conflict });
  }
  if (!canAfford(context.availableResources, profile.cost)) {
    return failure(state, RESEARCH_RESULTS.INSUFFICIENT_RESOURCES, 'Insufficient resources for research.', { cost: profile.cost });
  }

  const item = itemFrom(profile, facilityId, state.nextItemId);
  const queues = { ...state.queues, [facilityId]: [...queue, item] };
  const nextState = immutableState(state, { queues, nextItemId: state.nextItemId + 1 });
  return success(nextState, RESEARCH_RESULTS.QUEUED, {
    facilityId,
    item,
    payment: profile.cost,
  });
}

function refundFor(item) {
  const fraction = item.started
    ? Math.max(0, Math.min(1, item.remaining / item.duration))
    : 1;
  const refund = {};
  for (const [kind, amount] of Object.entries(item.cost)) {
    const value = Math.max(0, Math.floor(amount * fraction + EPSILON));
    if (value > 0) refund[kind] = value;
  }
  return freeze({ fraction, resources: freeze(refund) });
}

export function cancelResearch(state, facilityIdInput, itemRef = 0) {
  assertState(state);
  const facilityId = stableId(facilityIdInput, 'Research facility ID');
  const queue = state.queues[facilityId] ?? [];
  const index = typeof itemRef === 'number'
    ? itemRef
    : queue.findIndex((item) => item.id === String(itemRef));
  if (!Number.isInteger(index) || index < 0 || index >= queue.length) {
    return failure(state, RESEARCH_RESULTS.ITEM_NOT_FOUND, 'Research queue item was not found.', { facilityId });
  }
  const item = queue[index];
  const nextQueue = queue.filter((_, queueIndex) => queueIndex !== index);
  const queues = { ...state.queues };
  if (nextQueue.length) queues[facilityId] = nextQueue;
  else delete queues[facilityId];
  const nextState = immutableState(state, { queues });
  return success(nextState, RESEARCH_RESULTS.CANCELLED, {
    facilityId,
    item,
    refund: refundFor(item),
  });
}

export function setResearchPaused(state, facilityIdInput, paused) {
  assertState(state);
  const facilityId = stableId(facilityIdInput, 'Research facility ID');
  const current = new Set(state.pausedFacilityIds);
  if (paused) current.add(facilityId);
  else current.delete(facilityId);
  const nextState = immutableState(state, { pausedFacilityIds: [...current] });
  return success(nextState, paused ? RESEARCH_RESULTS.PAUSED : RESEARCH_RESULTS.RESUMED, {
    facilityId,
    paused: Boolean(paused),
  });
}

function productionActive(context, facilityId) {
  const source = context.productionActiveByFacility ?? {};
  if (source instanceof Map) return Boolean(source.get(facilityId));
  return Boolean(source[facilityId]);
}

function researchEvent(item, tick) {
  if (!Number.isInteger(tick) || tick < 0) throw new TypeError('Research event tick must be a non-negative integer.');
  return freeze({
    type: DOMAIN_EVENT_TYPES.RESEARCH,
    tick,
    source: item.facilityId,
    payload: freeze({
      status: RESEARCH_RESULTS.COMPLETED,
      itemId: item.id,
      techId: item.techId,
      label: item.label,
      facilityId: item.facilityId,
    }),
  });
}

function advanceQueue(queue, seconds, tick, events, completed, chosenExclusiveGroups) {
  let remainingSeconds = seconds;
  const working = [...queue];
  let safety = working.length + 1;
  while (remainingSeconds > EPSILON && working.length && safety-- > 0) {
    const current = working[0];
    const consumed = Math.min(remainingSeconds, current.remaining);
    const nextRemaining = Math.max(0, current.remaining - consumed);
    remainingSeconds -= consumed;
    const advanced = immutableItem({ ...current, remaining: nextRemaining, started: true });
    if (nextRemaining > EPSILON) {
      working[0] = advanced;
      break;
    }
    working.shift();
    completed.add(current.techId);
    if (current.exclusiveGroup) chosenExclusiveGroups[current.exclusiveGroup] = current.techId;
    events.push(researchEvent(current, tick));
  }
  return working;
}

export function tickResearch(state, stepSeconds, context = {}) {
  assertState(state);
  const dt = positive(stepSeconds, 'Research step duration');
  const tick = context.tick ?? 0;
  const completed = new Set(state.completedTechIds);
  const chosenExclusiveGroups = { ...state.chosenExclusiveGroups };
  const events = [];
  const queues = {};
  const pausedResearchFacilityIds = [];
  const blockedProductionFacilityIds = [];
  const pausedFacilities = new Set(state.pausedFacilityIds);

  for (const facilityId of Object.keys(state.queues).sort()) {
    const queue = state.queues[facilityId];
    if (!queue.length) continue;
    const hasProduction = productionActive(context, facilityId);
    const manuallyPaused = pausedFacilities.has(facilityId);
    const contentionPaused = state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.PRODUCTION_PRIORITY && hasProduction;
    if (manuallyPaused || contentionPaused) {
      queues[facilityId] = queue;
      pausedResearchFacilityIds.push(facilityId);
      continue;
    }
    if (state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.RESEARCH_PRIORITY) {
      blockedProductionFacilityIds.push(facilityId);
    }
    const advanced = advanceQueue(queue, dt, tick, events, completed, chosenExclusiveGroups);
    if (advanced.length) queues[facilityId] = advanced;
  }

  const nextState = immutableState(state, {
    queues,
    completedTechIds: [...completed],
    chosenExclusiveGroups,
  });
  return freeze({
    state: nextState,
    events: freeze(events),
    contention: freeze({
      pausedResearchFacilityIds: freeze(pausedResearchFacilityIds.sort()),
      blockedProductionFacilityIds: freeze(blockedProductionFacilityIds.sort()),
    }),
  });
}

function itemProgress(item) {
  const elapsed = Math.max(0, item.duration - item.remaining);
  return freeze({
    id: item.id,
    techId: item.techId,
    label: item.label,
    duration: item.duration,
    remaining: item.remaining,
    elapsed,
    progress: Math.max(0, Math.min(1, elapsed / item.duration)),
    started: item.started,
    cost: item.cost,
  });
}

export function researchProgressSnapshot(state, context = {}) {
  assertState(state);
  const pausedFacilities = new Set(state.pausedFacilityIds);
  const facilities = [];
  for (const facilityId of Object.keys(state.queues).sort()) {
    const queue = state.queues[facilityId];
    if (!queue.length) continue;
    const hasProduction = productionActive(context, facilityId);
    const manualPause = pausedFacilities.has(facilityId);
    const productionPause = state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.PRODUCTION_PRIORITY && hasProduction;
    const blocksProduction = state.contentionPolicy === RESEARCH_CONTENTION_POLICIES.RESEARCH_PRIORITY;
    facilities.push(freeze({
      facilityId,
      paused: manualPause || productionPause,
      pauseReason: manualPause ? 'manual' : productionPause ? 'production-active' : null,
      blocksProduction,
      current: itemProgress(queue[0]),
      queued: freeze(queue.slice(1).map(itemProgress)),
      queueLength: queue.length,
    }));
  }
  return freeze({
    schemaVersion: RESEARCH_SYSTEM_VERSION,
    contentionPolicy: state.contentionPolicy,
    completedTechIds: state.completedTechIds,
    facilities: freeze(facilities),
  });
}
