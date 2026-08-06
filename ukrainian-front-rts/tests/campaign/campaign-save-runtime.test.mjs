import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_SAVE_STATUSES,
  CAMPAIGN_SAVE_VERSION,
  createCampaignSaveBackupKey,
} from '../../src/core/campaign-save-service.js';
import {
  createCampaignSaveRuntime,
  createBrowserCampaignSaveRuntime,
} from '../../src/app/campaign-save-runtime.js';
import {
  createCampaignProfile,
  unlockCampaignOperation,
} from '../../src/core/campaign-profile.js';

function profileFor(operationId = 'donbas') {
  return unlockCampaignOperation(createCampaignProfile({ profileId: 'commander' }), operationId);
}

function createLocalStorageFixture() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()].sort()[index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

test('captures and restores campaign plus headless mission state as one transaction', () => {
  const storage = createLocalStorageFixture();
  let captured = {
    profile: profileFor(),
    missionState: {
      operationId: 'donbas',
      tick: 45,
      simulationSeed: 9001,
      snapshot: { wave: 2, resources: { fuel: 70, metal: 120 } },
    },
  };
  let restored = null;
  const runtime = createCampaignSaveRuntime({
    storage,
    now: () => 100,
    captureState: () => captured,
    restoreState: (state) => { restored = state; },
  });

  runtime.saveSlot({ slotId: 'manual-1', label: 'Crossing' });
  captured = { profile: profileFor('zaporizhzhia'), missionState: null };
  const result = runtime.loadSlot('manual-1');

  assert.equal(result.status, CAMPAIGN_SAVE_STATUSES.OK);
  assert.equal(restored.profile.profileId, 'commander');
  assert.equal(restored.missionState.operationId, 'donbas');
  assert.equal(restored.missionState.tick, 45);
  assert.deepEqual(restored.missionState.snapshot, {
    resources: { fuel: 70, metal: 120 },
    wave: 2,
  });
  assert.equal(Object.isFrozen(restored), true);
});

test('autosave and Continue restore the newest valid captured state', () => {
  const storage = createLocalStorageFixture();
  let timestamp = 10;
  let captured = { profile: profileFor(), missionState: null };
  let restored = null;
  const runtime = createCampaignSaveRuntime({
    storage,
    now: () => timestamp,
    captureState: () => captured,
    restoreState: (state) => { restored = state; },
  });

  runtime.saveSlot({ slotId: 'manual-1' });
  timestamp = 20;
  captured = {
    profile: profileFor('zaporizhzhia'),
    missionState: {
      operationId: 'zaporizhzhia',
      tick: 3,
      simulationSeed: 'seed-2',
      snapshot: { objective: 'recon' },
    },
  };
  runtime.autosave({ label: 'Operation autosave' });

  const result = runtime.continueCampaign();
  assert.equal(result.status, CAMPAIGN_SAVE_STATUSES.OK);
  assert.equal(result.slotId, 'autosave');
  assert.equal(restored.missionState.operationId, 'zaporizhzhia');
});

test('runtime applies the released save migration registry and preserves the original backup', () => {
  const storage = createLocalStorageFixture();
  const legacy = JSON.stringify({
    version: 0,
    slotId: 'legacy-runtime',
    timestamp: 30,
    profile: profileFor(),
    missionState: null,
  });
  storage.setItem('fields-of-resolve:campaign-save:legacy-runtime', legacy);
  let restored = null;
  const runtime = createCampaignSaveRuntime({
    storage,
    now: () => 100,
    captureState: () => ({ profile: profileFor(), missionState: null }),
    restoreState: (state) => { restored = state; },
  });

  const result = runtime.loadSlot('legacy-runtime');

  assert.equal(result.status, CAMPAIGN_SAVE_STATUSES.OK);
  assert.equal(result.save.version, CAMPAIGN_SAVE_VERSION);
  assert.equal(restored.profile.profileId, 'commander');
  assert.equal(storage.getItem(createCampaignSaveBackupKey('legacy-runtime', 0)), legacy);
  assert.equal(
    JSON.parse(storage.getItem('fields-of-resolve:campaign-save:legacy-runtime')).version,
    CAMPAIGN_SAVE_VERSION,
  );
});

test('missing or corrupt loads never invoke the runtime restorer', () => {
  const storage = createLocalStorageFixture();
  let restoreCalls = 0;
  const runtime = createCampaignSaveRuntime({
    storage,
    captureState: () => ({ profile: profileFor(), missionState: null }),
    restoreState: () => { restoreCalls += 1; },
  });

  assert.equal(runtime.loadSlot('missing').status, CAMPAIGN_SAVE_STATUSES.MISSING);
  storage.setItem('fields-of-resolve:campaign-save:broken', '{');
  assert.equal(runtime.loadSlot('broken').status, CAMPAIGN_SAVE_STATUSES.CORRUPT);
  assert.equal(restoreCalls, 0);
});

test('browser composition uses localStorage-compatible window target', () => {
  const localStorage = createLocalStorageFixture();
  const runtime = createBrowserCampaignSaveRuntime({
    windowTarget: { localStorage },
    now: () => 7,
    captureState: () => ({ profile: profileFor(), missionState: null }),
    restoreState: () => {},
  });

  const save = runtime.saveSlot({ slotId: 'browser-slot' });
  assert.equal(save.slotId, 'browser-slot');
  assert.equal(runtime.listSlots()[0].slotId, 'browser-slot');
});
