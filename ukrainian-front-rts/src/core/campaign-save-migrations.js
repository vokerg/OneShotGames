import {
  CAMPAIGN_SAVE_VERSION,
  deserializeCampaignSave,
  serializeCampaignSave,
} from './campaign-save-service.js';

export const RELEASED_CAMPAIGN_SAVE_VERSIONS = Object.freeze([0, CAMPAIGN_SAVE_VERSION]);

export const CAMPAIGN_SAVE_MIGRATIONS = Object.freeze({
  0(candidate) {
    const timestamp = candidate.timestamp ?? candidate.updatedAt ?? candidate.createdAt;
    return {
      version: 1,
      slotId: candidate.slotId,
      kind: candidate.kind ?? 'manual',
      label: candidate.label ?? 'Imported legacy save',
      createdAt: candidate.createdAt ?? timestamp,
      updatedAt: candidate.updatedAt ?? timestamp,
      profile: candidate.profile,
      missionState: candidate.missionState ?? null,
    };
  },
});

export function createCampaignSaveBackupKey(slotId, sourceVersion) {
  if (typeof slotId !== 'string' || !slotId) throw new TypeError('Backup slot ID must be non-empty.');
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
    throw new TypeError('Backup source version must be a non-negative integer.');
  }
  return `fields-of-resolve:campaign-save-backup:v${sourceVersion}:${encodeURIComponent(slotId)}`;
}

export function migrateSerializedCampaignSave(serialized, { expectedSlotId = null } = {}) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('Serialized campaign save must be a non-empty JSON string.');
  }
  const source = JSON.parse(serialized);
  const sourceVersion = source?.version;
  const migrated = deserializeCampaignSave(serialized, {
    expectedSlotId,
    migrations: CAMPAIGN_SAVE_MIGRATIONS,
  });
  return Object.freeze({
    sourceVersion,
    targetVersion: CAMPAIGN_SAVE_VERSION,
    changed: sourceVersion !== CAMPAIGN_SAVE_VERSION,
    backupKey: sourceVersion === CAMPAIGN_SAVE_VERSION
      ? null
      : createCampaignSaveBackupKey(migrated.slotId, sourceVersion),
    backupContents: sourceVersion === CAMPAIGN_SAVE_VERSION ? null : serialized,
    save: migrated,
    serialized: serializeCampaignSave(migrated),
  });
}
