import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSION_CHECKPOINT_POLICIES,
  MISSION_CHECKPOINT_STATUSES,
  checkpointFromMissionState,
  checkpointToMissionState,
  createMissionCheckpointEnvelope,
  createMissionCheckpointService,
  deserializeMissionCheckpoint,
  serializeMissionCheckpoint,
} from '../../src/core/mission-checkpoint-service.js';

const checkpoint = (overrides = {}) => createMissionCheckpointEnvelope({
  checkpointId: 'checkpoint:operation-a:10', operationId: 'operation-a', label: 'Crossing secured',
  createdAt: 1000, tick: 10, simulationSeed: { mission: 42 }, profileRevision: 3,
  missionScriptVersion: 1, snapshot: { triggers: { bridge: 'fired' }, units: [{ id: 7, hp: 90 }] }, ...overrides,
});

test('checkpoint envelope is canonical, immutable, and serializable', () => {
  const value = checkpoint();
  assert.ok(Object.isFrozen(value.snapshot.units));
  assert.deepEqual(deserializeMissionCheckpoint(serializeMissionCheckpoint(value)), value);
});

test('checkpoint mission-state adapter round trips through UFR-085 shape', () => {
  const value = checkpoint();
  const missionState = checkpointToMissionState(value);
  assert.deepEqual(Object.keys(missionState).sort(), ['operationId', 'simulationSeed', 'snapshot', 'tick']);
  assert.deepEqual(checkpointFromMissionState(missionState), value);
});

test('disabled missions reject capture without mutation', () => {
  const service = createMissionCheckpointService({ policyForOperation: () => MISSION_CHECKPOINT_POLICIES.DISABLED });
  assert.equal(service.capture(checkpoint()).status, MISSION_CHECKPOINT_STATUSES.DISABLED);
  assert.deepEqual(service.list('operation-a'), []);
});

test('bounded storage evicts oldest checkpoint deterministically', () => {
  const service = createMissionCheckpointService({ maxCheckpointsPerOperation: 2 });
  service.capture(checkpoint({ checkpointId: 'checkpoint:a:10', tick: 10, createdAt: 100 }));
  service.capture(checkpoint({ checkpointId: 'checkpoint:a:20', tick: 20, createdAt: 200 }));
  const third = service.capture(checkpoint({ checkpointId: 'checkpoint:a:30', tick: 30, createdAt: 300 }));
  assert.deepEqual(third.evictedCheckpointIds, ['checkpoint:a:10']);
  assert.deepEqual(service.list('operation-a').map((entry) => entry.checkpointId), ['checkpoint:a:30', 'checkpoint:a:20']);
});

test('latest checkpoint is scoped by operation', () => {
  const service = createMissionCheckpointService();
  service.capture(checkpoint({ checkpointId: 'checkpoint:a:5', tick: 5 }));
  service.capture(checkpoint({ checkpointId: 'checkpoint:b:9', operationId: 'operation-b', tick: 9 }));
  assert.equal(service.latest('operation-a').checkpoint.checkpointId, 'checkpoint:a:5');
  assert.equal(service.latest('operation-c').status, MISSION_CHECKPOINT_STATUSES.MISSING);
});

test('restore reports operation, profile, and script compatibility mismatches', () => {
  const service = createMissionCheckpointService({ initialCheckpoints: [checkpoint()] });
  assert.equal(service.restore('checkpoint:operation-a:10', { expectedOperationId: 'operation-a', expectedProfileRevision: 3, expectedMissionScriptVersion: 1 }).status, MISSION_CHECKPOINT_STATUSES.OK);
  const incompatible = service.restore('checkpoint:operation-a:10', { expectedOperationId: 'operation-b', expectedProfileRevision: 4, expectedMissionScriptVersion: 2 });
  assert.equal(incompatible.status, MISSION_CHECKPOINT_STATUSES.INCOMPATIBLE);
  assert.equal(incompatible.reason, 'operation,profile-revision,mission-script-version');
});

test('remove and clearOperation return stable results', () => {
  const service = createMissionCheckpointService({ initialCheckpoints: [checkpoint(), checkpoint({ checkpointId: 'checkpoint:a:20', tick: 20 })] });
  assert.equal(service.remove('checkpoint:operation-a:10'), true);
  assert.deepEqual(service.clearOperation('operation-a'), ['checkpoint:a:20']);
  assert.equal(service.remove('checkpoint:missing'), false);
});

test('malformed, duplicate, and unsupported checkpoint data fails clearly', () => {
  assert.throws(() => deserializeMissionCheckpoint('{bad'), /JSON is invalid/);
  assert.throws(() => createMissionCheckpointEnvelope({ ...checkpoint(), version: 2, checkpointId: '' }), /Checkpoint ID/);
  const service = createMissionCheckpointService({ initialCheckpoints: [checkpoint()] });
  assert.throws(() => service.capture(checkpoint()), /already exists/);
});
