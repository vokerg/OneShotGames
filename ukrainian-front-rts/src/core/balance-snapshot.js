import { deriveSimulationSeed } from './random.js';

export const BALANCE_SNAPSHOT_VERSION = 1;
export const BALANCE_BATCH_KINDS = Object.freeze(['combat', 'economy', 'mission']);
export const BALANCE_OUTCOMES = Object.freeze(['win', 'loss', 'draw', 'timeout', 'complete', 'failed']);

const BATCH_KINDS = new Set(BALANCE_BATCH_KINDS);
const OUTCOMES = new Set(BALANCE_OUTCOMES);
const PRIVATE_KEY_TOKENS = new Set([
  'account',
  'address',
  'auth',
  'authorization',
  'cookie',
  'credential',
  'device',
  'email',
  'ip',
  'location',
  'name',
  'password',
  'phone',
  'profile',
  'secret',
  'session',
  'telephone',
  'token',
  'username',
]);
const PRIVATE_COMPACT_KEYS = new Set([
  'accountid',
  'auth token',
  'clientid',
  'deviceid',
  'displayname',
  'emailaddress',
  'ipaddress',
  'networkaddress',
  'playerid',
  'playername',
  'profileid',
  'refreshtoken',
  'sessionid',
  'sessiontoken',
  'userid',
  'useragent',
  'useremail',
  'username',
].map((key) => key.replaceAll(' ', '')));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number.`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function privacyKeyParts(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isPrivateBalanceKey(key) {
  const parts = privacyKeyParts(key);
  if (parts.some((part) => PRIVATE_KEY_TOKENS.has(part))) return true;
  return PRIVATE_COMPACT_KEYS.has(parts.join(''));
}

export function assertPrivacySafeBalanceData(value, path = 'balance data') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPrivacySafeBalanceData(child, `${path}[${index}]`));
    return true;
  }
  if (!value || typeof value !== 'object') return true;
  for (const [key, child] of Object.entries(value)) {
    if (isPrivateBalanceKey(key)) throw new Error(`${path}.${key} is not allowed in privacy-safe balance output.`);
    assertPrivacySafeBalanceData(child, `${path}.${key}`);
  }
  return true;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)];
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return deepFreeze({ count: 0, min: null, max: null, mean: null, p50: null, p95: null });
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return deepFreeze({
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    mean: total / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  });
}

function normalizeMetrics(metrics, label) {
  const record = requireRecord(metrics ?? {}, label);
  const normalized = {};
  for (const [key, value] of Object.entries(record).sort(([left], [right]) => left.localeCompare(right))) {
    requireString(key, `${label} key`);
    if (!Number.isFinite(value)) throw new TypeError(`${label}.${key} must be a finite number.`);
    normalized[key] = value;
  }
  return normalized;
}

function normalizeTrial(result, index, seed) {
  const trial = requireRecord(result, `Trial ${index} result`);
  const outcome = requireString(trial.outcome, `Trial ${index} outcome`);
  if (!OUTCOMES.has(outcome)) throw new RangeError(`Trial ${index} has unknown outcome: ${outcome}`);
  const normalized = canonicalize({
    index,
    seed,
    outcome,
    durationSeconds: finiteNonNegative(trial.durationSeconds ?? 0, `Trial ${index} durationSeconds`),
    metrics: normalizeMetrics(trial.metrics, `Trial ${index} metrics`),
  });
  assertPrivacySafeBalanceData(normalized, `trial ${index}`);
  return deepFreeze(normalized);
}

export function runBalanceBatch({
  id,
  kind,
  iterations = 10,
  baseSeed = 'balance-batch-v1',
  context = {},
  runTrial,
} = {}) {
  const batchId = requireString(id, 'Balance batch id');
  const batchKind = requireString(kind, 'Balance batch kind');
  if (!BATCH_KINDS.has(batchKind)) throw new RangeError(`Unknown balance batch kind: ${batchKind}`);
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > 10_000) {
    throw new RangeError('Balance batch iterations must be an integer from 1 through 10000.');
  }
  if (typeof runTrial !== 'function') throw new TypeError('Balance batch runTrial must be a function.');
  const safeContext = canonicalize(requireRecord(context, 'Balance batch context'));
  assertPrivacySafeBalanceData(safeContext, 'balance batch context');

  const trials = [];
  for (let index = 0; index < iterations; index += 1) {
    const seed = deriveSimulationSeed(baseSeed, `${batchId}:${index}`);
    const result = runTrial(Object.freeze({ index, seed, kind: batchKind, context: safeContext }));
    if (result && typeof result.then === 'function') {
      throw new TypeError('Balance batch runTrial must be synchronous.');
    }
    trials.push(normalizeTrial(result, index, seed));
  }

  const outcomeCounts = Object.fromEntries(BALANCE_OUTCOMES.map((outcome) => [outcome, 0]));
  const metricValues = new Map();
  for (const trial of trials) {
    outcomeCounts[trial.outcome] += 1;
    for (const [key, value] of Object.entries(trial.metrics)) {
      if (!metricValues.has(key)) metricValues.set(key, []);
      metricValues.get(key).push(value);
    }
  }
  const rates = Object.fromEntries(
    BALANCE_OUTCOMES.map((outcome) => [outcome, outcomeCounts[outcome] / iterations]),
  );
  const metrics = Object.fromEntries(
    [...metricValues.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, summarize(values)]),
  );

  return deepFreeze(canonicalize({
    schema: 'fields-of-resolve.balance-batch',
    version: BALANCE_SNAPSHOT_VERSION,
    id: batchId,
    kind: batchKind,
    baseSeed: String(baseSeed),
    iterations,
    context: safeContext,
    outcomes: outcomeCounts,
    rates,
    durationSeconds: summarize(trials.map((trial) => trial.durationSeconds)),
    metrics,
    trials,
  }));
}

export function createBalanceSnapshot({ sourceRevision = 'unknown', batches = [], notes = [] } = {}) {
  if (!Array.isArray(batches) || !batches.length) throw new TypeError('Balance snapshot requires at least one batch.');
  if (!Array.isArray(notes)) throw new TypeError('Balance snapshot notes must be an array.');
  const normalized = canonicalize({
    schema: 'fields-of-resolve.balance-snapshot',
    version: BALANCE_SNAPSHOT_VERSION,
    sourceRevision: requireString(String(sourceRevision), 'Balance snapshot sourceRevision'),
    notes: notes.map((note, index) => requireString(note, `Balance snapshot note ${index}`)),
    batches: [...batches].sort((left, right) => String(left?.id).localeCompare(String(right?.id))),
  });
  assertPrivacySafeBalanceData(normalized, 'balance snapshot');
  return deepFreeze(normalized);
}

export function serializeBalanceSnapshot(snapshot, { space = 2 } = {}) {
  requireRecord(snapshot, 'Balance snapshot');
  if (!Number.isInteger(space) || space < 0 || space > 8) throw new RangeError('Balance snapshot indentation must be 0 through 8.');
  assertPrivacySafeBalanceData(snapshot, 'balance snapshot');
  return `${JSON.stringify(canonicalize(snapshot), null, space)}\n`;
}
