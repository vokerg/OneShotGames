import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_SAVE_KINDS,
  CAMPAIGN_SAVE_STATUSES,
  CAMPAIGN_SAVE_VERSION,
  createCampaignSaveEnvelope,
  createCampaignSaveService,
  createMemoryCampaignStorage,
  deserializeCampaignSave,
  serializeCampaignSave,
} from '../../src/core/campaign-save-service.js';

function profile(overrides = {}) {
  return {
    version: 1,
    profileId: 'commander',
    difficulty: 'standard',
    revision: 0,
    unlockedOperationIds: ['donbas', 'kherson'],
    completedOperationIds: [],
    choices: {},
    missionResults: {},
    unlockedUpgradeIds: [],
    medalIds: [],
    ...overrides,
  };
}

function mission(operationId = 'donbas') {
  return {
    operationId,
    tick: 120,
    simulationSeed: 'mission-seed',
    snapshot: { units: [{ id: 2, hp: 50 }, { id: 1, hp: 75 }], resources: { metal: 200 } },
  };
}

test('creates a frozen canonical save envelope and round trips it', () => {
  const save = createCampaignSaveEnvelope({
    slotId: 'manual-1',
    label: 'Crossing',
    profile: profile(),
    missionState: mission(),
    createdAt: 10,
  });

  assert.equal(save.version, CAMPAIGN_SAVE_VERSION);
  assert.equal(Object.isFrozen(save), true);
  assert.equal(Object.isFrozen(save.missionState.snapshot), true);
  assert.deepEqual(deserializeCampaignSave(serializeCampaignSave(save)), save);
});

test('saves, loads, and restores deterministic campaign and mission state', () => {
  const storage = createMemoryCampaignStorage();
  const service = createCampaignSaveService({ storage, now: () => 100 });
  const saved = service.saveSlot({ slotId: 'slot-a', label: 'Front', profile: profile(), missionState: mission() });

  assert.equal(saved.createdAt, 100);
  assert.equal(service.loadSlot('slot-a').status, CAMPAIGN_SAVE_STATUSES.OK);
  const restored = service.restoreSlot('slot-a');
  assert.deepEqual(restored.profile, saved.profile);
  assert.deepEqual(restored.missionState, saved.missionState);
});

test('preserves creation time on overwrite and replaces the fixed autosave slot', () => {
  const storage = createMemoryCampaignStorage();
  let time = 10;
  const service = createCampaignSaveService({ storage, now: () => time });

  service.saveSlot({ slotId: 'manual', profile: profile() });
  time = 20;
  const overwritten = service.saveSlot({ slotId: 'manual', label: 'Updated', profile: profile({ revision: 1 }) });
  assert.equal(overwritten.createdAt, 10);
  assert.equal(overwritten.updatedAt, 20);

  time = 30;
  service.autosave({ profile: profile(), missionState: mission() });
  time = 40;
  const autosave = service.autosave({ profile: profile({ revision: 2 }), missionState: null });
  assert.equal(autosave.slotId, 'autosave');
  assert.equal(autosave.kind, CAMPAIGN_SAVE_KINDS.AUTOSAVE);
  assert.equal(autosave.createdAt, 30);
  assert.equal(autosave.updatedAt, 40);
  assert.equal(service.listSlots().filter((entry) => entry.slotId === 'autosave').length, 1);
});

test('lists slots newest first and continue chooses the latest valid save deterministically', () => {
  const storage = createMemoryCampaignStorage();
  const service = createCampaignSaveService({ storage, now: () => 0 });
  service.saveSlot({ slotId: 'b-slot', savedAt: 50, profile: profile() });
  service.saveSlot({ slotId: 'a-slot', savedAt: 50, profile: profile({ revision: 1 }) });
  service.saveSlot({ slotId: 'latest', savedAt: 70, profile: profile({ revision: 2 }) });

  assert.deepEqual(service.listSlots().map((entry) => entry.slotId), ['latest', 'a-slot', 'b-slot']);
  assert.equal(service.continueCampaign().slotId, 'latest');
});

test('reports missing, corrupt, and unsupported saves without throwing', () => {
  const prefix = 'fields-of-resolve:campaign-save:';
  const storage = createMemoryCampaignStorage({
    [`${prefix}broken`]: '{',
    [`${prefix}future`]: JSON.stringify({ version: 99, slotId: 'future' }),
  });
  const service = createCampaignSaveService({ storage, now: () => 0 });

  assert.equal(service.loadSlot('missing').status, CAMPAIGN_SAVE_STATUSES.MISSING);
  assert.equal(service.loadSlot('broken').status, CAMPAIGN_SAVE_STATUSES.CORRUPT);
  assert.equal(service.loadSlot('future').status, CAMPAIGN_SAVE_STATUSES.UNSUPPORTED_VERSION);
  assert.equal(service.continueCampaign().status, CAMPAIGN_SAVE_STATUSES.MISSING);
});

test('applies explicit sequential migrations before validation', () => {
  const oldSave = JSON.stringify({
    version: 0,
    slotId: 'legacy',
    profile: profile(),
    timestamp: 15,
  });
  const migrated = deserializeCampaignSave(oldSave, {
    expectedSlotId: 'legacy',
    migrations: {
      0: (candidate) => ({
        version: 1,
        slotId: candidate.slotId,
        kind: 'manual',
        label: 'Imported',
        createdAt: candidate.timestamp,
        updatedAt: candidate.timestamp,
        profile: candidate.profile,
        missionState: null,
      }),
    },
  });

  assert.equal(migrated.version, 1);
  assert.equal(migrated.label, 'Imported');
});

test('deletes slots idempotently', () => {
  const storage = createMemoryCampaignStorage();
  const service = createCampaignSaveService({ storage, now: () => 1 });
  service.saveSlot({ slotId: 'delete-me', profile: profile() });

  assert.equal(service.deleteSlot('delete-me'), true);
  assert.equal(service.deleteSlot('delete-me'), false);
  assert.equal(service.loadSlot('delete-me').status, CAMPAIGN_SAVE_STATUSES.MISSING);
});

test('rejects locked mission state and non-JSON snapshots', () => {
  assert.throws(
    () => createCampaignSaveEnvelope({
      slotId: 'locked', profile: profile(), missionState: mission('zaporizhzhia'), createdAt: 1,
    }),
    /must be unlocked/,
  );
  assert.throws(
    () => createCampaignSaveEnvelope({
      slotId: 'invalid', profile: profile(), missionState: { ...mission(), snapshot: { callback() {} } }, createdAt: 1,
    }),
    /JSON-compatible/,
  );
});
