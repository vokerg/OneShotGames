import {
  serializeCampaignProfile,
  validateCampaignProfile,
} from './campaign-profile.js';

export const CAMPAIGN_SAVE_VERSION = 1;
export const DEFAULT_AUTOSAVE_SLOT_ID = 'autosave';
export const CAMPAIGN_SAVE_BACKUP_KEY_PREFIX = 'fields-of-resolve:campaign-save-backup:';
export const CAMPAIGN_SAVE_KINDS = Object.freeze({
  MANUAL: 'manual',
  AUTOSAVE: 'autosave',
});
export const CAMPAIGN_SAVE_STATUSES = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  CORRUPT: 'corrupt',
  UNSUPPORTED_VERSION: 'unsupported-version',
  STORAGE_ERROR: 'storage-error',
});

const SAVE_KINDS = new Set(Object.values(CAMPAIGN_SAVE_KINDS));
const SLOT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const DEFAULT_KEY_PREFIX = 'fields-of-resolve:campaign-save:';

class UnsupportedCampaignSaveVersionError extends Error {
  constructor(version) {
    super(`Unsupported campaign save version: ${version}`);
    this.name = 'UnsupportedCampaignSaveVersionError';
    this.version = version;
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function assertIdentifier(value, label, pattern = CONTENT_ID_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${label} must be a stable non-empty identifier.`);
  }
  return value;
}

function assertTimestamp(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value;
}

function assertLabel(value) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new TypeError('Campaign save label must be a string of at most 128 characters.');
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function cloneCanonicalJson(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite JSON values.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${label} must contain only JSON-compatible values.`);
  if (seen.has(value)) throw new TypeError(`${label} must not contain circular references.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item, index) => cloneCanonicalJson(item, `${label}[${index}]`, seen));
  } else {
    assertPlainObject(value, label);
    result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = cloneCanonicalJson(value[key], `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
  return result;
}

function normalizeProfile(profile) {
  return JSON.parse(serializeCampaignProfile(validateCampaignProfile(profile)));
}

function normalizeMissionState(missionState, profile) {
  if (missionState === null || missionState === undefined) return null;
  assertPlainObject(missionState, 'Campaign mission state');
  const operationId = assertIdentifier(missionState.operationId, 'Mission operation ID');
  if (!profile.unlockedOperationIds.includes(operationId)) {
    throw new Error(`Mission state operation ${operationId} must be unlocked in the campaign profile.`);
  }
  const tick = assertTimestamp(missionState.tick, 'Mission tick');
  const simulationSeed = cloneCanonicalJson(missionState.simulationSeed, 'Mission simulation seed');
  const snapshot = cloneCanonicalJson(missionState.snapshot, 'Mission snapshot');
  return deepFreeze({ operationId, tick, simulationSeed, snapshot });
}

function migrateEnvelope(candidate, migrations) {
  assertPlainObject(candidate, 'Campaign save envelope');
  if (!Number.isInteger(candidate.version) || candidate.version < 0) {
    throw new TypeError('Campaign save version must be a non-negative integer.');
  }
  if (candidate.version > CAMPAIGN_SAVE_VERSION) throw new UnsupportedCampaignSaveVersionError(candidate.version);
  let current = cloneCanonicalJson(candidate, 'Campaign save envelope');
  while (current.version < CAMPAIGN_SAVE_VERSION) {
    const migrate = migrations[current.version];
    if (typeof migrate !== 'function') throw new UnsupportedCampaignSaveVersionError(current.version);
    const migrated = migrate(deepFreeze(cloneCanonicalJson(current, 'Campaign migration input')));
    assertPlainObject(migrated, `Campaign save migration ${current.version}`);
    if (migrated.version !== current.version + 1) {
      throw new Error(`Campaign save migration ${current.version} must produce version ${current.version + 1}.`);
    }
    current = cloneCanonicalJson(migrated, `Campaign save migration ${current.version}`);
  }
  return current;
}

function normalizeEnvelope(candidate, { expectedSlotId = null, migrations = {} } = {}) {
  const migrated = migrateEnvelope(candidate, migrations);
  const slotId = assertIdentifier(migrated.slotId, 'Campaign save slot ID', SLOT_ID_PATTERN);
  if (expectedSlotId !== null && slotId !== expectedSlotId) {
    throw new Error(`Campaign save slot mismatch: expected ${expectedSlotId}, received ${slotId}.`);
  }
  if (!SAVE_KINDS.has(migrated.kind)) throw new RangeError(`Unknown campaign save kind: ${migrated.kind}`);
  const label = assertLabel(migrated.label ?? '');
  const createdAt = assertTimestamp(migrated.createdAt, 'Campaign save createdAt');
  const updatedAt = assertTimestamp(migrated.updatedAt, 'Campaign save updatedAt');
  if (updatedAt < createdAt) throw new RangeError('Campaign save updatedAt must not precede createdAt.');
  const profile = normalizeProfile(migrated.profile);
  const missionState = normalizeMissionState(migrated.missionState, profile);
  return deepFreeze({
    version: CAMPAIGN_SAVE_VERSION,
    slotId,
    kind: migrated.kind,
    label,
    createdAt,
    updatedAt,
    profile,
    missionState,
  });
}

function result(status, slotId, { save = null, error = null } = {}) {
  return Object.freeze({ status, slotId, save, error });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function slotKey(prefix, slotId) {
  return `${prefix}${encodeURIComponent(slotId)}`;
}

function slotIdFromKey(prefix, key) {
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(key.slice(prefix.length));
  } catch {
    return null;
  }
}

function parseSerializedCampaignSave(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('Serialized campaign save must be a non-empty JSON string.');
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(`Campaign save JSON is invalid: ${error.message}`);
  }
}

export function createCampaignSaveBackupKey(
  slotId,
  sourceVersion,
  keyPrefix = CAMPAIGN_SAVE_BACKUP_KEY_PREFIX,
) {
  const id = assertIdentifier(slotId, 'Campaign save backup slot ID', SLOT_ID_PATTERN);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
    throw new TypeError('Campaign save backup source version must be a non-negative integer.');
  }
  if (typeof keyPrefix !== 'string' || !keyPrefix) {
    throw new TypeError('Campaign save backup keyPrefix must be a non-empty string.');
  }
  return `${keyPrefix}v${sourceVersion}:${encodeURIComponent(id)}`;
}

export function createCampaignStorageAdapter(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function') {
    throw new TypeError('Campaign save storage requires getItem, setItem, and removeItem functions.');
  }
  let keys;
  if (typeof storage.keys === 'function') {
    keys = () => [...storage.keys()].map(String).sort();
  } else if (typeof storage.key === 'function' && Number.isInteger(storage.length) && storage.length >= 0) {
    keys = () => {
      const result = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) result.push(String(key));
      }
      return result.sort();
    };
  } else {
    throw new TypeError('Campaign save storage requires keys() or localStorage-compatible length/key access.');
  }
  return Object.freeze({
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys,
  });
}

export function createMemoryCampaignStorage(initial = {}) {
  assertPlainObject(initial, 'Initial campaign save storage');
  const values = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  return Object.freeze({
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    keys() { return [...values.keys()].sort(); },
  });
}

export function createCampaignSaveEnvelope({
  slotId,
  kind = CAMPAIGN_SAVE_KINDS.MANUAL,
  label = '',
  profile,
  missionState = null,
  createdAt,
  updatedAt = createdAt,
}) {
  return normalizeEnvelope({
    version: CAMPAIGN_SAVE_VERSION,
    slotId,
    kind,
    label,
    createdAt,
    updatedAt,
    profile,
    missionState,
  });
}

export function serializeCampaignSave(save) {
  return JSON.stringify(normalizeEnvelope(save));
}

export function deserializeCampaignSave(serialized, options = {}) {
  return normalizeEnvelope(parseSerializedCampaignSave(serialized), options);
}

export function createCampaignSaveService({
  storage,
  now,
  keyPrefix = DEFAULT_KEY_PREFIX,
  backupKeyPrefix = CAMPAIGN_SAVE_BACKUP_KEY_PREFIX,
  migrations = {},
  autosaveSlotId = DEFAULT_AUTOSAVE_SLOT_ID,
}) {
  const adapter = createCampaignStorageAdapter(storage);
  if (typeof now !== 'function') throw new TypeError('Campaign save service requires an injected now() clock.');
  if (typeof keyPrefix !== 'string' || !keyPrefix) throw new TypeError('Campaign save keyPrefix must be a non-empty string.');
  if (typeof backupKeyPrefix !== 'string' || !backupKeyPrefix) {
    throw new TypeError('Campaign save backupKeyPrefix must be a non-empty string.');
  }
  if (backupKeyPrefix === keyPrefix) {
    throw new Error('Campaign save backupKeyPrefix must differ from keyPrefix.');
  }
  assertIdentifier(autosaveSlotId, 'Autosave slot ID', SLOT_ID_PATTERN);
  assertPlainObject(migrations, 'Campaign save migrations');

  function persistMigration(id, sourceVersion, sourceSerialized, save) {
    const backupKey = createCampaignSaveBackupKey(id, sourceVersion, backupKeyPrefix);
    const existingBackup = adapter.getItem(backupKey);
    if (existingBackup !== null && existingBackup !== undefined && String(existingBackup) !== sourceSerialized) {
      throw new Error(`Campaign save migration backup conflict for slot ${id} version ${sourceVersion}.`);
    }
    if (existingBackup === null || existingBackup === undefined) {
      adapter.setItem(backupKey, sourceSerialized);
    }
    adapter.setItem(slotKey(keyPrefix, id), serializeCampaignSave(save));
  }

  function loadSlot(slotId) {
    const id = assertIdentifier(slotId, 'Campaign save slot ID', SLOT_ID_PATTERN);
    let serialized;
    try {
      serialized = adapter.getItem(slotKey(keyPrefix, id));
    } catch (error) {
      return result(CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR, id, { error: errorMessage(error) });
    }
    if (serialized === null || serialized === undefined) return result(CAMPAIGN_SAVE_STATUSES.MISSING, id);

    const sourceSerialized = String(serialized);
    let source;
    let save;
    try {
      source = parseSerializedCampaignSave(sourceSerialized);
      save = normalizeEnvelope(source, { expectedSlotId: id, migrations });
    } catch (error) {
      const status = error instanceof UnsupportedCampaignSaveVersionError
        ? CAMPAIGN_SAVE_STATUSES.UNSUPPORTED_VERSION
        : CAMPAIGN_SAVE_STATUSES.CORRUPT;
      return result(status, id, { error: errorMessage(error) });
    }

    if (source.version < CAMPAIGN_SAVE_VERSION) {
      try {
        persistMigration(id, source.version, sourceSerialized, save);
      } catch (error) {
        return result(CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR, id, {
          error: `Campaign save migration persistence failed: ${errorMessage(error)}`,
        });
      }
    }

    return result(CAMPAIGN_SAVE_STATUSES.OK, id, { save });
  }

  function saveSlot({
    slotId,
    kind = CAMPAIGN_SAVE_KINDS.MANUAL,
    label = '',
    profile,
    missionState = null,
    savedAt = now(),
  }) {
    const id = assertIdentifier(slotId, 'Campaign save slot ID', SLOT_ID_PATTERN);
    const timestamp = assertTimestamp(savedAt, 'Campaign save timestamp');
    const existing = loadSlot(id);
    if (existing.status === CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR) {
      throw new Error(`Campaign save storage read failed: ${existing.error}`);
    }
    if (existing.status === CAMPAIGN_SAVE_STATUSES.CORRUPT ||
        existing.status === CAMPAIGN_SAVE_STATUSES.UNSUPPORTED_VERSION) {
      throw new Error(
        `Refusing to overwrite campaign save slot ${id} with status ${existing.status}: ${existing.error}`,
      );
    }
    const save = createCampaignSaveEnvelope({
      slotId: id,
      kind,
      label,
      profile,
      missionState,
      createdAt: existing.status === CAMPAIGN_SAVE_STATUSES.OK ? existing.save.createdAt : timestamp,
      updatedAt: timestamp,
    });
    try {
      adapter.setItem(slotKey(keyPrefix, id), serializeCampaignSave(save));
    } catch (error) {
      throw new Error(`Campaign save storage write failed: ${errorMessage(error)}`);
    }
    return save;
  }

  function autosave(options) {
    return saveSlot({ ...options, slotId: autosaveSlotId, kind: CAMPAIGN_SAVE_KINDS.AUTOSAVE });
  }

  function deleteSlot(slotId) {
    const id = assertIdentifier(slotId, 'Campaign save slot ID', SLOT_ID_PATTERN);
    const existing = loadSlot(id);
    if (existing.status === CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR) {
      throw new Error(`Campaign save storage read failed: ${existing.error}`);
    }
    if (existing.status === CAMPAIGN_SAVE_STATUSES.MISSING) return false;
    try {
      adapter.removeItem(slotKey(keyPrefix, id));
    } catch (error) {
      throw new Error(`Campaign save storage delete failed: ${errorMessage(error)}`);
    }
    return true;
  }

  function listSlots() {
    let keys;
    try {
      keys = adapter.keys();
    } catch (error) {
      return Object.freeze([
        Object.freeze({ status: CAMPAIGN_SAVE_STATUSES.STORAGE_ERROR, slotId: null, error: errorMessage(error) }),
      ]);
    }
    const entries = [];
    for (const key of keys) {
      const slotId = slotIdFromKey(keyPrefix, key);
      if (slotId === null || !SLOT_ID_PATTERN.test(slotId)) continue;
      const loaded = loadSlot(slotId);
      if (loaded.status === CAMPAIGN_SAVE_STATUSES.OK) {
        entries.push(Object.freeze({
          status: loaded.status,
          slotId,
          kind: loaded.save.kind,
          label: loaded.save.label,
          createdAt: loaded.save.createdAt,
          updatedAt: loaded.save.updatedAt,
          profileId: loaded.save.profile.profileId,
          difficulty: loaded.save.profile.difficulty,
          operationId: loaded.save.missionState?.operationId ?? null,
          hasMissionState: loaded.save.missionState !== null,
          error: null,
        }));
      } else {
        entries.push(Object.freeze({
          status: loaded.status,
          slotId,
          kind: null,
          label: '',
          createdAt: null,
          updatedAt: null,
          profileId: null,
          difficulty: null,
          operationId: null,
          hasMissionState: false,
          error: loaded.error,
        }));
      }
    }
    entries.sort((left, right) => {
      const leftValid = left.status === CAMPAIGN_SAVE_STATUSES.OK;
      const rightValid = right.status === CAMPAIGN_SAVE_STATUSES.OK;
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (leftValid && left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
      if (leftValid && left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
      return left.slotId.localeCompare(right.slotId);
    });
    return Object.freeze(entries);
  }

  function continueCampaign() {
    const latest = listSlots().find((entry) => entry.status === CAMPAIGN_SAVE_STATUSES.OK);
    return latest ? loadSlot(latest.slotId) : result(CAMPAIGN_SAVE_STATUSES.MISSING, null);
  }

  function restoreSlot(slotId) {
    const loaded = loadSlot(slotId);
    if (loaded.status !== CAMPAIGN_SAVE_STATUSES.OK) return loaded;
    return Object.freeze({
      status: loaded.status,
      slotId: loaded.slotId,
      profile: loaded.save.profile,
      missionState: loaded.save.missionState,
      save: loaded.save,
      error: null,
    });
  }

  return Object.freeze({
    saveSlot,
    autosave,
    loadSlot,
    restoreSlot,
    listSlots,
    continueCampaign,
    deleteSlot,
  });
}
