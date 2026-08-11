import { createCampaignSaveRuntime } from '../../src/app/campaign-save-runtime.js';
import {
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_MISSION_OUTCOMES,
  createCampaignProfile,
} from '../../src/core/campaign-profile.js';
import { CAMPAIGN_SAVE_STATUSES } from '../../src/core/campaign-save-service.js';
import {
  CAMPAIGN_OPERATION_IDS,
  CAMPAIGN_OPERATION_SEQUENCE,
} from '../../src/content/campaign/campaign-operation-registry.js';
import { auditCampaignContent } from '../../src/content/campaign/campaign-content-policy.js';
import {
  CAMPAIGN_PROGRESSION_STAGES,
  createCampaignProgressionRuntime,
} from '../../src/ui/campaign-progression-runtime.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`Campaign alpha gate failed: ${message}`);
}

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()].sort()[index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function validateAuthoredCheckpointContracts(value, path = 'operation') {
  if (!value || typeof value !== 'object') return 0;
  let contracts = 0;
  if (Object.prototype.hasOwnProperty.call(value, 'checkpointPolicy')) {
    const policy = value.checkpointPolicy;
    invariant(policy && typeof policy === 'object' && !Array.isArray(policy), `${path}.checkpointPolicy must be an object`);
    if (policy.enabled === true) {
      invariant(Array.isArray(policy.stablePoints) && policy.stablePoints.length > 0, `${path}.checkpointPolicy must declare stable points when enabled`);
      const ids = policy.stablePoints.map((point) => point?.id);
      invariant(ids.every((id) => typeof id === 'string' && id.length > 0), `${path}.checkpointPolicy stable points require IDs`);
      invariant(new Set(ids).size === ids.length, `${path}.checkpointPolicy stable point IDs must be unique`);
      contracts += 1;
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'checkpointLabels')) {
    const labels = value.checkpointLabels;
    invariant(Array.isArray(labels), `${path}.checkpointLabels must be an array`);
    const ids = labels.map((label) => label?.id);
    invariant(ids.every((id) => typeof id === 'string' && id.length > 0), `${path}.checkpointLabels require IDs`);
    invariant(new Set(ids).size === ids.length, `${path}.checkpointLabels IDs must be unique`);
    contracts += 1;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'checkpointPolicy' || key === 'checkpointLabels') continue;
    contracts += validateAuthoredCheckpointContracts(child, `${path}.${key}`);
  }
  return contracts;
}

function runDifficulty(difficulty) {
  let currentProfile = createCampaignProfile({
    profileId: `alpha-${difficulty}`,
    difficulty,
    initialOperationIds: [CAMPAIGN_OPERATION_IDS[0]],
  });
  let currentMissionState = null;
  let restored = null;
  const progression = createCampaignProgressionRuntime({
    profile: currentProfile,
    onProfileChange(profile) { currentProfile = profile; },
  });
  const saves = createCampaignSaveRuntime({
    storage: createStorage(),
    now: () => 1_000,
    captureState: () => ({ profile: currentProfile, missionState: currentMissionState }),
    restoreState: (state) => { restored = state; },
  });

  let checkpointContracts = 0;
  let saveRestores = 0;
  let firstBalance = null;

  CAMPAIGN_OPERATION_IDS.forEach((operationId, operationIndex) => {
    invariant(progression.snapshot().profile.unlockedOperationIds.includes(operationId), `${difficulty}/${operationId} must be unlocked in sequence`);
    const operation = progression.beginOperation(operationId);
    invariant(operation.briefing?.difficulty === difficulty, `${difficulty}/${operationId} briefing must receive active difficulty`);
    invariant(operation.mission?.balance?.difficulty === difficulty, `${difficulty}/${operationId} mission must receive runtime balance`);
    invariant(operation.mission.balance.combatStatMultiplier === 1, `${difficulty}/${operationId} may not use hidden combat-stat cheats`);
    if (operationIndex === 0) firstBalance = operation.mission.balance;
    checkpointContracts += validateAuthoredCheckpointContracts(operation.mission, `${difficulty}/${operationId}.mission`);

    progression.enterBattlefield(operationId);
    currentMissionState = {
      operationId,
      tick: (operationIndex + 1) * 120,
      simulationSeed: `alpha-${difficulty}-${operationIndex + 1}`,
      snapshot: {
        checkpointId: `alpha-checkpoint-${operationIndex + 1}`,
        difficulty,
        operationIndex,
      },
    };
    const slotId = `alpha-${difficulty}-${operationIndex + 1}`;
    const saved = saves.saveSlot({ slotId, label: `${difficulty} operation ${operationIndex + 1}` });
    invariant(saved.slotId === slotId && saved.profile.revision === currentProfile.revision, `${difficulty}/${operationId} checkpoint save must persist the active profile`);
    restored = null;
    const loaded = saves.loadSlot(slotId);
    invariant(loaded.status === CAMPAIGN_SAVE_STATUSES.OK && restored, `${difficulty}/${operationId} checkpoint restore must succeed`);
    invariant(restored.profile.revision === currentProfile.revision, `${difficulty}/${operationId} restored profile revision must match`);
    invariant(restored.missionState?.operationId === operationId, `${difficulty}/${operationId} restored mission operation must match`);
    invariant(restored.missionState?.snapshot?.checkpointId === currentMissionState.snapshot.checkpointId, `${difficulty}/${operationId} restored checkpoint must match`);
    saveRestores += 1;

    const debrief = progression.recordResult(operationId, {
      outcome: CAMPAIGN_MISSION_OUTCOMES.VICTORY,
      score: 70 + operationIndex * 3,
      completedTick: (operationIndex + 1) * 1_000,
    });
    currentMissionState = null;
    if (operationIndex < CAMPAIGN_OPERATION_IDS.length - 1) {
      invariant(debrief.nextOperationId === CAMPAIGN_OPERATION_IDS[operationIndex + 1], `${difficulty}/${operationId} must unlock the next operation`);
      progression.returnToOperations();
    } else {
      invariant(progression.snapshot().stage === CAMPAIGN_PROGRESSION_STAGES.CREDITS_READY, `${difficulty} finale must reach credits-ready`);
      const credits = progression.showCredits();
      invariant(credits.stage === CAMPAIGN_PROGRESSION_STAGES.CREDITS, `${difficulty} finale must transition to credits`);
    }
  });

  const finalSnapshot = progression.snapshot();
  invariant(finalSnapshot.profile.completedOperationIds.length === CAMPAIGN_OPERATION_IDS.length, `${difficulty} must complete all operations`);
  invariant(finalSnapshot.stage === CAMPAIGN_PROGRESSION_STAGES.CREDITS, `${difficulty} must finish at credits`);
  invariant(firstBalance, `${difficulty} must expose a balance profile`);

  return Object.freeze({
    difficulty,
    operationsCompleted: finalSnapshot.profile.completedOperationIds.length,
    saveRestores,
    checkpointContracts,
    finalStage: finalSnapshot.stage,
    firstBalance,
  });
}

export function runCampaignAlphaGate() {
  invariant(CAMPAIGN_OPERATION_IDS.length === 9, 'campaign must contain exactly nine operations');
  const contentAudit = auditCampaignContent(CAMPAIGN_OPERATION_SEQUENCE);
  invariant(contentAudit.passed, `campaign content audit has ${contentAudit.violations.length} violation(s)`);
  const runs = Object.values(CAMPAIGN_DIFFICULTIES).map(runDifficulty);
  const byDifficulty = Object.fromEntries(runs.map((run) => [run.difficulty, run]));
  invariant(byDifficulty.story.firstBalance.resourceMultiplier > byDifficulty.standard.firstBalance.resourceMultiplier, 'Story must start with more resources than Standard');
  invariant(byDifficulty.standard.firstBalance.resourceMultiplier > byDifficulty.veteran.firstBalance.resourceMultiplier, 'Standard must start with more resources than Veteran');
  invariant(byDifficulty.story.firstBalance.pressureDelayMultiplier > byDifficulty.standard.firstBalance.pressureDelayMultiplier, 'Story pressure must arrive later than Standard');
  invariant(byDifficulty.standard.firstBalance.pressureDelayMultiplier > byDifficulty.veteran.firstBalance.pressureDelayMultiplier, 'Standard pressure must arrive later than Veteran');

  return Object.freeze({
    status: 'alpha-ready',
    difficulties: runs.map((run) => run.difficulty),
    operationRuns: runs.reduce((sum, run) => sum + run.operationsCompleted, 0),
    checkpointSaveRestores: runs.reduce((sum, run) => sum + run.saveRestores, 0),
    authoredCheckpointContracts: runs.reduce((sum, run) => sum + run.checkpointContracts, 0),
    creditsTransitions: runs.filter((run) => run.finalStage === CAMPAIGN_PROGRESSION_STAGES.CREDITS).length,
    contentAuditViolations: contentAudit.violations.length,
    blockers: Object.freeze([]),
    runs: Object.freeze(runs),
  });
}
