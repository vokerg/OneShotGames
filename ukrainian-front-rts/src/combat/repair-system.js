import { TARGET_DOMAINS } from './combat-schema.js';

export const REPAIR_SYSTEM_VERSION = 1;

export const REPAIR_CONTEXTS = Object.freeze({
  FIELD: 'field',
  FACILITY: 'facility',
});

export const REPAIR_ORDER_STATES = Object.freeze({
  ACTIVE: 'active',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
});

const DOMAIN_VALUES = new Set(Object.values(TARGET_DOMAINS));
const CONTEXT_VALUES = new Set(Object.values(REPAIR_CONTEXTS));
const ORDER_STATE_VALUES = new Set(Object.values(REPAIR_ORDER_STATES));
const EPSILON = 1e-9;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1e9) / 1e9;
}

function compareIds(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function sortedUniqueIds(ids, label) {
  if (!Array.isArray(ids)) throw new TypeError(`${label} must be an array`);
  const normalized = ids.map((id) => assertId(id, `${label} entry`)).sort(compareIds);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) {
      throw new TypeError(`${label} contains duplicate id: ${normalized[index]}`);
    }
  }
  return normalized;
}

function validateFinite(value, label, { minimum = -Infinity, maximum = Infinity, integer = false } = {}) {
  if (!Number.isFinite(value)) return `${label} must be finite`;
  if (value < minimum || value > maximum) return `${label} must be between ${minimum} and ${maximum}`;
  if (integer && !Number.isInteger(value)) return `${label} must be an integer`;
  return null;
}

function normalizeResourceCost(resourcePerHp) {
  if (!resourcePerHp || typeof resourcePerHp !== 'object' || Array.isArray(resourcePerHp)) {
    throw new TypeError('resourcePerHp must be an object');
  }
  const normalized = {};
  for (const key of Object.keys(resourcePerHp).sort()) {
    assertId(key, 'resource key');
    const value = Number(resourcePerHp[key]);
    const error = validateFinite(value, `resourcePerHp.${key}`, { minimum: 0 });
    if (error) throw new TypeError(error);
    normalized[key] = value;
  }
  return normalized;
}

export function validateRepairPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['repair policy must be an object'];
  if (policy.schemaVersion !== REPAIR_SYSTEM_VERSION) errors.push(`schemaVersion must be ${REPAIR_SYSTEM_VERSION}`);
  if (!Array.isArray(policy.repairableDomains) || !policy.repairableDomains.length) {
    errors.push('repairableDomains must be a non-empty array');
  } else {
    const seen = new Set();
    for (const domain of policy.repairableDomains) {
      if (!DOMAIN_VALUES.has(domain)) errors.push(`unknown repairable domain: ${domain}`);
      if (seen.has(domain)) errors.push(`duplicate repairable domain: ${domain}`);
      seen.add(domain);
    }
  }
  for (const [field, constraints] of [
    ['baseHpPerSecond', { minimum: EPSILON }],
    ['cooperationEfficiency', { minimum: 0, maximum: 1 }],
    ['maxRepairers', { minimum: 1, integer: true }],
    ['fieldRepairMaxRatio', { minimum: 0, maximum: 1 }],
    ['facilityRepairMaxRatio', { minimum: 0, maximum: 1 }],
    ['facilityRateMultiplier', { minimum: 0 }],
    ['facilityCostMultiplier', { minimum: 0 }],
    ['aiDisabledBonus', { minimum: 0 }],
    ['aiStrategicWeight', { minimum: 0 }],
    ['aiDistancePenalty', { minimum: 0 }],
    ['aiThreatPenalty', { minimum: 0 }],
  ]) {
    const error = validateFinite(policy[field], field, constraints);
    if (error) errors.push(error);
  }
  if (Number.isFinite(policy.fieldRepairMaxRatio)
      && Number.isFinite(policy.facilityRepairMaxRatio)
      && policy.facilityRepairMaxRatio < policy.fieldRepairMaxRatio) {
    errors.push('facilityRepairMaxRatio must be at least fieldRepairMaxRatio');
  }
  if (!policy.resourcePerHp || typeof policy.resourcePerHp !== 'object' || Array.isArray(policy.resourcePerHp)) {
    errors.push('resourcePerHp must be an object');
  } else {
    for (const [key, value] of Object.entries(policy.resourcePerHp)) {
      if (typeof key !== 'string' || key.trim() === '') errors.push('resource keys must be non-empty strings');
      const error = validateFinite(value, `resourcePerHp.${key}`, { minimum: 0 });
      if (error) errors.push(error);
    }
  }
  return errors;
}

export function createRepairPolicy(overrides = {}) {
  const policy = {
    schemaVersion: REPAIR_SYSTEM_VERSION,
    repairableDomains: [...(overrides.repairableDomains ?? Object.values(TARGET_DOMAINS))].sort(compareIds),
    baseHpPerSecond: Number(overrides.baseHpPerSecond ?? 12),
    cooperationEfficiency: Number(overrides.cooperationEfficiency ?? 0.6),
    maxRepairers: Number(overrides.maxRepairers ?? 4),
    fieldRepairMaxRatio: Number(overrides.fieldRepairMaxRatio ?? 0.75),
    facilityRepairMaxRatio: Number(overrides.facilityRepairMaxRatio ?? 1),
    facilityRateMultiplier: Number(overrides.facilityRateMultiplier ?? 1.5),
    facilityCostMultiplier: Number(overrides.facilityCostMultiplier ?? 0.8),
    resourcePerHp: normalizeResourceCost(overrides.resourcePerHp ?? { metal: 0.5 }),
    aiDisabledBonus: Number(overrides.aiDisabledBonus ?? 1000),
    aiStrategicWeight: Number(overrides.aiStrategicWeight ?? 10),
    aiDistancePenalty: Number(overrides.aiDistancePenalty ?? 0.05),
    aiThreatPenalty: Number(overrides.aiThreatPenalty ?? 5),
  };
  const errors = validateRepairPolicy(policy);
  if (errors.length) throw new TypeError(errors.join('; '));
  return deepFreeze(policy);
}

export const DEFAULT_REPAIR_POLICY = createRepairPolicy();

export function createRepairOrder({
  id,
  team,
  targetId,
  context = REPAIR_CONTEXTS.FIELD,
  repairerIds = [],
  facilityId = null,
} = {}) {
  assertId(id, 'repair order id');
  assertId(targetId, 'targetId');
  if (!Number.isInteger(team) && typeof team !== 'string') throw new TypeError('team must be an integer or string');
  if (!CONTEXT_VALUES.has(context)) throw new TypeError(`unknown repair context: ${context}`);
  const normalizedRepairers = sortedUniqueIds(repairerIds, 'repairerIds');
  if (context === REPAIR_CONTEXTS.FIELD && normalizedRepairers.length === 0) {
    throw new TypeError('field repair orders require at least one repairer');
  }
  if (context === REPAIR_CONTEXTS.FACILITY) assertId(facilityId, 'facilityId');
  return deepFreeze({
    schemaVersion: REPAIR_SYSTEM_VERSION,
    id,
    team,
    targetId,
    context,
    repairerIds: normalizedRepairers,
    facilityId: context === REPAIR_CONTEXTS.FACILITY ? facilityId : null,
    state: REPAIR_ORDER_STATES.ACTIVE,
    completionReason: null,
    cancellationReason: null,
    cumulativeHp: 0,
    cumulativeCost: {},
  });
}

export function cancelRepairOrder(order, reason = 'cancelled') {
  validateRepairOrder(order);
  if (order.state !== REPAIR_ORDER_STATES.ACTIVE) return order;
  return deepFreeze({
    ...order,
    state: REPAIR_ORDER_STATES.CANCELLED,
    cancellationReason: String(reason),
  });
}

export function validateRepairOrder(order) {
  if (!order || typeof order !== 'object') throw new TypeError('repair order must be an object');
  if (order.schemaVersion !== REPAIR_SYSTEM_VERSION) throw new TypeError(`repair order schemaVersion must be ${REPAIR_SYSTEM_VERSION}`);
  assertId(order.id, 'repair order id');
  assertId(order.targetId, 'targetId');
  if (!CONTEXT_VALUES.has(order.context)) throw new TypeError(`unknown repair context: ${order.context}`);
  if (!ORDER_STATE_VALUES.has(order.state)) throw new TypeError(`unknown repair order state: ${order.state}`);
  sortedUniqueIds(order.repairerIds, 'repairerIds');
  if (order.context === REPAIR_CONTEXTS.FACILITY) assertId(order.facilityId, 'facilityId');
  return true;
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object') throw new TypeError('target must be an object');
  const id = assertId(target.id, 'target id');
  const hp = Number(target.hp);
  const maxHp = Number(target.maxHp);
  if (validateFinite(hp, 'target.hp', { minimum: 0 })) throw new TypeError('target.hp must be a non-negative finite number');
  if (validateFinite(maxHp, 'target.maxHp', { minimum: EPSILON })) throw new TypeError('target.maxHp must be a positive finite number');
  if (hp > maxHp + EPSILON) throw new TypeError('target.hp cannot exceed target.maxHp');
  if (!DOMAIN_VALUES.has(target.domain)) throw new TypeError(`unknown target domain: ${target.domain}`);
  return {
    id,
    team: target.team,
    domain: target.domain,
    hp: round(hp),
    maxHp: round(maxHp),
    destroyed: Boolean(target.destroyed),
    repairable: target.repairable !== false,
    disabled: Boolean(target.disabled),
    strategicValue: Number.isFinite(target.strategicValue) ? Number(target.strategicValue) : 0,
    distance: Number.isFinite(target.distance) ? Math.max(0, Number(target.distance)) : 0,
    incomingDamageRate: Number.isFinite(target.incomingDamageRate) ? Math.max(0, Number(target.incomingDamageRate)) : 0,
  };
}

function repairCap(target, context, policy) {
  const ratio = context === REPAIR_CONTEXTS.FACILITY
    ? policy.facilityRepairMaxRatio
    : policy.fieldRepairMaxRatio;
  return round(target.maxHp * ratio);
}

export function evaluateRepairTarget({ target, team, context = REPAIR_CONTEXTS.FIELD, policy = DEFAULT_REPAIR_POLICY } = {}) {
  const normalized = normalizeTarget(target);
  const errors = validateRepairPolicy(policy);
  if (errors.length) throw new TypeError(errors.join('; '));
  if (!CONTEXT_VALUES.has(context)) throw new TypeError(`unknown repair context: ${context}`);
  let reason = null;
  if (normalized.team !== team) reason = 'enemy-target';
  else if (normalized.destroyed) reason = 'target-destroyed';
  else if (!normalized.repairable) reason = 'target-not-repairable';
  else if (!policy.repairableDomains.includes(normalized.domain)) reason = 'unsupported-domain';
  const capHp = repairCap(normalized, context, policy);
  if (!reason && normalized.hp >= capHp - EPSILON) {
    reason = normalized.hp >= normalized.maxHp - EPSILON ? 'target-full-health' : 'repair-cap-reached';
  }
  return deepFreeze({
    ok: reason == null,
    reason,
    target: normalized,
    capHp,
    missingHp: round(Math.max(0, capHp - normalized.hp)),
  });
}

function indexById(items, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`);
  const result = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new TypeError(`${label} entries must be objects`);
    const id = assertId(item.id, `${label} id`);
    if (result.has(id)) throw new TypeError(`${label} contains duplicate id: ${id}`);
    result.set(id, item);
  }
  return result;
}

function fieldSource(order, target, repairers, policy) {
  const byId = indexById(repairers, 'repairers');
  const selected = [];
  for (const id of order.repairerIds) {
    const repairer = byId.get(id);
    if (!repairer) continue;
    if (repairer.team !== order.team) continue;
    if (repairer.active === false || repairer.canRepair === false || repairer.inRange === false) continue;
    const rateMultiplier = Number(repairer.rateMultiplier ?? 1);
    if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) continue;
    selected.push({ id, rateMultiplier });
  }
  selected.sort((left, right) => compareIds(left.id, right.id));
  const bounded = selected.slice(0, policy.maxRepairers);
  let factor = 0;
  const contributors = bounded.map((repairer, index) => {
    const efficiency = policy.cooperationEfficiency ** index;
    const effectiveRate = round(policy.baseHpPerSecond * repairer.rateMultiplier * efficiency);
    factor += repairer.rateMultiplier * efficiency;
    return deepFreeze({ id: repairer.id, efficiency: round(efficiency), effectiveRate });
  });
  return {
    ok: contributors.length > 0,
    reason: contributors.length ? null : 'no-eligible-repairers',
    rate: round(policy.baseHpPerSecond * factor),
    contributors,
    costMultiplier: 1,
    sourceId: null,
    target,
  };
}

function facilitySource(order, target, facility, policy) {
  if (!facility || typeof facility !== 'object') return { ok: false, reason: 'facility-missing' };
  if (facility.id !== order.facilityId) return { ok: false, reason: 'facility-mismatch' };
  if (facility.team !== order.team) return { ok: false, reason: 'facility-enemy' };
  if (facility.online === false || facility.canRepair === false) return { ok: false, reason: 'facility-offline' };
  if (Array.isArray(facility.acceptsDomains) && !facility.acceptsDomains.includes(target.domain)) {
    return { ok: false, reason: 'facility-domain-rejected' };
  }
  const rateMultiplier = Number(facility.rateMultiplier ?? 1);
  if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) return { ok: false, reason: 'facility-no-rate' };
  return {
    ok: true,
    reason: null,
    rate: round(policy.baseHpPerSecond * policy.facilityRateMultiplier * rateMultiplier),
    contributors: [],
    costMultiplier: policy.facilityCostMultiplier,
    sourceId: facility.id,
    target,
  };
}

function normalizeResources(resources) {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    throw new TypeError('resources must be an object');
  }
  const normalized = {};
  for (const key of Object.keys(resources).sort()) {
    const amount = Number(resources[key]);
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError(`resources.${key} must be non-negative and finite`);
    normalized[key] = round(amount);
  }
  return normalized;
}

function addCosts(left, right) {
  const result = {};
  for (const key of [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].sort()) {
    result[key] = round(Number(left?.[key] ?? 0) + Number(right?.[key] ?? 0));
  }
  return result;
}

export function resolveRepairTick({
  order,
  target,
  repairers = [],
  facility = null,
  resources = {},
  dt,
  policy = DEFAULT_REPAIR_POLICY,
} = {}) {
  validateRepairOrder(order);
  const elapsed = Number(dt);
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new TypeError('dt must be a non-negative finite number');
  const available = normalizeResources(resources);
  const targetVerdict = evaluateRepairTarget({ target, team: order.team, context: order.context, policy });
  if (order.targetId !== targetVerdict.target.id) throw new TypeError('repair order targetId does not match target.id');

  const blocked = (reason) => deepFreeze({
    order,
    target: targetVerdict.target,
    resources: available,
    repairedHp: 0,
    cost: {},
    rate: 0,
    contributors: [],
    blockedReason: reason,
    event: null,
  });

  if (order.state !== REPAIR_ORDER_STATES.ACTIVE) return blocked(`order-${order.state}`);
  if (!targetVerdict.ok) return blocked(targetVerdict.reason);
  if (elapsed === 0) return blocked('zero-dt');

  const source = order.context === REPAIR_CONTEXTS.FIELD
    ? fieldSource(order, targetVerdict.target, repairers, policy)
    : facilitySource(order, targetVerdict.target, facility, policy);
  if (!source.ok) return blocked(source.reason);

  let resourceCapacity = Infinity;
  for (const [resource, perHp] of Object.entries(policy.resourcePerHp)) {
    const effectivePerHp = perHp * source.costMultiplier;
    if (effectivePerHp <= 0) continue;
    resourceCapacity = Math.min(resourceCapacity, Number(available[resource] ?? 0) / effectivePerHp);
  }
  const rateCapacity = source.rate * elapsed;
  const repairedHp = round(Math.min(targetVerdict.missingHp, rateCapacity, resourceCapacity));
  if (repairedHp <= EPSILON) return blocked('insufficient-resources');

  const cost = {};
  const remaining = { ...available };
  for (const [resource, perHp] of Object.entries(policy.resourcePerHp)) {
    const spent = round(repairedHp * perHp * source.costMultiplier);
    if (spent > 0) cost[resource] = spent;
    remaining[resource] = round(Number(remaining[resource] ?? 0) - spent);
  }
  const nextHp = round(Math.min(targetVerdict.capHp, targetVerdict.target.hp + repairedHp));
  const complete = nextHp >= targetVerdict.capHp - EPSILON;
  const completionReason = complete
    ? order.context === REPAIR_CONTEXTS.FIELD && targetVerdict.capHp < targetVerdict.target.maxHp - EPSILON
      ? 'field-limit'
      : 'fully-repaired'
    : null;
  const nextOrder = deepFreeze({
    ...order,
    state: complete ? REPAIR_ORDER_STATES.COMPLETE : REPAIR_ORDER_STATES.ACTIVE,
    completionReason,
    cumulativeHp: round(order.cumulativeHp + repairedHp),
    cumulativeCost: addCosts(order.cumulativeCost, cost),
  });
  const nextTarget = deepFreeze({ ...targetVerdict.target, hp: nextHp });
  const event = deepFreeze({
    type: 'repair-applied',
    orderId: order.id,
    targetId: nextTarget.id,
    context: order.context,
    facilityId: source.sourceId,
    repairerIds: source.contributors.map((entry) => entry.id),
    repairedHp,
    hpAfter: nextHp,
    cost: { ...cost },
  });
  return deepFreeze({
    order: nextOrder,
    target: nextTarget,
    resources: remaining,
    repairedHp,
    cost,
    rate: source.rate,
    contributors: source.contributors,
    blockedReason: null,
    event,
  });
}

export function rankRepairTargets({
  team,
  candidates = [],
  context = REPAIR_CONTEXTS.FIELD,
  policy = DEFAULT_REPAIR_POLICY,
} = {}) {
  const byId = indexById(candidates, 'candidates');
  const ranked = [];
  for (const candidate of byId.values()) {
    const verdict = evaluateRepairTarget({ target: candidate, team, context, policy });
    if (!verdict.ok) continue;
    const deficitRatio = verdict.missingHp / verdict.target.maxHp;
    const score = round(
      (verdict.target.disabled ? policy.aiDisabledBonus : 0)
      + deficitRatio * 100
      + verdict.target.strategicValue * policy.aiStrategicWeight
      - verdict.target.distance * policy.aiDistancePenalty
      - verdict.target.incomingDamageRate * policy.aiThreatPenalty,
    );
    ranked.push(deepFreeze({
      targetId: verdict.target.id,
      score,
      deficitRatio: round(deficitRatio),
      capHp: verdict.capHp,
      disabled: verdict.target.disabled,
    }));
  }
  ranked.sort((left, right) => right.score - left.score || compareIds(left.targetId, right.targetId));
  return deepFreeze(ranked);
}

export function chooseRepairTarget(options = {}) {
  return rankRepairTargets(options)[0] ?? null;
}
