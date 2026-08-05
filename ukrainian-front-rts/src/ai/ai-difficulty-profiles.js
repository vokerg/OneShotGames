import { createAiDoctrineProfile } from './ai-contracts.js';

export const AI_DIFFICULTY_SCHEMA_VERSION = 1;
export const DEFAULT_AI_DIFFICULTY_ID = 'regular';

const PLAIN_OBJECT = Object.getPrototypeOf({});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

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

function assertUnitInterval(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1`);
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createAiDifficultyProfile({
  id,
  displayNameKey,
  observationDelayTicks = 0,
  reactionDelayTicks = 0,
  planningQuality = 0.75,
  riskTolerance = 0.5,
  economyEfficiency = 0.85,
  informationPolicy = 'observed-only',
  resourceMultiplier = 1,
  damageMultiplier = 1,
  healthMultiplier = 1,
} = {}) {
  if (informationPolicy !== 'observed-only') {
    throw new RangeError('informationPolicy must be observed-only');
  }
  for (const [label, value] of Object.entries({ resourceMultiplier, damageMultiplier, healthMultiplier })) {
    if (value !== 1) throw new RangeError(`${label} must remain 1; default AI profiles cannot use hidden stat cheats`);
  }

  return deepFreeze({
    schemaVersion: AI_DIFFICULTY_SCHEMA_VERSION,
    id: assertId(id, 'id'),
    displayNameKey: assertId(displayNameKey, 'displayNameKey'),
    informationPolicy,
    observationDelayTicks: assertInteger(observationDelayTicks, 'observationDelayTicks'),
    reactionDelayTicks: assertInteger(reactionDelayTicks, 'reactionDelayTicks'),
    planningQuality: assertUnitInterval(planningQuality, 'planningQuality'),
    riskTolerance: assertUnitInterval(riskTolerance, 'riskTolerance'),
    economyEfficiency: assertUnitInterval(economyEfficiency, 'economyEfficiency'),
    fairness: deepFreeze({
      resourceMultiplier,
      damageMultiplier,
      healthMultiplier,
      fullMapVision: false,
      ignoresFogOfWar: false,
    }),
  });
}

const PROFILE_LIST = [
  createAiDifficultyProfile({
    id: 'recruit',
    displayNameKey: 'difficulty.recruit',
    observationDelayTicks: 45,
    reactionDelayTicks: 45,
    planningQuality: 0.45,
    riskTolerance: 0.3,
    economyEfficiency: 0.6,
  }),
  createAiDifficultyProfile({
    id: 'regular',
    displayNameKey: 'difficulty.regular',
    observationDelayTicks: 20,
    reactionDelayTicks: 24,
    planningQuality: 0.7,
    riskTolerance: 0.48,
    economyEfficiency: 0.8,
  }),
  createAiDifficultyProfile({
    id: 'veteran',
    displayNameKey: 'difficulty.veteran',
    observationDelayTicks: 8,
    reactionDelayTicks: 12,
    planningQuality: 0.88,
    riskTolerance: 0.58,
    economyEfficiency: 0.93,
  }),
  createAiDifficultyProfile({
    id: 'commander',
    displayNameKey: 'difficulty.commander',
    observationDelayTicks: 0,
    reactionDelayTicks: 6,
    planningQuality: 1,
    riskTolerance: 0.66,
    economyEfficiency: 1,
  }),
];

export const AI_DIFFICULTY_PROFILES = deepFreeze(Object.fromEntries(PROFILE_LIST.map((profile) => [profile.id, profile])));
export const AI_DIFFICULTY_IDS = Object.freeze(PROFILE_LIST.map((profile) => profile.id));

export function resolveAiDifficultyProfile(value = DEFAULT_AI_DIFFICULTY_ID) {
  if (typeof value === 'string') {
    const profile = AI_DIFFICULTY_PROFILES[value];
    if (!profile) throw new RangeError(`unknown AI difficulty profile: ${value}`);
    return profile;
  }
  assertRecord(value, 'difficulty profile');
  return createAiDifficultyProfile(value);
}

export function projectObservedContactsForDifficulty({ contacts = [], tick = 0, difficulty } = {}) {
  const profile = resolveAiDifficultyProfile(difficulty);
  const currentTick = assertInteger(tick, 'tick');
  if (!Array.isArray(contacts)) throw new TypeError('contacts must be an array');
  const latestVisibleTick = currentTick - profile.observationDelayTicks;

  return Object.freeze(contacts
    .filter((contact) => {
      assertRecord(contact, 'contact');
      const observedTick = assertInteger(contact.observedTick, 'contact.observedTick');
      return observedTick <= latestVisibleTick;
    })
    .map((contact) => deepFreeze({ ...contact }))
    .sort((left, right) => left.observedTick - right.observedTick || String(left.id).localeCompare(String(right.id))));
}

export function createDifficultyAdjustedDoctrineProfile({ doctrine, difficulty } = {}) {
  assertRecord(doctrine, 'doctrine');
  const profile = resolveAiDifficultyProfile(difficulty);
  const qualityPenalty = Math.round((1 - profile.planningQuality) * doctrine.decisionIntervalTicks);
  const decisionIntervalTicks = Math.max(
    1,
    doctrine.decisionIntervalTicks + profile.reactionDelayTicks + qualityPenalty,
  );

  return createAiDoctrineProfile({
    id: `${doctrine.id}:${profile.id}`,
    factionId: doctrine.factionId,
    strategy: doctrine.strategy,
    decisionIntervalTicks,
    decisionOffsetTicks: doctrine.decisionOffsetTicks % decisionIntervalTicks,
    contactStaleAfterTicks: doctrine.contactStaleAfterTicks + profile.observationDelayTicks,
    contactForgetAfterTicks: doctrine.contactForgetAfterTicks + profile.observationDelayTicks,
    riskTolerance: clamp((doctrine.riskTolerance + profile.riskTolerance) / 2, 0, 1),
    retreatThreshold: clamp(doctrine.retreatThreshold + (0.5 - profile.planningQuality) * 0.2, 0.1, 0.9),
    informationPolicy: profile.informationPolicy,
    budgetWeights: doctrine.budgetWeights,
    goalWeights: doctrine.goalWeights,
  });
}

export function createAiEconomyDifficultyLimits(difficulty) {
  const profile = resolveAiDifficultyProfile(difficulty);
  return deepFreeze({
    schemaVersion: AI_DIFFICULTY_SCHEMA_VERSION,
    profileId: profile.id,
    utilizationRatio: profile.economyEfficiency,
    maximumConcurrentPlans: Math.max(1, Math.round(1 + profile.economyEfficiency * 5)),
    reserveRatio: Number(((1 - profile.economyEfficiency) * 0.2).toFixed(3)),
    resourceMultiplier: 1,
    costMultiplier: 1,
    buildTimeMultiplier: 1,
  });
}

export function createAiDifficultyRuntimePolicy({ doctrine, difficulty } = {}) {
  const profile = resolveAiDifficultyProfile(difficulty);
  return deepFreeze({
    schemaVersion: AI_DIFFICULTY_SCHEMA_VERSION,
    profile,
    doctrine: createDifficultyAdjustedDoctrineProfile({ doctrine, difficulty: profile }),
    economy: createAiEconomyDifficultyLimits(profile),
  });
}
