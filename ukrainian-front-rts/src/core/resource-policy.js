export const RESOURCE_POLICY_VERSION = 1;
export const RESOURCE_KINDS = Object.freeze(['metal', 'fuel', 'intel']);

export const DEFAULT_RESOURCE_RULES = Object.freeze({
  metal: Object.freeze({ extractionRate: 18, carryCapacity: 40, regenerationRate: 0, salvageBurst: 55 }),
  fuel: Object.freeze({ extractionRate: 15, carryCapacity: 36, regenerationRate: 0, salvageBurst: 45 }),
  intel: Object.freeze({ extractionRate: 10, carryCapacity: 24, regenerationRate: 0, salvageBurst: 30 }),
});

const RESOURCE_KIND_SET = new Set(RESOURCE_KINDS);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function nonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a non-negative finite number.`);
  return value;
}

function positiveFinite(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label} must be a positive finite number.`);
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)) {
    throw new TypeError(`${label} must be a stable identifier.`);
  }
  return value;
}

function normalizeRule(candidate, fallback, label) {
  assertPlainObject(candidate, label);
  return Object.freeze({
    extractionRate: positiveFinite(candidate.extractionRate ?? fallback.extractionRate, `${label} extractionRate`),
    carryCapacity: positiveFinite(candidate.carryCapacity ?? fallback.carryCapacity, `${label} carryCapacity`),
    regenerationRate: nonNegativeFinite(candidate.regenerationRate ?? fallback.regenerationRate, `${label} regenerationRate`),
    salvageBurst: positiveFinite(candidate.salvageBurst ?? fallback.salvageBurst, `${label} salvageBurst`),
  });
}

function normalizeRuleRecord(candidate, fallback, label) {
  assertPlainObject(candidate, label);
  const normalized = {};
  for (const kind of RESOURCE_KINDS) {
    normalized[kind] = normalizeRule(candidate[kind] ?? {}, fallback[kind], `${label}.${kind}`);
  }
  for (const kind of Object.keys(candidate)) {
    if (!RESOURCE_KIND_SET.has(kind)) throw new RangeError(`Unknown resource kind in ${label}: ${kind}`);
  }
  return Object.freeze(normalized);
}

export function createResourcePolicy({
  resources = DEFAULT_RESOURCE_RULES,
  missionOverrides = {},
} = {}) {
  const normalizedResources = normalizeRuleRecord(resources, DEFAULT_RESOURCE_RULES, 'Resource rules');
  assertPlainObject(missionOverrides, 'Resource mission overrides');
  const normalizedOverrides = {};
  for (const missionId of Object.keys(missionOverrides).sort()) {
    identifier(missionId, 'Resource mission override ID');
    normalizedOverrides[missionId] = normalizeRuleRecord(
      missionOverrides[missionId],
      normalizedResources,
      `Resource mission override ${missionId}`,
    );
  }
  return Object.freeze({
    version: RESOURCE_POLICY_VERSION,
    resources: normalizedResources,
    missionOverrides: Object.freeze(normalizedOverrides),
  });
}

export function resolveResourceRule(policy, resourceKind, missionId = null) {
  if (!policy || policy.version !== RESOURCE_POLICY_VERSION) throw new TypeError('A versioned resource policy is required.');
  if (!RESOURCE_KIND_SET.has(resourceKind)) throw new RangeError(`Unknown resource kind: ${resourceKind}`);
  if (missionId !== null) identifier(missionId, 'Mission ID');
  return policy.missionOverrides[missionId]?.[resourceKind] ?? policy.resources[resourceKind];
}

export function extractResource({
  sourceAmount,
  carriedAmount,
  elapsedSeconds,
  rule,
}) {
  const available = nonNegativeFinite(sourceAmount, 'Resource source amount');
  const carried = nonNegativeFinite(carriedAmount, 'Worker carried amount');
  const elapsed = nonNegativeFinite(elapsedSeconds, 'Resource extraction elapsedSeconds');
  const normalizedRule = normalizeRule(rule, rule, 'Resolved resource rule');
  if (carried > normalizedRule.carryCapacity) {
    throw new RangeError('Worker carried amount exceeds the resolved carry capacity.');
  }
  const remainingCapacity = normalizedRule.carryCapacity - carried;
  const extracted = Math.min(available, remainingCapacity, normalizedRule.extractionRate * elapsed);
  const nextSourceAmount = Math.max(0, available - extracted);
  const nextCarriedAmount = Math.min(normalizedRule.carryCapacity, carried + extracted);
  return Object.freeze({
    extracted,
    sourceAmount: nextSourceAmount,
    carriedAmount: nextCarriedAmount,
    depleted: nextSourceAmount === 0,
    full: nextCarriedAmount === normalizedRule.carryCapacity,
  });
}

export function regenerateResource({ amount, maxAmount, elapsedSeconds, rule }) {
  const current = nonNegativeFinite(amount, 'Resource amount');
  const maximum = nonNegativeFinite(maxAmount, 'Resource maxAmount');
  const elapsed = nonNegativeFinite(elapsedSeconds, 'Resource regeneration elapsedSeconds');
  if (current > maximum) throw new RangeError('Resource amount must not exceed maxAmount.');
  const normalizedRule = normalizeRule(rule, rule, 'Resolved resource rule');
  const regenerated = Math.min(maximum - current, normalizedRule.regenerationRate * elapsed);
  return Object.freeze({
    regenerated,
    amount: current + regenerated,
    full: current + regenerated === maximum,
  });
}

export function resolveSalvageBurst({ availableAmount, requestedAmount = Infinity, rule }) {
  const available = nonNegativeFinite(availableAmount, 'Salvage availableAmount');
  const requested = requestedAmount === Infinity
    ? Infinity
    : nonNegativeFinite(requestedAmount, 'Salvage requestedAmount');
  const normalizedRule = normalizeRule(rule, rule, 'Resolved resource rule');
  const granted = Math.min(available, requested, normalizedRule.salvageBurst);
  return Object.freeze({
    granted,
    remainingAmount: Math.max(0, available - granted),
    depleted: available - granted === 0,
  });
}
