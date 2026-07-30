export const CONSTRUCTION_PROGRESS_VERSION = 1;

export const DEFAULT_CONSTRUCTION_POLICY = Object.freeze({
  additionalBuilderEfficiency: Object.freeze([1, 0.7, 0.5, 0.35]),
  overflowBuilderEfficiency: 0.2,
  cancellationRefundRate: 0.75,
});

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function stableId(value, label) {
  if ((typeof value !== 'string' && !Number.isInteger(value)) || !ID_PATTERN.test(String(value))) {
    throw new TypeError(`${label} must be a stable string or integer identifier.`);
  }
  return value;
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a positive finite number.`);
  return value;
}

function nonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative finite number.`);
  return value;
}

function unitFraction(value, label) {
  const normalized = nonNegativeFinite(value, label);
  if (normalized > 1) throw new RangeError(`${label} must not exceed 1.`);
  return normalized;
}

function compareIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function normalizeCost(cost = {}) {
  assertPlainObject(cost, 'Construction cost');
  const normalized = {};
  for (const resource of Object.keys(cost).sort()) {
    if (!ID_PATTERN.test(resource)) throw new TypeError(`Construction resource key must be stable: ${resource}`);
    normalized[resource] = nonNegativeFinite(cost[resource], `Construction cost ${resource}`);
  }
  return Object.freeze(normalized);
}

function normalizePolicy(policy = DEFAULT_CONSTRUCTION_POLICY) {
  assertPlainObject(policy, 'Construction policy');
  const efficiencies = policy.additionalBuilderEfficiency ?? DEFAULT_CONSTRUCTION_POLICY.additionalBuilderEfficiency;
  if (!Array.isArray(efficiencies) || efficiencies.length === 0) {
    throw new TypeError('Construction additionalBuilderEfficiency must be a non-empty array.');
  }
  return Object.freeze({
    additionalBuilderEfficiency: Object.freeze(
      efficiencies.map((value, index) => positiveFinite(value, `Builder efficiency ${index + 1}`)),
    ),
    overflowBuilderEfficiency: positiveFinite(
      policy.overflowBuilderEfficiency ?? DEFAULT_CONSTRUCTION_POLICY.overflowBuilderEfficiency,
      'Construction overflowBuilderEfficiency',
    ),
    cancellationRefundRate: unitFraction(
      policy.cancellationRefundRate ?? DEFAULT_CONSTRUCTION_POLICY.cancellationRefundRate,
      'Construction cancellationRefundRate',
    ),
  });
}

function normalizeBuilderIds(builderIds = []) {
  if (!Array.isArray(builderIds)) throw new TypeError('Construction builderIds must be an array.');
  return Object.freeze([...new Set(builderIds.map((id) => stableId(id, 'Construction builder ID')))].sort(compareIds));
}

function normalizeState(state) {
  assertPlainObject(state, 'Construction progress state');
  if (state.version !== CONSTRUCTION_PROGRESS_VERSION) {
    throw new RangeError(`Unsupported construction progress version: ${state.version}`);
  }
  const requiredWork = positiveFinite(state.requiredWork, 'Construction requiredWork');
  const completedWork = nonNegativeFinite(state.completedWork, 'Construction completedWork');
  if (completedWork > requiredWork) throw new RangeError('Construction completedWork must not exceed requiredWork.');
  const cancelled = Boolean(state.cancelled);
  const completed = completedWork === requiredWork;
  if (cancelled && completed) throw new Error('Completed construction cannot also be cancelled.');
  return Object.freeze({
    version: CONSTRUCTION_PROGRESS_VERSION,
    buildingId: stableId(state.buildingId, 'Construction building ID'),
    requiredWork,
    completedWork,
    paused: Boolean(state.paused),
    cancelled,
    completed,
    builderIds: normalizeBuilderIds(state.builderIds),
    cost: normalizeCost(state.cost),
  });
}

function replaceState(state, changes) {
  return normalizeState({ ...normalizeState(state), ...changes });
}

export function createConstructionProgress({ buildingId, buildTime, cost = {}, builderIds = [] }) {
  return normalizeState({
    version: CONSTRUCTION_PROGRESS_VERSION,
    buildingId,
    requiredWork: positiveFinite(buildTime, 'Construction buildTime'),
    completedWork: 0,
    paused: false,
    cancelled: false,
    builderIds,
    cost,
  });
}

export function effectiveConstructionBuilders(builderCount, policy = DEFAULT_CONSTRUCTION_POLICY) {
  if (!Number.isInteger(builderCount) || builderCount < 0) {
    throw new TypeError('Construction builderCount must be a non-negative integer.');
  }
  const normalizedPolicy = normalizePolicy(policy);
  let effectiveBuilders = 0;
  for (let index = 0; index < builderCount; index += 1) {
    effectiveBuilders += normalizedPolicy.additionalBuilderEfficiency[index]
      ?? normalizedPolicy.overflowBuilderEfficiency;
  }
  return effectiveBuilders;
}

export function assignConstructionBuilder(state, builderId) {
  const current = normalizeState(state);
  if (current.cancelled || current.completed) return current;
  const nextIds = normalizeBuilderIds([...current.builderIds, stableId(builderId, 'Construction builder ID')]);
  if (nextIds.length === current.builderIds.length) return current;
  return replaceState(current, { builderIds: nextIds });
}

export function removeConstructionBuilder(state, builderId) {
  const current = normalizeState(state);
  const id = stableId(builderId, 'Construction builder ID');
  const nextIds = current.builderIds.filter((candidate) => candidate !== id);
  if (nextIds.length === current.builderIds.length) return current;
  return replaceState(current, { builderIds: nextIds });
}

export function reconcileConstructionBuilders(state, builders) {
  const current = normalizeState(state);
  if (!Array.isArray(builders)) throw new TypeError('Construction builders must be an array.');
  const eligible = new Set(
    builders
      .filter((builder) => builder && builder.alive !== false && builder.worker === true && builder.available !== false)
      .map((builder) => stableId(builder.id, 'Construction builder ID')),
  );
  const nextIds = current.builderIds.filter((id) => eligible.has(id));
  if (nextIds.length === current.builderIds.length) return current;
  return replaceState(current, { builderIds: nextIds });
}

export function setConstructionPaused(state, paused) {
  const current = normalizeState(state);
  if (current.cancelled || current.completed || current.paused === Boolean(paused)) return current;
  return replaceState(current, { paused: Boolean(paused) });
}

export function advanceConstruction(state, elapsedSeconds, policy = DEFAULT_CONSTRUCTION_POLICY) {
  const current = normalizeState(state);
  const elapsed = nonNegativeFinite(elapsedSeconds, 'Construction elapsedSeconds');
  if (elapsed === 0 || current.paused || current.cancelled || current.completed || current.builderIds.length === 0) {
    return Object.freeze({ state: current, workApplied: 0, effectiveBuilders: 0, completedNow: false });
  }
  const effectiveBuilders = effectiveConstructionBuilders(current.builderIds.length, policy);
  const workApplied = Math.min(current.requiredWork - current.completedWork, elapsed * effectiveBuilders);
  const next = replaceState(current, { completedWork: current.completedWork + workApplied });
  return Object.freeze({
    state: next,
    workApplied,
    effectiveBuilders,
    completedNow: !current.completed && next.completed,
  });
}

export function cancelConstruction(state, policy = DEFAULT_CONSTRUCTION_POLICY) {
  const current = normalizeState(state);
  if (current.cancelled) {
    return Object.freeze({ state: current, refund: Object.freeze({}), progress: current.completedWork / current.requiredWork });
  }
  if (current.completed) throw new Error('Completed construction cannot be cancelled.');
  const normalizedPolicy = normalizePolicy(policy);
  const progress = current.completedWork / current.requiredWork;
  const refundableFraction = (1 - progress) * normalizedPolicy.cancellationRefundRate;
  const refund = {};
  for (const [resource, amount] of Object.entries(current.cost)) {
    refund[resource] = Math.floor(amount * refundableFraction + 1e-9);
  }
  return Object.freeze({
    state: replaceState(current, { cancelled: true, paused: false, builderIds: [] }),
    refund: Object.freeze(refund),
    progress,
  });
}

export function constructionProgressFraction(state) {
  const current = normalizeState(state);
  return current.completedWork / current.requiredWork;
}
