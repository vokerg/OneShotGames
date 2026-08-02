import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_RUNTIME_SAVE_STATUSES,
  createCampaignSaveRuntime,
} from '../../src/app/campaign-save-runtime.js';
import {
  createCampaignProfile,
  unlockCampaignOperation,
} from '../../src/core/campaign-profile.js';

function storageFixture() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()].sort()[index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function profile() {
  return unlockCampaignOperation(
    createCampaignProfile({ profileId: 'legacy-content-test' }),
    'donbas',
  );
}

test('campaign restore migrates legacy command-character unit types throughout mission snapshots', () => {
  const storage = storageFixture();
  let restored = null;
  const runtime = createCampaignSaveRuntime({
    storage,
    now: () => 100,
    captureState: () => ({
      profile: profile(),
      missionState: {
        operationId: 'donbas',
        tick: 12,
        simulationSeed: 91,
        snapshot: {
          heroes: ['uaZelenskyy', 'uaZaluzhnyi'],
          units: [
            { id: 1, type: 'uaZaluzhnyi' },
            { id: 2, type: 'ruPutin' },
            { id: 3, type: 'ruPrigozhin' },
          ],
        },
      },
    }),
    restoreState: (state) => { restored = state; },
  });

  runtime.saveSlot({ slotId: 'legacy-commanders' });
  const result = runtime.loadSlot('legacy-commanders');

  assert.equal(result.status, 'ok');
  assert.equal(result.contentMigrationStatus, 'migrated');
  assert.deepEqual(result.missionState.snapshot, {
    heroes: ['uaCommandVarta'],
    units: [
      { id: 1, type: 'uaCommandVarta' },
      { id: 2, type: 'ruCommandBastion' },
      { id: 3, type: 'ruCommandBastion' },
    ],
  });
  assert.deepEqual(restored.missionState, result.missionState);
  assert.equal(Object.isFrozen(restored.missionState), true);
  assert.equal(Object.isFrozen(restored.missionState.snapshot.units[0]), true);
});

test('campaign restore rejects unsupported runtime unit types without mutating live state', () => {
  const storage = storageFixture();
  let restoreCalls = 0;
  const runtime = createCampaignSaveRuntime({
    storage,
    captureState: () => ({
      profile: profile(),
      missionState: {
        operationId: 'donbas', tick: 0, simulationSeed: 1,
        snapshot: { units: [{ id: 1, type: 'removedPrototypeUnit' }] },
      },
    }),
    restoreState: () => { restoreCalls += 1; },
  });

  runtime.saveSlot({ slotId: 'unsupported-content' });
  const result = runtime.loadSlot('unsupported-content');

  assert.equal(result.status, CAMPAIGN_RUNTIME_SAVE_STATUSES.UNSUPPORTED_CONTENT);
  assert.match(result.error, /Unsupported runtime unit ID/);
  assert.equal(result.save, null);
  assert.equal(restoreCalls, 0);
});
