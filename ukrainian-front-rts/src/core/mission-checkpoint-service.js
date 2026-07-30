export const MISSION_CHECKPOINT_VERSION = 1;
export const MISSION_CHECKPOINT_POLICIES = Object.freeze({ ENABLED: 'enabled', DISABLED: 'disabled' });
export const MISSION_CHECKPOINT_STATUSES = Object.freeze({
  OK: 'ok', MISSING: 'missing', DISABLED: 'disabled', INCOMPATIBLE: 'incompatible',
});

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const POLICIES = new Set(Object.values(MISSION_CHECKPOINT_POLICIES));

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || value.length > 128) throw new TypeError(`${label} must be a string of at most 128 characters.`);
  return value;
}

function json(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain finite numbers.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw new TypeError(`${label} must not be circular.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((entry, index) => json(entry, `${label}[${index}]`, seen));
  else {
    object(value, label); result = {};
    for (const key of Object.keys(value).sort()) result[key] = json(value[key], `${label}.${key}`, seen);
  }
  seen.delete(value); return result;
}

function normalize(candidate) {
  object(candidate, 'Mission checkpoint');
  if (candidate.version !== MISSION_CHECKPOINT_VERSION) throw new RangeError(`Unsupported mission checkpoint version: ${candidate.version}`);
  return freeze({
    version: MISSION_CHECKPOINT_VERSION,
    checkpointId: id(candidate.checkpointId, 'Checkpoint ID'),
    operationId: id(candidate.operationId, 'Checkpoint operation ID'),
    label: text(candidate.label ?? '', 'Checkpoint label'),
    createdAt: integer(candidate.createdAt, 'Checkpoint createdAt'),
    tick: integer(candidate.tick, 'Checkpoint tick'),
    simulationSeed: json(candidate.simulationSeed, 'Checkpoint simulation seed'),
    profileRevision: integer(candidate.profileRevision, 'Checkpoint profile revision'),
    missionScriptVersion: integer(candidate.missionScriptVersion, 'Checkpoint mission-script version'),
    snapshot: json(candidate.snapshot, 'Checkpoint snapshot'),
  });
}

const result = (status, values = {}) => freeze({ status, checkpoint: null, reason: null, evictedCheckpointIds: [], ...values });
const chronological = (left, right) => left.tick - right.tick || left.createdAt - right.createdAt || left.checkpointId.localeCompare(right.checkpointId);
const recentFirst = (left, right) => chronological(right, left);

export function createMissionCheckpointEnvelope({ checkpointId, operationId, label = '', createdAt, tick,
  simulationSeed, profileRevision, missionScriptVersion, snapshot }) {
  return normalize({ version: MISSION_CHECKPOINT_VERSION, checkpointId, operationId, label, createdAt, tick,
    simulationSeed, profileRevision, missionScriptVersion, snapshot });
}

export function validateMissionCheckpoint(checkpoint) {
  return normalize(checkpoint);
}

export function serializeMissionCheckpoint(checkpoint) {
  return JSON.stringify(normalize(checkpoint));
}

export function deserializeMissionCheckpoint(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) throw new TypeError('Serialized mission checkpoint must be a non-empty JSON string.');
  try { return normalize(JSON.parse(serialized)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new SyntaxError(`Mission checkpoint JSON is invalid: ${error.message}`);
    throw error;
  }
}

export function checkpointToMissionState(checkpoint) {
  const current = normalize(checkpoint);
  return freeze({
    operationId: current.operationId,
    tick: current.tick,
    simulationSeed: current.simulationSeed,
    snapshot: {
      checkpointVersion: current.version,
      checkpointId: current.checkpointId,
      checkpointLabel: current.label,
      checkpointCreatedAt: current.createdAt,
      profileRevision: current.profileRevision,
      missionScriptVersion: current.missionScriptVersion,
      state: current.snapshot,
    },
  });
}

export function checkpointFromMissionState(missionState) {
  object(missionState, 'Campaign mission state');
  object(missionState.snapshot, 'Campaign mission checkpoint snapshot');
  const wrapped = missionState.snapshot;
  return normalize({
    version: wrapped.checkpointVersion,
    checkpointId: wrapped.checkpointId,
    operationId: missionState.operationId,
    label: wrapped.checkpointLabel ?? '',
    createdAt: wrapped.checkpointCreatedAt,
    tick: missionState.tick,
    simulationSeed: missionState.simulationSeed,
    profileRevision: wrapped.profileRevision,
    missionScriptVersion: wrapped.missionScriptVersion,
    snapshot: wrapped.state,
  });
}

export function createMissionCheckpointService({ maxCheckpointsPerOperation = 3,
  policyForOperation = () => MISSION_CHECKPOINT_POLICIES.ENABLED, initialCheckpoints = [] } = {}) {
  if (!Number.isInteger(maxCheckpointsPerOperation) || maxCheckpointsPerOperation <= 0) {
    throw new TypeError('maxCheckpointsPerOperation must be a positive integer.');
  }
  if (typeof policyForOperation !== 'function') throw new TypeError('policyForOperation must be a function.');
  if (!Array.isArray(initialCheckpoints)) throw new TypeError('initialCheckpoints must be an array.');
  const checkpoints = new Map();
  for (const candidate of initialCheckpoints) {
    const checkpoint = normalize(candidate);
    if (checkpoints.has(checkpoint.checkpointId)) throw new TypeError(`Duplicate initial checkpoint ID: ${checkpoint.checkpointId}`);
    checkpoints.set(checkpoint.checkpointId, checkpoint);
  }

  function policy(operationId) {
    const operation = id(operationId, 'Checkpoint operation ID');
    const value = policyForOperation(operation);
    const normalized = value === false ? MISSION_CHECKPOINT_POLICIES.DISABLED : value === true ? MISSION_CHECKPOINT_POLICIES.ENABLED : value;
    if (!POLICIES.has(normalized)) throw new RangeError(`Unknown checkpoint policy for ${operation}: ${normalized}`);
    return normalized;
  }

  function list(operationId) {
    const operation = id(operationId, 'Checkpoint operation ID');
    return freeze([...checkpoints.values()].filter((entry) => entry.operationId === operation).sort(recentFirst));
  }

  function capture(options) {
    object(options, 'Checkpoint capture options');
    const operationId = id(options.operationId, 'Checkpoint operation ID');
    if (policy(operationId) === MISSION_CHECKPOINT_POLICIES.DISABLED) return result(MISSION_CHECKPOINT_STATUSES.DISABLED);
    const checkpoint = createMissionCheckpointEnvelope(options);
    if (checkpoints.has(checkpoint.checkpointId)) throw new Error(`Checkpoint ID already exists: ${checkpoint.checkpointId}`);
    checkpoints.set(checkpoint.checkpointId, checkpoint);
    const operationCheckpoints = [...checkpoints.values()].filter((entry) => entry.operationId === operationId).sort(chronological);
    const evicted = [];
    while (operationCheckpoints.length > maxCheckpointsPerOperation) {
      const removed = operationCheckpoints.shift();
      checkpoints.delete(removed.checkpointId); evicted.push(removed.checkpointId);
    }
    return result(MISSION_CHECKPOINT_STATUSES.OK, { checkpoint, evictedCheckpointIds: evicted });
  }

  function get(checkpointId) {
    const checkpoint = checkpoints.get(id(checkpointId, 'Checkpoint ID'));
    return checkpoint ? result(MISSION_CHECKPOINT_STATUSES.OK, { checkpoint }) : result(MISSION_CHECKPOINT_STATUSES.MISSING);
  }

  function latest(operationId) {
    const checkpoint = list(operationId)[0];
    return checkpoint ? result(MISSION_CHECKPOINT_STATUSES.OK, { checkpoint }) : result(MISSION_CHECKPOINT_STATUSES.MISSING);
  }

  function restore(checkpointId, { expectedOperationId = null, expectedProfileRevision = null, expectedMissionScriptVersion = null } = {}) {
    const found = get(checkpointId);
    if (found.status !== MISSION_CHECKPOINT_STATUSES.OK) return found;
    const checkpoint = found.checkpoint;
    const mismatches = [];
    if (expectedOperationId !== null && checkpoint.operationId !== id(expectedOperationId, 'Expected operation ID')) mismatches.push('operation');
    if (expectedProfileRevision !== null && checkpoint.profileRevision !== integer(expectedProfileRevision, 'Expected profile revision')) mismatches.push('profile-revision');
    if (expectedMissionScriptVersion !== null && checkpoint.missionScriptVersion !== integer(expectedMissionScriptVersion, 'Expected mission-script version')) mismatches.push('mission-script-version');
    return mismatches.length ? result(MISSION_CHECKPOINT_STATUSES.INCOMPATIBLE, { reason: mismatches.join(',') }) : found;
  }

  function remove(checkpointId) {
    return checkpoints.delete(id(checkpointId, 'Checkpoint ID'));
  }

  function clearOperation(operationId) {
    const ids = list(operationId).map((entry) => entry.checkpointId);
    for (const checkpointId of ids) checkpoints.delete(checkpointId);
    return freeze(ids);
  }

  return freeze({ policy, capture, get, latest, list, restore, remove, clearOperation });
}
