import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionCheckpointService, MISSION_CHECKPOINT_STATUSES } from '../../src/core/mission-checkpoint-service.js';
import { createMissionCheckpointRuntime } from '../../src/app/mission-checkpoint-runtime.js';

const state = (tick = 10) => ({ operationId: 'operation-a', tick, simulationSeed: 42,
  profileRevision: 3, missionScriptVersion: 1, snapshot: { variables: { phase: 2 }, triggers: { counterattack: { fired: true, enabled: false } } } });

test('runtime captures one reference-free mission snapshot with deterministic default ID', () => {
  const runtime = createMissionCheckpointRuntime({ service: createMissionCheckpointService(), captureState: () => state(), applyState() {} });
  const result = runtime.captureCheckpoint({ createdAt: 1000, label: 'Phase two' });
  assert.equal(result.status, MISSION_CHECKPOINT_STATUSES.OK);
  assert.equal(result.checkpoint.checkpointId, 'checkpoint:operation-a:10');
  assert.notEqual(result.checkpoint.snapshot, state().snapshot);
});

test('restore pauses, clears transients, applies atomically, and resumes in order', () => {
  const calls = []; const service = createMissionCheckpointService();
  service.capture({ checkpointId: 'checkpoint:a:10', operationId: 'operation-a', createdAt: 1000, tick: 10,
    simulationSeed: 42, profileRevision: 3, missionScriptVersion: 1, snapshot: state().snapshot });
  const runtime = createMissionCheckpointRuntime({ service, captureState: () => state(),
    pauseMission: (transaction) => calls.push(['pause', transaction.type]),
    clearTransientState: (transaction) => calls.push(['clear', transaction.replaceMode]),
    applyState: (transaction) => calls.push(['apply', transaction.missionState.tick]),
    resumeMission: (transaction) => calls.push(['resume', transaction.checkpointId]) });
  const result = runtime.restoreCheckpoint('checkpoint:a:10', { expectedOperationId: 'operation-a', expectedProfileRevision: 3, expectedMissionScriptVersion: 1 });
  assert.equal(result.transaction.replaceMode, 'atomic');
  assert.deepEqual(calls, [['pause', 'mission-checkpoint-restore'], ['clear', 'atomic'], ['apply', 10], ['resume', 'checkpoint:a:10']]);
});

test('incompatible restore does not pause or mutate live state', () => {
  let calls = 0; const service = createMissionCheckpointService();
  service.capture({ checkpointId: 'checkpoint:a:10', operationId: 'operation-a', createdAt: 1000, tick: 10,
    simulationSeed: 42, profileRevision: 3, missionScriptVersion: 1, snapshot: {} });
  const runtime = createMissionCheckpointRuntime({ service, captureState: () => state(), applyState: () => { calls += 1; }, pauseMission: () => { calls += 1; } });
  const result = runtime.restoreCheckpoint('checkpoint:a:10', { expectedMissionScriptVersion: 2 });
  assert.equal(result.status, MISSION_CHECKPOINT_STATUSES.INCOMPATIBLE);
  assert.equal(calls, 0);
});

test('resume runs even when atomic application throws', () => {
  const calls = []; const service = createMissionCheckpointService();
  service.capture({ checkpointId: 'checkpoint:a:10', operationId: 'operation-a', createdAt: 1000, tick: 10,
    simulationSeed: 42, profileRevision: 3, missionScriptVersion: 1, snapshot: {} });
  const runtime = createMissionCheckpointRuntime({ service, captureState: () => state(),
    applyState: () => { calls.push('apply'); throw new Error('restore failed'); },
    pauseMission: () => calls.push('pause'), resumeMission: () => calls.push('resume') });
  assert.throws(() => runtime.restoreCheckpoint('checkpoint:a:10'), /restore failed/);
  assert.deepEqual(calls, ['pause', 'apply', 'resume']);
});

test('restartFromLatestCheckpoint selects the newest operation checkpoint', () => {
  const applied = []; const service = createMissionCheckpointService();
  for (const tick of [10, 30, 20]) service.capture({ checkpointId: `checkpoint:a:${tick}`, operationId: 'operation-a', createdAt: tick, tick,
    simulationSeed: 42, profileRevision: 3, missionScriptVersion: 1, snapshot: { tick } });
  const runtime = createMissionCheckpointRuntime({ service, captureState: () => state(), applyState: (transaction) => applied.push(transaction.tick) });
  const result = runtime.restartFromLatestCheckpoint('operation-a', { expectedProfileRevision: 3, expectedMissionScriptVersion: 1 });
  assert.equal(result.checkpoint.tick, 30);
  assert.deepEqual(applied, [30]);
});
