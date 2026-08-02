import assert from 'node:assert/strict';
import test from 'node:test';

import { createCampaignSaveRuntime } from '../../src/app/campaign-save-runtime.js';
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

test('campaign restore migrates legacy command-character IDs throughout mission snapshots', () => {
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
          selectedUnitId: 'uaZelenskyy',
          units: [
            { id: 1, type: 'uaZaluzhnyi' },
            { id: 2, type: 'ruPutin', targetType: 'ruPrigozhin' },
          ],
        },
      },
    }),
    restoreState: (state) => { restored = state; },
  });

  runtime.saveSlot({ slotId: 'legacy-commanders' });
  const result = runtime.loadSlot('legacy-commanders');

  assert.deepEqual(result.missionState.snapshot, {
    selectedUnitId: 'uaCommandVarta',
    units: [
      { id: 1, type: 'uaCommandSapsan' },
      { id: 2, targetType: 'ruCommandGranit', type: 'ruCommandBastion' },
    ],
  });
  assert.deepEqual(restored.missionState, result.missionState);
  assert.equal(Object.isFrozen(restored.missionState), true);
  assert.equal(Object.isFrozen(restored.missionState.snapshot.units[0]), true);
});
