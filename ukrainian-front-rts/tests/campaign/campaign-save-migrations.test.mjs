import assert from 'node:assert/strict';
import test from 'node:test';

import { CAMPAIGN_SAVE_VERSION } from '../../src/core/campaign-save-service.js';
import {
  CAMPAIGN_SAVE_MIGRATIONS,
  RELEASED_CAMPAIGN_SAVE_VERSIONS,
  createCampaignSaveBackupKey,
  migrateSerializedCampaignSave,
} from '../../src/core/campaign-save-migrations.js';

function profile() {
  return {
    version: 1,
    profileId: 'commander',
    difficulty: 'standard',
    revision: 0,
    unlockedOperationIds: ['donbas'],
    completedOperationIds: [],
    choices: {},
    missionResults: {},
    unlockedUpgradeIds: [],
    medalIds: [],
  };
}

test('declares a migration for every released schema before the current version', () => {
  assert.deepEqual(RELEASED_CAMPAIGN_SAVE_VERSIONS, [0, CAMPAIGN_SAVE_VERSION]);
  for (let version = 0; version < CAMPAIGN_SAVE_VERSION; version += 1) {
    assert.equal(typeof CAMPAIGN_SAVE_MIGRATIONS[version], 'function');
  }
});

test('migrates the released version-zero fixture without losing profile data', () => {
  const legacy = JSON.stringify({
    version: 0,
    slotId: 'legacy-slot',
    timestamp: 25,
    profile: profile(),
  });
  const result = migrateSerializedCampaignSave(legacy, { expectedSlotId: 'legacy-slot' });

  assert.equal(result.changed, true);
  assert.equal(result.sourceVersion, 0);
  assert.equal(result.targetVersion, CAMPAIGN_SAVE_VERSION);
  assert.equal(result.backupContents, legacy);
  assert.equal(result.backupKey, 'fields-of-resolve:campaign-save-backup:v0:legacy-slot');
  assert.deepEqual(result.save.profile, profile());
  assert.equal(result.save.createdAt, 25);
  assert.equal(result.save.updatedAt, 25);
  assert.equal(result.save.missionState, null);
});

test('leaves current saves canonical and does not request a redundant backup', () => {
  const current = JSON.stringify({
    version: CAMPAIGN_SAVE_VERSION,
    slotId: 'current',
    kind: 'manual',
    label: 'Current',
    createdAt: 10,
    updatedAt: 20,
    profile: profile(),
    missionState: null,
  });
  const result = migrateSerializedCampaignSave(current, { expectedSlotId: 'current' });

  assert.equal(result.changed, false);
  assert.equal(result.backupKey, null);
  assert.equal(result.backupContents, null);
  assert.deepEqual(JSON.parse(result.serialized), JSON.parse(current));
});

test('rejects future and malformed saves without producing replacement data', () => {
  assert.throws(
    () => migrateSerializedCampaignSave(JSON.stringify({ version: CAMPAIGN_SAVE_VERSION + 1, slotId: 'future' })),
    /Unsupported campaign save version/,
  );
  assert.throws(() => migrateSerializedCampaignSave('{'), SyntaxError);
});

test('uses deterministic encoded backup keys', () => {
  assert.equal(
    createCampaignSaveBackupKey('slot one', 0),
    'fields-of-resolve:campaign-save-backup:v0:slot%20one',
  );
  assert.throws(() => createCampaignSaveBackupKey('', 0), /non-empty/);
  assert.throws(() => createCampaignSaveBackupKey('slot', -1), /non-negative integer/);
});
