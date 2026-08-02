import {
  CAMPAIGN_SAVE_STATUSES,
  createCampaignSaveService,
} from '../core/campaign-save-service.js';
import { migrateRuntimeContentReferences } from '../content/runtime-content-reconciliation.js';

export const CAMPAIGN_RUNTIME_SAVE_STATUSES = Object.freeze({
  UNSUPPORTED_CONTENT: 'unsupported-content',
});

function requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function.`);
  return value;
}

function assertCapturedState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Campaign save captureState() must return an object.');
  }
  if (!state.profile) throw new TypeError('Campaign save captureState() must provide a campaign profile.');
  return state;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeRestoration(result) {
  if (result.status !== CAMPAIGN_SAVE_STATUSES.OK) {
    return Object.freeze({ result, restoration: null });
  }
  const save = result.save;
  if (!save) throw new Error('Successful campaign save result must include a save envelope.');
  const migration = save.missionState === null
    ? Object.freeze({ status: 'current', value: null, errors: [] })
    : migrateRuntimeContentReferences(save.missionState);
  if (migration.status === 'unsupported') {
    return Object.freeze({
      result: Object.freeze({
        ...result,
        status: CAMPAIGN_RUNTIME_SAVE_STATUSES.UNSUPPORTED_CONTENT,
        save: null,
        profile: null,
        missionState: null,
        error: `Campaign save contains unsupported runtime content: ${migration.errors.join('; ')}`,
      }),
      restoration: null,
    });
  }
  const missionState = migration.value === null ? null : deepFreeze(migration.value);
  const migratedSave = Object.freeze({ ...save, missionState });
  return Object.freeze({
    result,
    restoration: Object.freeze({
      slotId: result.slotId,
      profile: migratedSave.profile,
      missionState,
      save: migratedSave,
      contentMigrationStatus: migration.status,
    }),
  });
}

export function createCampaignSaveRuntime({
  storage,
  now = () => Date.now(),
  captureState,
  restoreState,
  saveServiceOptions = {},
}) {
  const capture = requiredFunction(captureState, 'Campaign save captureState');
  const restore = requiredFunction(restoreState, 'Campaign save restoreState');
  if (!saveServiceOptions || typeof saveServiceOptions !== 'object' || Array.isArray(saveServiceOptions)) {
    throw new TypeError('Campaign save service options must be an object.');
  }

  const service = createCampaignSaveService({ storage, now, ...saveServiceOptions });

  function capturedSaveOptions(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Campaign save options must be an object.');
    }
    const state = assertCapturedState(capture());
    return {
      ...options,
      profile: state.profile,
      missionState: state.missionState ?? null,
    };
  }

  function applyResult(result) {
    const normalized = normalizeRestoration(result);
    if (!normalized.restoration) return normalized.result;
    restore(normalized.restoration);
    return Object.freeze({
      ...result,
      save: normalized.restoration.save,
      profile: normalized.restoration.profile,
      missionState: normalized.restoration.missionState,
      contentMigrationStatus: normalized.restoration.contentMigrationStatus,
    });
  }

  return Object.freeze({
    saveSlot(options) {
      return service.saveSlot(capturedSaveOptions(options));
    },
    autosave(options = {}) {
      return service.autosave(capturedSaveOptions(options));
    },
    loadSlot(slotId) {
      return applyResult(service.restoreSlot(slotId));
    },
    continueCampaign() {
      return applyResult(service.continueCampaign());
    },
    listSlots: service.listSlots,
    deleteSlot: service.deleteSlot,
  });
}

export function createBrowserCampaignSaveRuntime({
  windowTarget = globalThis,
  now = () => Date.now(),
  ...options
}) {
  const storage = windowTarget?.localStorage;
  if (!storage) throw new Error('Browser campaign saves require window.localStorage.');
  return createCampaignSaveRuntime({ ...options, storage, now });
}
