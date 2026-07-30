export const CAMPAIGN_PROFILE_VERSION = 1;

export const CAMPAIGN_DIFFICULTIES = Object.freeze({
  STORY: 'story',
  STANDARD: 'standard',
  VETERAN: 'veteran',
});

export const CAMPAIGN_MISSION_OUTCOMES = Object.freeze({
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  WITHDRAWAL: 'withdrawal',
});

const DIFFICULTIES = new Set(Object.values(CAMPAIGN_DIFFICULTIES));
const OUTCOMES = new Set(Object.values(CAMPAIGN_MISSION_OUTCOMES));
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function assertIdentifier(value, label, pattern = CONTENT_ID_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${label} must be a stable non-empty identifier.`);
  }
  return value;
}

function assertDifficulty(value) {
  if (!DIFFICULTIES.has(value)) throw new RangeError(`Unknown campaign difficulty: ${value}`);
  return value;
}

function assertOutcome(value) {
  if (!OUTCOMES.has(value)) throw new RangeError(`Unknown campaign mission outcome: ${value}`);
  return value;
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function cloneJsonValue(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite JSON values.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must contain only JSON-compatible values.`);
  if (seen.has(value)) throw new TypeError(`${label} must not contain circular references.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item, index) => cloneJsonValue(item, `${label}[${index}]`, seen));
  } else {
    assertPlainObject(value, label);
    result = {};
    for (const key of Object.keys(value).sort()) {
      assertIdentifier(key, `${label} key`);
      result[key] = cloneJsonValue(value[key], `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function uniqueSortedIds(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return Object.freeze([...new Set(values.map((value) => assertIdentifier(value, `${label} entry`)))].sort());
}

function canonicalObject(record, valueMapper = (value) => value) {
  assertPlainObject(record, 'Campaign record');
  const result = {};
  for (const key of Object.keys(record).sort()) {
    assertIdentifier(key, 'Campaign record key');
    result[key] = valueMapper(record[key], key);
  }
  return Object.freeze(result);
}

function normalizeMissionResult(result, operationId) {
  assertPlainObject(result, 'Mission result');
  const outcome = assertOutcome(result.outcome);
  const score = assertNonNegativeInteger(result.score ?? 0, 'Mission score');
  const attempts = assertNonNegativeInteger(result.attempts ?? 1, 'Mission attempts');
  if (attempts === 0) throw new RangeError('Mission attempts must be at least 1.');
  const completedTick = result.completedTick === null || result.completedTick === undefined
    ? null
    : assertNonNegativeInteger(result.completedTick, 'Mission completion tick');
  const medalIds = uniqueSortedIds(result.medalIds ?? [], 'Mission medal IDs');
  return Object.freeze({
    operationId,
    outcome,
    score,
    attempts,
    completedTick,
    medalIds,
  });
}

function validateProfileShape(profile) {
  assertPlainObject(profile, 'Campaign profile');
  if (profile.version !== CAMPAIGN_PROFILE_VERSION) {
    throw new RangeError(`Unsupported campaign profile version: ${profile.version}`);
  }
  assertIdentifier(profile.profileId, 'Campaign profile ID', PROFILE_ID_PATTERN);
  assertDifficulty(profile.difficulty);
  assertNonNegativeInteger(profile.revision, 'Campaign revision');
  const unlockedOperationIds = uniqueSortedIds(profile.unlockedOperationIds, 'Unlocked operation IDs');
  const completedOperationIds = uniqueSortedIds(profile.completedOperationIds, 'Completed operation IDs');
  const unlockedUpgradeIds = uniqueSortedIds(profile.unlockedUpgradeIds, 'Unlocked upgrade IDs');
  const medalIds = uniqueSortedIds(profile.medalIds, 'Campaign medal IDs');
  const choices = canonicalObject(profile.choices, (value, key) => cloneJsonValue(value, `Campaign choice ${key}`));
  const missionResults = canonicalObject(profile.missionResults, (value, operationId) => normalizeMissionResult(value, operationId));

  for (const operationId of completedOperationIds) {
    if (!missionResults[operationId] || missionResults[operationId].outcome !== CAMPAIGN_MISSION_OUTCOMES.VICTORY) {
      throw new Error(`Completed operation ${operationId} requires a victory mission result.`);
    }
  }
  for (const [operationId, result] of Object.entries(missionResults)) {
    if (!unlockedOperationIds.includes(operationId)) {
      throw new Error(`Mission result operation ${operationId} must be unlocked.`);
    }
    if (result.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY && !completedOperationIds.includes(operationId)) {
      throw new Error(`Victory result operation ${operationId} must be completed.`);
    }
    for (const medalId of result.medalIds) {
      if (!medalIds.includes(medalId)) {
        throw new Error(`Mission medal ${medalId} must exist in the campaign medal set.`);
      }
    }
  }

  return deepFreeze({
    version: CAMPAIGN_PROFILE_VERSION,
    profileId: profile.profileId,
    difficulty: profile.difficulty,
    revision: profile.revision,
    unlockedOperationIds,
    completedOperationIds,
    choices,
    missionResults,
    unlockedUpgradeIds,
    medalIds,
  });
}

function withRevision(profile, changes) {
  const current = validateProfileShape(profile);
  return validateProfileShape({
    ...current,
    ...changes,
    revision: current.revision + 1,
  });
}

export function createCampaignProfile({
  profileId = 'default',
  difficulty = CAMPAIGN_DIFFICULTIES.STANDARD,
  initialOperationIds = [],
} = {}) {
  return validateProfileShape({
    version: CAMPAIGN_PROFILE_VERSION,
    profileId,
    difficulty,
    revision: 0,
    unlockedOperationIds: initialOperationIds,
    completedOperationIds: [],
    choices: {},
    missionResults: {},
    unlockedUpgradeIds: [],
    medalIds: [],
  });
}

export function setCampaignDifficulty(profile, difficulty) {
  const current = validateProfileShape(profile);
  const nextDifficulty = assertDifficulty(difficulty);
  if (current.difficulty === nextDifficulty) return current;
  return withRevision(current, { difficulty: nextDifficulty });
}

export function unlockCampaignOperation(profile, operationId) {
  const current = validateProfileShape(profile);
  const id = assertIdentifier(operationId, 'Operation ID');
  if (current.unlockedOperationIds.includes(id)) return current;
  return withRevision(current, { unlockedOperationIds: [...current.unlockedOperationIds, id] });
}

export function setCampaignChoice(profile, choiceId, value) {
  const current = validateProfileShape(profile);
  const id = assertIdentifier(choiceId, 'Campaign choice ID');
  const nextValue = cloneJsonValue(value, `Campaign choice ${id}`);
  const existing = current.choices[id];
  if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(nextValue)) return current;
  return withRevision(current, { choices: { ...current.choices, [id]: nextValue } });
}

export function unlockCampaignUpgrade(profile, upgradeId) {
  const current = validateProfileShape(profile);
  const id = assertIdentifier(upgradeId, 'Upgrade ID');
  if (current.unlockedUpgradeIds.includes(id)) return current;
  return withRevision(current, { unlockedUpgradeIds: [...current.unlockedUpgradeIds, id] });
}

export function awardCampaignMedal(profile, medalId) {
  const current = validateProfileShape(profile);
  const id = assertIdentifier(medalId, 'Medal ID');
  if (current.medalIds.includes(id)) return current;
  return withRevision(current, { medalIds: [...current.medalIds, id] });
}

export function recordCampaignMissionResult(profile, operationId, result) {
  const current = validateProfileShape(profile);
  const id = assertIdentifier(operationId, 'Operation ID');
  if (!current.unlockedOperationIds.includes(id)) {
    throw new Error(`Cannot record a result for locked operation: ${id}`);
  }
  assertPlainObject(result, 'Mission result');
  const previous = current.missionResults[id];
  const incomingOutcome = assertOutcome(result.outcome);
  const incomingCompletedTick = result.completedTick === null || result.completedTick === undefined
    ? null
    : assertNonNegativeInteger(result.completedTick, 'Mission completion tick');
  const outcome = previous?.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY
    ? CAMPAIGN_MISSION_OUTCOMES.VICTORY
    : incomingOutcome;
  const victoryTicks = [
    previous?.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY ? previous.completedTick : null,
    incomingOutcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY ? incomingCompletedTick : null,
  ].filter((value) => value !== null);
  const best = normalizeMissionResult({
    outcome,
    score: Math.max(previous?.score ?? 0, assertNonNegativeInteger(result.score ?? 0, 'Mission score')),
    attempts: (previous?.attempts ?? 0) + 1,
    completedTick: victoryTicks.length ? Math.min(...victoryTicks) : incomingCompletedTick,
    medalIds: [...(previous?.medalIds ?? []), ...(result.medalIds ?? [])],
  }, id);
  const completedOperationIds = best.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY
    ? [...current.completedOperationIds, id]
    : current.completedOperationIds;
  return withRevision(current, {
    missionResults: { ...current.missionResults, [id]: best },
    completedOperationIds,
    medalIds: [...current.medalIds, ...best.medalIds],
  });
}

export function serializeCampaignProfile(profile) {
  return JSON.stringify(validateProfileShape(profile));
}

export function deserializeCampaignProfile(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('Serialized campaign profile must be a non-empty JSON string.');
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(`Campaign profile JSON is invalid: ${error.message}`);
  }
  return validateProfileShape(parsed);
}

export function validateCampaignProfile(profile) {
  return validateProfileShape(profile);
}
