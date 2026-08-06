import { CAMPAIGN_PROFILE_VERSION } from './campaign-profile.js';
import {
  CAMPAIGN_SAVE_VERSION,
  createCampaignSaveBackupKey,
  deserializeCampaignSave,
  serializeCampaignSave,
} from './campaign-save-service.js';

export const RELEASED_CAMPAIGN_PROFILE_VERSIONS = Object.freeze([1]);
export const RELEASED_CAMPAIGN_SAVE_VERSIONS = Object.freeze([0, 1]);

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

if (RELEASED_CAMPAIGN_PROFILE_VERSIONS.at(-1) !== CAMPAIGN_PROFILE_VERSION) {
  throw new Error('Released campaign profile registry must end at the current profile version.');
}
if (RELEASED_CAMPAIGN_SAVE_VERSIONS.at(-1) !== CAMPAIGN_SAVE_VERSION) {
  throw new Error('Released campaign save registry must end at the current save version.');
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
