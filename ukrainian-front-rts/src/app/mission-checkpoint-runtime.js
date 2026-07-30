import {
  MISSION_CHECKPOINT_STATUSES,
  checkpointToMissionState,
  createMissionCheckpointService,
} from '../core/mission-checkpoint-service.js';

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

function required(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function.`);
  return value;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

export function createMissionCheckpointRuntime({ service = createMissionCheckpointService(), captureState, applyState,
  pauseMission = () => {}, resumeMission = () => {}, clearTransientState = () => {} }) {
  const capture = required(captureState, 'Checkpoint captureState');
  const apply = required(applyState, 'Checkpoint applyState');
  const pause = required(pauseMission, 'Checkpoint pauseMission');
  const resume = required(resumeMission, 'Checkpoint resumeMission');
  const clear = required(clearTransientState, 'Checkpoint clearTransientState');
  if (!service || typeof service.capture !== 'function' || typeof service.restore !== 'function') throw new TypeError('Checkpoint service is invalid.');

  function captureCheckpoint({ checkpointId = null, label = '', createdAt } = {}) {
    const state = object(capture(), 'Checkpoint captured state');
    const derivedId = checkpointId ?? `checkpoint:${state.operationId}:${state.tick}`;
    return service.capture({ checkpointId: derivedId, label, createdAt, operationId: state.operationId,
      tick: state.tick, simulationSeed: state.simulationSeed, profileRevision: state.profileRevision,
      missionScriptVersion: state.missionScriptVersion, snapshot: state.snapshot });
  }

  function applyCheckpointResult(restored) {
    if (restored.status !== MISSION_CHECKPOINT_STATUSES.OK) return restored;
    const checkpoint = restored.checkpoint;
    const transaction = freeze({
      type: 'mission-checkpoint-restore',
      operationId: checkpoint.operationId,
      checkpointId: checkpoint.checkpointId,
      tick: checkpoint.tick,
      profileRevision: checkpoint.profileRevision,
      missionScriptVersion: checkpoint.missionScriptVersion,
      snapshot: checkpoint.snapshot,
      missionState: checkpointToMissionState(checkpoint),
      replaceMode: 'atomic',
    });
    pause(transaction);
    try {
      clear(transaction);
      apply(transaction);
    } finally {
      resume(transaction);
    }
    return freeze({ ...restored, transaction });
  }

  function restoreCheckpoint(checkpointId, compatibility = {}) {
    return applyCheckpointResult(service.restore(checkpointId, compatibility));
  }

  function restartFromLatestCheckpoint(operationId, compatibility = {}) {
    const latest = service.latest(operationId);
    if (latest.status !== MISSION_CHECKPOINT_STATUSES.OK) return latest;
    return restoreCheckpoint(latest.checkpoint.checkpointId, { ...compatibility, expectedOperationId: operationId });
  }

  return freeze({
    captureCheckpoint,
    restoreCheckpoint,
    restartFromLatestCheckpoint,
    listCheckpoints: service.list,
    removeCheckpoint: service.remove,
    clearOperationCheckpoints: service.clearOperation,
  });
}
