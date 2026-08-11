import { CAMPAIGN_DIFFICULTIES } from '../../core/campaign-profile.js';

export const CAMPAIGN_BALANCE_VERSION = 1;

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const round = (value) => Math.max(0, Math.round(value));

export const CAMPAIGN_DIFFICULTY_BALANCE = deepFreeze({
  [CAMPAIGN_DIFFICULTIES.STORY]: {
    resourceMultiplier: 1.2,
    pressureDelayMultiplier: 1.16,
    reinforcementDelayMultiplier: 1.14,
    objectiveTimerMultiplier: 1.22,
    checkpointTimeMultiplier: 0.9,
    recoveryWindowSeconds: 45,
    combatStatMultiplier: 1,
  },
  [CAMPAIGN_DIFFICULTIES.STANDARD]: {
    resourceMultiplier: 1,
    pressureDelayMultiplier: 1,
    reinforcementDelayMultiplier: 1,
    objectiveTimerMultiplier: 1,
    checkpointTimeMultiplier: 1,
    recoveryWindowSeconds: 30,
    combatStatMultiplier: 1,
  },
  [CAMPAIGN_DIFFICULTIES.VETERAN]: {
    resourceMultiplier: 0.86,
    pressureDelayMultiplier: 0.88,
    reinforcementDelayMultiplier: 0.9,
    objectiveTimerMultiplier: 0.9,
    checkpointTimeMultiplier: 1.08,
    recoveryWindowSeconds: 18,
    combatStatMultiplier: 1,
  },
});

function assertDifficulty(difficulty) {
  const profile = CAMPAIGN_DIFFICULTY_BALANCE[difficulty];
  if (!profile) throw new RangeError(`Unknown campaign balance difficulty: ${difficulty}`);
  return profile;
}

function assertOperationIndex(operationIndex) {
  if (!Number.isInteger(operationIndex) || operationIndex < 0 || operationIndex > 8) {
    throw new RangeError('Campaign operation index must be an integer from 0 through 8.');
  }
  return operationIndex;
}

export function resolveCampaignBalance(difficulty, operationIndex) {
  const profile = assertDifficulty(difficulty);
  const index = assertOperationIndex(operationIndex);
  const lateCampaignPressure = 1 - index * 0.006;
  const lateCampaignResources = 1 - index * 0.008;
  return deepFreeze({
    version: CAMPAIGN_BALANCE_VERSION,
    difficulty,
    operationIndex: index,
    resourceMultiplier: Number((profile.resourceMultiplier * lateCampaignResources).toFixed(3)),
    pressureDelayMultiplier: Number((profile.pressureDelayMultiplier * lateCampaignPressure).toFixed(3)),
    reinforcementDelayMultiplier: Number((profile.reinforcementDelayMultiplier * lateCampaignPressure).toFixed(3)),
    objectiveTimerMultiplier: profile.objectiveTimerMultiplier,
    checkpointTimeMultiplier: profile.checkpointTimeMultiplier,
    recoveryWindowSeconds: profile.recoveryWindowSeconds,
    combatStatMultiplier: 1,
  });
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

function scaleResourceObject(value, multiplier) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const resourceKeys = new Set(['metal', 'fuel', 'intel', 'materiel']);
  let changed = false;
  const output = { ...value };
  for (const key of Object.keys(output)) {
    if (resourceKeys.has(key) && Number.isFinite(output[key])) {
      output[key] = round(output[key] * multiplier);
      changed = true;
    }
  }
  return changed ? output : value;
}

function timingMultiplier(path, key, balance) {
  const context = path.join('.').toLowerCase();
  if (context.includes('checkpoint')) return balance.checkpointTimeMultiplier;
  if (/reinforce|wave|reserve|counterattack/.test(context)) return balance.reinforcementDelayMultiplier;
  const timerKey = key.toLowerCase();
  if (/objective|survive|extract|evac|recovery|repair|rescue/.test(context)
    || ['durationseconds', 'timelimitseconds', 'timeoutseconds', 'windowseconds'].includes(timerKey)) {
    return balance.objectiveTimerMultiplier;
  }
  return balance.pressureDelayMultiplier;
}

function tuneNode(value, balance, path = []) {
  if (Array.isArray(value)) return value.map((child, index) => tuneNode(child, balance, [...path, String(index)]));
  if (!value || typeof value !== 'object') return value;
  const descriptor = ['id', 'type', 'kind', 'action', 'label']
    .map((key) => typeof value[key] === 'string' ? value[key] : '')
    .filter(Boolean)
    .join('-');
  const nodePath = descriptor ? [...path, descriptor] : path;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'start' || key === 'startingResources') && child && typeof child === 'object') {
      output[key] = scaleResourceObject(tuneNode(child, balance, [...nodePath, key]), balance.resourceMultiplier);
      continue;
    }
    if (Number.isFinite(child) && ['afterSeconds', 'delaySeconds', 'durationSeconds', 'timeLimitSeconds', 'timeoutSeconds', 'windowSeconds'].includes(key)) {
      output[key] = Math.max(1, round(child * timingMultiplier([...nodePath, key], key, balance)));
      continue;
    }
    output[key] = tuneNode(child, balance, [...nodePath, key]);
  }
  return output;
}

export function applyCampaignBalance(operationValue, difficulty, operationIndex) {
  if (!operationValue || typeof operationValue !== 'object' || Array.isArray(operationValue)) {
    throw new TypeError('Campaign balance requires an operation object.');
  }
  const balance = resolveCampaignBalance(difficulty, operationIndex);
  const operation = clone(operationValue);
  if (operation.map?.metadata) operation.map.metadata = tuneNode(operation.map.metadata, balance, ['map', 'metadata']);
  if (operation.mission) {
    operation.mission = tuneNode(operation.mission, balance, ['mission']);
    operation.mission.balance = balance;
  }
  if (operation.briefing) {
    operation.briefing = clone(operation.briefing);
    operation.briefing.difficulty = difficulty;
    operation.briefing.difficultyNotes = {
      label: difficulty[0].toUpperCase() + difficulty.slice(1),
      summary: difficulty === CAMPAIGN_DIFFICULTIES.STORY
        ? 'More starting resources, slower pressure, longer timers, and wider recovery windows.'
        : difficulty === CAMPAIGN_DIFFICULTIES.VETERAN
          ? 'Lean starting resources, faster pressure, tighter timers, and fewer recovery margins.'
          : 'Authored baseline resources, pressure, objective timing, and recovery windows.',
      modifiers: [
        `Starting resources ×${balance.resourceMultiplier.toFixed(2)}`,
        `Pressure timing ×${balance.pressureDelayMultiplier.toFixed(2)}`,
        `Objective timers ×${balance.objectiveTimerMultiplier.toFixed(2)}`,
        `${balance.recoveryWindowSeconds}s recovery window`,
        'Combat unit stats unchanged',
      ],
    };
  }
  return deepFreeze(operation);
}

export function buildCampaignPlaytestMatrix(operations) {
  if (!Array.isArray(operations) || operations.length !== 9) throw new Error('Campaign playtest matrix requires all nine operations.');
  return deepFreeze(Object.values(CAMPAIGN_DIFFICULTIES).flatMap((difficulty) =>
    operations.map((operation, operationIndex) => {
      const tuned = applyCampaignBalance(operation, difficulty, operationIndex);
      const balance = tuned.mission?.balance ?? resolveCampaignBalance(difficulty, operationIndex);
      return {
        difficulty,
        operationIndex,
        operationId: operation.id,
        resourceMultiplier: balance.resourceMultiplier,
        pressureDelayMultiplier: balance.pressureDelayMultiplier,
        reinforcementDelayMultiplier: balance.reinforcementDelayMultiplier,
        objectiveTimerMultiplier: balance.objectiveTimerMultiplier,
        checkpointTimeMultiplier: balance.checkpointTimeMultiplier,
        recoveryWindowSeconds: balance.recoveryWindowSeconds,
        combatStatMultiplier: balance.combatStatMultiplier,
      };
    })));
}
