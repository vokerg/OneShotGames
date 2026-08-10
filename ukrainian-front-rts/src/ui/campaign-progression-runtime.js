import {
  CAMPAIGN_MISSION_OUTCOMES,
  createCampaignProfile,
  recordCampaignMissionResult,
  unlockCampaignOperation,
  validateCampaignProfile,
} from '../core/campaign-profile.js';
import {
  CAMPAIGN_OPERATION_IDS,
  campaignOperationSummary,
  getCampaignOperation,
  getNextCampaignOperation,
} from '../content/campaign/campaign-operation-registry.js';
import {
  CAMPAIGN_FINALE_OPERATION,
  CAMPAIGN_FINALE_OPERATION_ID,
  createFinaleDebrief,
  createFinaleMission,
} from '../content/campaign/finale-operation.js';

export const CAMPAIGN_PROGRESSION_VERSION = 1;
export const CAMPAIGN_PROGRESSION_STAGES = Object.freeze({
  OPERATIONS: 'operations',
  BRIEFING: 'briefing',
  BATTLEFIELD: 'battlefield',
  DEBRIEF: 'debrief',
  CREDITS_READY: 'credits-ready',
  CREDITS: 'credits',
});

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

function defaultProfile() {
  return createCampaignProfile({ initialOperationIds: [CAMPAIGN_OPERATION_IDS[0]] });
}

function normalizeResult(result = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('Campaign result must be an object.');
  return {
    outcome: result.outcome ?? CAMPAIGN_MISSION_OUTCOMES.VICTORY,
    score: Number.isInteger(result.score) && result.score >= 0 ? result.score : 0,
    completedTick: result.completedTick == null ? null : result.completedTick,
    medalIds: Array.isArray(result.medalIds) ? result.medalIds : [],
  };
}

export function createCampaignProgressionRuntime({ profile: initialProfile = null, onProfileChange = () => {} } = {}) {
  if (typeof onProfileChange !== 'function') throw new TypeError('Campaign progression onProfileChange must be a function.');
  let profile = initialProfile ? validateCampaignProfile(initialProfile) : defaultProfile();
  let stage = CAMPAIGN_PROGRESSION_STAGES.OPERATIONS;
  let activeOperationId = null;
  let debrief = null;

  const publish = () => onProfileChange(profile);
  const setProfile = (next) => {
    profile = validateCampaignProfile(next);
    publish();
    return profile;
  };

  function beginOperation(operationId) {
    if (!profile.unlockedOperationIds.includes(operationId)) throw new Error(`Cannot begin locked operation: ${operationId}`);
    const operation = getCampaignOperation(operationId);
    activeOperationId = operationId;
    debrief = null;
    stage = CAMPAIGN_PROGRESSION_STAGES.BRIEFING;
    return operationId === CAMPAIGN_FINALE_OPERATION_ID
      ? deepFreeze({ ...operation, mission: createFinaleMission(profile) })
      : operation;
  }

  function enterBattlefield(operationId = activeOperationId) {
    if (!operationId || operationId !== activeOperationId) throw new Error('Campaign battlefield transition requires the active operation.');
    if (stage !== CAMPAIGN_PROGRESSION_STAGES.BRIEFING) throw new Error('Campaign battlefield may start only from briefing.');
    stage = CAMPAIGN_PROGRESSION_STAGES.BATTLEFIELD;
    return snapshot();
  }

  function recordResult(operationId, resultValue) {
    if (operationId !== activeOperationId) throw new Error('Campaign result must match the active operation.');
    if (stage !== CAMPAIGN_PROGRESSION_STAGES.BATTLEFIELD) throw new Error('Campaign result requires battlefield stage.');
    const result = normalizeResult(resultValue);
    let nextProfile = recordCampaignMissionResult(profile, operationId, result);
    const nextOperation = getNextCampaignOperation(operationId);
    if (result.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY && nextOperation) {
      nextProfile = unlockCampaignOperation(nextProfile, nextOperation.id);
    }
    setProfile(nextProfile);

    if (operationId === CAMPAIGN_FINALE_OPERATION_ID) {
      debrief = createFinaleDebrief({ profile, ...result, losses: resultValue.losses });
      stage = debrief.creditsTransition.available
        ? CAMPAIGN_PROGRESSION_STAGES.CREDITS_READY
        : CAMPAIGN_PROGRESSION_STAGES.DEBRIEF;
    } else {
      debrief = deepFreeze({
        operationId,
        outcome: result.outcome,
        score: result.score,
        completedTick: result.completedTick,
        nextOperationId: result.outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY ? nextOperation?.id ?? null : null,
      });
      stage = CAMPAIGN_PROGRESSION_STAGES.DEBRIEF;
    }
    return debrief;
  }

  function returnToOperations() {
    stage = CAMPAIGN_PROGRESSION_STAGES.OPERATIONS;
    activeOperationId = null;
    debrief = null;
    return snapshot();
  }

  function showCredits() {
    if (stage !== CAMPAIGN_PROGRESSION_STAGES.CREDITS_READY) throw new Error('Credits are available only after a victorious finale debrief.');
    stage = CAMPAIGN_PROGRESSION_STAGES.CREDITS;
    return deepFreeze({
      ...CAMPAIGN_FINALE_OPERATION.credits,
      stage,
      operationId: CAMPAIGN_FINALE_OPERATION_ID,
      profileRevision: profile.revision,
      completedOperationIds: [...profile.completedOperationIds],
      medalIds: [...profile.medalIds],
    });
  }

  function snapshot() {
    return deepFreeze({
      version: CAMPAIGN_PROGRESSION_VERSION,
      stage,
      activeOperationId,
      debrief,
      profile,
      operations: campaignOperationSummary().map((operation) => ({
        ...operation,
        unlocked: profile.unlockedOperationIds.includes(operation.id),
        completed: profile.completedOperationIds.includes(operation.id),
      })),
    });
  }

  publish();
  return Object.freeze({
    beginOperation,
    enterBattlefield,
    recordResult,
    returnToOperations,
    showCredits,
    snapshot,
    profile: () => profile,
  });
}

export function installCampaignProgressionRuntime({ game, windowTarget = globalThis.window, profile = game?.campaignProfile ?? null } = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('Campaign progression install requires a game object.');
  const previousProfile = game.campaignProfile;
  const previousRuntime = game.campaignRuntime;
  const previousDiagnostic = windowTarget?.__fieldsOfResolveCampaign;
  const runtime = createCampaignProgressionRuntime({
    profile,
    onProfileChange(nextProfile) { game.campaignProfile = nextProfile; },
  });
  game.campaignRuntime = runtime;
  if (windowTarget) {
    windowTarget.__fieldsOfResolveCampaign = Object.freeze({
      snapshot: runtime.snapshot,
      beginOperation: runtime.beginOperation,
      enterBattlefield: runtime.enterBattlefield,
      recordResult: runtime.recordResult,
      showCredits: runtime.showCredits,
    });
  }
  return Object.freeze({
    runtime,
    dispose() {
      if (previousProfile === undefined) delete game.campaignProfile;
      else game.campaignProfile = previousProfile;
      if (previousRuntime === undefined) delete game.campaignRuntime;
      else game.campaignRuntime = previousRuntime;
      if (windowTarget) {
        if (previousDiagnostic === undefined) delete windowTarget.__fieldsOfResolveCampaign;
        else windowTarget.__fieldsOfResolveCampaign = previousDiagnostic;
      }
    },
  });
}
