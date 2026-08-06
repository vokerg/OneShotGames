import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_SAVE_BACKUP_KEY_PREFIX,
  CAMPAIGN_SAVE_STATUSES,
  CAMPAIGN_SAVE_VERSION,
  createCampaignSaveBackupKey,
  createCampaignSaveService,
  createMemoryCampaignStorage,
  serializeCampaignSave,
} from '../../src/core/campaign-save-service.js';
import {
  CAMPAIGN_SAVE_MIGRATIONS,
  RELEASED_CAMPAIGN_PROFILE_VERSIONS,
  RELEASED_CAMPAIGN_SAVE_VERSIONS,
  migrateSerializedCampaignSave,
} from '../../src/core/campaign-save-migrations.js';
import {
  CAMPAIGN_PROFILE_VERSION,
  validateCampaignProfile,
} from '../../src/core/campaign-profile.js';

const ACTIVE_KEY_PREFIX = 'fields-of-resolve:campaign-save:';

function profile() {
  return {
    version: CAMPAIGN_PROFILE_VERSION,
    profileId: 'commander',
    difficulty: 'standard',
    revision: 7,
    unlockedOperationIds: ['donbas'],
    completedOperationIds: ['donbas'],
    choices: { doctrine: 'mobile-defense' },
    missionResults: {
      donbas: {
        outcome: 'victory',
        score: 420,
        attempts: 2,
        completedTick: 90,
        medalIds: ['vanguard'],
      },
    },
    unlockedUpgradeIds: ['field-repair'],
    medalIds: ['vanguard'],
  };
}

function missionState() {
  return {
    operationId: 'donbas',
    tick: 125,
    simulationSeed: { campaign: 17, mission: 9 },
    snapshot: {
      objectives: { bridge: 'secured' },
      resources: { fuel: 80, metal: 140 },
      units: [{ id: 'alpha', hp: 73 }],
    },
  };
}

function legacySave(slotId = 'legacy-slot') {
  return JSON.stringify({
    version: 0,
    slotId,
    timestamp: 25,
    label: 'Legacy checkpoint',
    profile: profile(),
    missionState: missionState(),
  });
}

function replacementOptions(slotId) {
  return {
    slotId,
    profile: profile(),
    missionState: null,
    savedAt: 100,
  };
}

test('declares every released save and campaign profile schema', () => {
  assert.deepEqual(RELEASED_CAMPAIGN_SAVE_VERSIONS, [0, 1]);
  assert.deepEqual(RELEASED_CAMPAIGN_PROFILE_VERSIONS, [1]);
  assert.equal(RELEASED_CAMPAIGN_SAVE_VERSIONS.at(-1), CAMPAIGN_SAVE_VERSION);
  assert.equal(RELEASED_CAMPAIGN_PROFILE_VERSIONS.at(-1), CAMPAIGN_PROFILE_VERSION);
  for (let version = RELEASED_CAMPAIGN_SAVE_VERSIONS[0]; version < CAMPAIGN_SAVE_VERSION; version += 1) {
    assert.equal(typeof CAMPAIGN_SAVE_MIGRATIONS[version], 'function');
  }
});

test('migrates the released version-zero fixture without losing durable campaign or mission data', () => {
  const legacy = legacySave();
  const result = migrateSerializedCampaignSave(legacy, { expectedSlotId: 'legacy-slot' });

  assert.equal(result.changed, true);
  assert.equal(result.sourceVersion, 0);
  assert.equal(result.targetVersion, CAMPAIGN_SAVE_VERSION);
  assert.equal(result.backupContents, legacy);
  assert.equal(result.backupKey, createCampaignSaveBackupKey('legacy-slot', 0));
  assert.deepEqual(result.save.profile, validateCampaignProfile(profile()));
  assert.deepEqual(result.save.missionState, missionState());
  assert.equal(result.save.createdAt, 25);
  assert.equal(result.save.updatedAt, 25);
  assert.equal(result.save.label, 'Legacy checkpoint');
});

test('runtime save service backs up and rewrites a migrated slot before returning it', () => {
  const legacy = legacySave();
  const activeKey = `${ACTIVE_KEY_PREFIX}legacy-slot`;
  const storage = createMemoryCampaignStorage({ [activeKey]: legacy });
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const loaded = service.loadSlot('legacy-slot');

  assert.equal(loaded.status, CAMPAIGN_SAVE_STATUSES.OK);
  assert.deepEqual(loaded.save.profile, validateCampaignProfile(profile()));
  assert.deepEqual(loaded.save.missionState, missionState());
  assert.equal(storage.getItem(createCampaignSaveBackupKey('legacy-slot', 0)), legacy);
  assert.equal(storage.getItem(activeKey), serializeCampaignSave(loaded.save));
});

test('leaves current saves canonical and does not create a redundant backup', () => {
  const current = serializeCampaignSave({
    version: CAMPAIGN_SAVE_VERSION,
    slotId: 'current',
    kind: 'manual',
    label: 'Current',
    createdAt: 10,
    updatedAt: 20,
    profile: profile(),
    missionState: null,
  });
  const activeKey = `${ACTIVE_KEY_PREFIX}current`;
  const storage = createMemoryCampaignStorage({ [activeKey]: current });
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const loaded = service.loadSlot('current');

  assert.equal(loaded.status, CAMPAIGN_SAVE_STATUSES.OK);
  assert.equal(storage.getItem(createCampaignSaveBackupKey('current', CAMPAIGN_SAVE_VERSION)), null);
  assert.equal(storage.getItem(activeKey), current);
});

test('reports future save and profile schemas plus malformed data without destructive overwrite', () => {
  const future = JSON.stringify({ version: CAMPAIGN_SAVE_VERSION + 1, slotId: 'future' });
  const futureProfile = JSON.stringify({
    version: CAMPAIGN_SAVE_VERSION,
    slotId: 'future-profile',
    kind: 'manual',
    label: 'Future profile',
    createdAt: 10,
    updatedAt: 10,
    profile: { ...profile(), version: CAMPAIGN_PROFILE_VERSION + 1 },
    missionState: null,
  });
  const corrupt = '{';
  const futureKey = `${ACTIVE_KEY_PREFIX}future`;
  const futureProfileKey = `${ACTIVE_KEY_PREFIX}future-profile`;
  const corruptKey = `${ACTIVE_KEY_PREFIX}corrupt`;
  const storage = createMemoryCampaignStorage({
    [futureKey]: future,
    [futureProfileKey]: futureProfile,
    [corruptKey]: corrupt,
  });
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const futureResult = service.loadSlot('future');
  assert.equal(futureResult.status, CAMPAIGN_SAVE_STATUSES.UNSUPPORTED_VERSION);
  assert.equal(futureResult.error, `Unsupported campaign save version: ${CAMPAIGN_SAVE_VERSION + 1}`);
  assert.throws(
    () => service.saveSlot(replacementOptions('future')),
    /Refusing to overwrite.*unsupported-version/,
  );
  assert.equal(storage.getItem(futureKey), future);

  const futureProfileResult = service.loadSlot('future-profile');
  assert.equal(futureProfileResult.status, CAMPAIGN_SAVE_STATUSES.UNSUPPORTED_VERSION);
  assert.equal(
    futureProfileResult.error,
    `Unsupported campaign profile version: ${CAMPAIGN_PROFILE_VERSION + 1}`,
  );
  assert.throws(
    () => service.saveSlot(replacementOptions('future-profile')),
    /Refusing to overwrite.*unsupported-version/,
  );
  assert.equal(storage.getItem(futureProfileKey), futureProfile);

  const corruptResult = service.loadSlot('corrupt');
  assert.equal(corruptResult.status, CAMPAIGN_SAVE_STATUSES.CORRUPT);
  assert.match(corruptResult.error, /Campaign save JSON is invalid/);
  assert.throws(
    () => service.saveSlot(replacementOptions('corrupt')),
    /Refusing to overwrite.*corrupt/,
  );
  assert.equal(storage.getItem(corruptKey), corrupt);
});

test('does not rewrite the active slot when migration backup persistence fails', () => {
  const legacy = legacySave('backup-failure');
  const activeKey = `${ACTIVE_KEY_PREFIX}backup-failure`;
  const values = new Map([[activeKey, legacy]]);
  const storage = {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) {
      if (String(key).startsWith(CAMPAIGN_SAVE_BACKUP_KEY_PREFIX)) throw new Error('quota exceeded');
      values.set(String(key), String(value));
    },
    removeItem(key) { values.delete(String(key)); },
    keys() { return [...values.keys()]; },
  };
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const loaded = service.loadSlot('backup-failure');

  assert.equal(loaded.status, CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR);
  assert.match(loaded.error, /migration persistence failed.*quota exceeded/);
  assert.equal(storage.getItem(activeKey), legacy);
});

test('does not overwrite a different existing migration backup', () => {
  const legacy = legacySave('backup-conflict');
  const activeKey = `${ACTIVE_KEY_PREFIX}backup-conflict`;
  const backupKey = createCampaignSaveBackupKey('backup-conflict', 0);
  const storage = createMemoryCampaignStorage({
    [activeKey]: legacy,
    [backupKey]: 'different legacy contents',
  });
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const loaded = service.loadSlot('backup-conflict');

  assert.equal(loaded.status, CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR);
  assert.match(loaded.error, /backup conflict/);
  assert.equal(storage.getItem(activeKey), legacy);
  assert.equal(storage.getItem(backupKey), 'different legacy contents');
});

test('rejects custom storage prefixes that collide for a migration source', () => {
  const legacy = legacySave('collision');
  const keyPrefix = 'custom:v0:';
  const backupKeyPrefix = 'custom:';
  const activeKey = `${keyPrefix}collision`;
  const storage = createMemoryCampaignStorage({ [activeKey]: legacy });
  const service = createCampaignSaveService({
    storage,
    now: () => 100,
    keyPrefix,
    backupKeyPrefix,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });

  const loaded = service.loadSlot('collision');

  assert.equal(loaded.status, CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR);
  assert.match(loaded.error, /backup key collides with active slot/);
  assert.equal(storage.getItem(activeKey), legacy);
  assert.deepEqual(storage.keys(), [activeKey]);
});

test('rejects future and malformed serialized migration inputs without replacement data', () => {
  assert.throws(
    () => migrateSerializedCampaignSave(JSON.stringify({ version: CAMPAIGN_SAVE_VERSION + 1, slotId: 'future' })),
    /Unsupported campaign save version/,
  );
  assert.throws(() => migrateSerializedCampaignSave('{'), SyntaxError);
});

test('uses deterministic backup keys and validates their inputs', () => {
  assert.equal(
    createCampaignSaveBackupKey('slot.one', 0),
    'fields-of-resolve:campaign-save-backup:v0:slot.one',
  );
  assert.throws(() => createCampaignSaveBackupKey('', 0), /stable non-empty identifier/);
  assert.throws(() => createCampaignSaveBackupKey('slot', -1), /non-negative integer/);
});
