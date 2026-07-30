export const AI_ARCHITECTURE_SCHEMA_VERSION = 1;

export const AI_GOAL_KINDS = Object.freeze([
  'economy',
  'construction',
  'production',
  'research',
  'scouting',
  'defense',
  'attack',
  'recovery',
]);

export const AI_BUDGET_CATEGORIES = Object.freeze([
  'economy',
  'construction',
  'production',
  'research',
  'repair',
  'reserves',
  'operations',
]);

const DEFAULT_BUDGET_WEIGHTS = Object.freeze({
  economy: 0.2,
  construction: 0.15,
  production: 0.25,
  research: 0.1,
  repair: 0.1,
  reserves: 0.1,
  operations: 0.1,
});

const DEFAULT_GOAL_WEIGHTS = Object.freeze(Object.fromEntries(AI_GOAL_KINDS.map((kind) => [kind, 1])));
const PLAIN_OBJECT = Object.getPrototypeOf({});
const EPSILON = 1e-9;

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== PLAIN_OBJECT) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function assertInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return value;
}

function assertFinite(value, label, minimum = -Infinity, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be finite and between ${minimum} and ${maximum}`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function canonicalAiSnapshot(value, label = 'value', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must contain only JSON-compatible values`);
  if (seen.has(value)) throw new TypeError(`${label} contains a cycle`);
  seen.add(value);
  let output;
  if (Array.isArray(value)) {
    output = value.map((child, index) => canonicalAiSnapshot(child, `${label}[${index}]`, seen));
  } else {
    assertRecord(value, label);
    output = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) throw new TypeError(`${label}.${key} is undefined`);
      output[key] = canonicalAiSnapshot(child, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
  return deepFreeze(output);
}

function normalizedWeights(value, keys, defaults, label) {
  const input = value === undefined ? defaults : value;
  assertRecord(input, label);
  const unknown = Object.keys(input).filter((key) => !keys.includes(key));
  if (unknown.length) throw new RangeError(`${label} contains unknown keys: ${unknown.sort().join(', ')}`);
  const weights = {};
  let total = 0;
  for (const key of keys) {
    const amount = input[key] ?? 0;
    assertFinite(amount, `${label}.${key}`, 0);
    weights[key] = amount;
    total += amount;
  }
  if (total <= 0) throw new RangeError(`${label} must contain at least one positive weight`);
  for (const key of keys) weights[key] /= total;
  return deepFreeze(weights);
}

export function createAiDoctrineProfile({
  id,
  factionId,
  strategy,
  decisionIntervalTicks = 15,
  decisionOffsetTicks = 0,
  contactStaleAfterTicks = 150,
  contactForgetAfterTicks = 450,
  riskTolerance = 0.5,
  retreatThreshold = 0.35,
  informationPolicy = 'observed-only',
  budgetWeights,
  goalWeights,
} = {}) {
  const interval = assertInteger(decisionIntervalTicks, 'decisionIntervalTicks', 1);
  const offset = assertInteger(decisionOffsetTicks, 'decisionOffsetTicks', 0);
  if (offset >= interval) throw new RangeError('decisionOffsetTicks must be less than decisionIntervalTicks');
  const stale = assertInteger(contactStaleAfterTicks, 'contactStaleAfterTicks', 1);
  const forget = assertInteger(contactForgetAfterTicks, 'contactForgetAfterTicks', stale + 1);
  if (informationPolicy !== 'observed-only') throw new RangeError('informationPolicy must be observed-only');

  return deepFreeze({
    schemaVersion: AI_ARCHITECTURE_SCHEMA_VERSION,
    id: assertId(id, 'id'),
    factionId: assertId(factionId, 'factionId'),
    strategy: assertId(strategy, 'strategy'),
    decisionIntervalTicks: interval,
    decisionOffsetTicks: offset,
    contactStaleAfterTicks: stale,
    contactForgetAfterTicks: forget,
    riskTolerance: assertFinite(riskTolerance, 'riskTolerance', 0, 1),
    retreatThreshold: assertFinite(retreatThreshold, 'retreatThreshold', 0, 1),
    informationPolicy,
    budgetWeights: normalizedWeights(budgetWeights, AI_BUDGET_CATEGORIES, DEFAULT_BUDGET_WEIGHTS, 'budgetWeights'),
    goalWeights: normalizedWeights(goalWeights, AI_GOAL_KINDS, DEFAULT_GOAL_WEIGHTS, 'goalWeights'),
  });
}

export function createAiGoal({ id, kind, priority = 0, createdTick = 0, target = null, reason = '' } = {}) {
  if (!AI_GOAL_KINDS.includes(kind)) throw new RangeError(`kind must be one of: ${AI_GOAL_KINDS.join(', ')}`);
  return deepFreeze({
    schemaVersion: AI_ARCHITECTURE_SCHEMA_VERSION,
    id: assertId(id, 'goal id'),
    kind,
    priority: assertFinite(priority, 'priority'),
    createdTick: assertInteger(createdTick, 'createdTick', 0),
    target: canonicalAiSnapshot(target, 'target'),
    reason: typeof reason === 'string' ? reason : String(reason ?? ''),
  });
}

export function sortAiGoals(goals) {
  return Object.freeze([...goals].sort((left, right) =>
    right.priority - left.priority || left.createdTick - right.createdTick || left.id.localeCompare(right.id)));
}

export function createAiBudgetPlan({ tick = 0, resources = {}, allocations = {} } = {}) {
  assertRecord(resources, 'resources');
  assertRecord(allocations, 'allocations');
  const normalizedResources = {};
  for (const resourceId of Object.keys(resources).sort()) {
    normalizedResources[assertId(resourceId, 'resource id')] = assertFinite(resources[resourceId], `resources.${resourceId}`, 0);
  }

  const normalizedAllocations = {};
  const totals = Object.fromEntries(Object.keys(normalizedResources).map((resourceId) => [resourceId, 0]));
  for (const category of Object.keys(allocations).sort()) {
    if (!AI_BUDGET_CATEGORIES.includes(category)) throw new RangeError(`unknown budget category: ${category}`);
    assertRecord(allocations[category], `allocations.${category}`);
    const envelope = {};
    for (const resourceId of Object.keys(allocations[category]).sort()) {
      if (!(resourceId in normalizedResources)) throw new RangeError(`allocations.${category} references unknown resource ${resourceId}`);
      const amount = assertFinite(allocations[category][resourceId], `allocations.${category}.${resourceId}`, 0);
      envelope[resourceId] = amount;
      totals[resourceId] += amount;
    }
    normalizedAllocations[category] = envelope;
  }

  const unallocated = {};
  for (const resourceId of Object.keys(normalizedResources)) {
    if (totals[resourceId] > normalizedResources[resourceId] + EPSILON) {
      throw new RangeError(`allocations exceed available ${resourceId}`);
    }
    unallocated[resourceId] = Math.max(0, normalizedResources[resourceId] - totals[resourceId]);
  }

  return deepFreeze({
    schemaVersion: AI_ARCHITECTURE_SCHEMA_VERSION,
    tick: assertInteger(tick, 'tick', 0),
    resources: normalizedResources,
    allocations: normalizedAllocations,
    unallocated,
  });
}
