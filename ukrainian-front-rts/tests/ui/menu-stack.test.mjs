import assert from 'node:assert/strict';
import test from 'node:test';

import { createCampaignSaveRuntime } from '../../src/app/campaign-save-runtime.js';
import { createCampaignProfile } from '../../src/core/campaign-profile.js';
import { createMemoryCampaignStorage } from '../../src/core/campaign-save-service.js';
import {
  createMenuModel,
  createMenuState,
  createRuntimePauseController,
  MENU_CONFIRMATIONS,
  MENU_VIEWS,
} from '../../src/ui/menu-stack-model.js';

test('menu state navigates, confirms, reports status, and closes deterministically', () => {
  const menu = createMenuState();
  assert.equal(menu.snapshot().open, false);
  menu.open();
  menu.navigate(MENU_VIEWS.SAVES);
  menu.setStatus('Saved.', 'success');
  assert.deepEqual(menu.snapshot().status, { tone: 'success', message: 'Saved.' });

  menu.confirm({
    kind: MENU_CONFIRMATIONS.LOAD,
    slotId: 'manual-1',
    title: 'Load?',
    message: 'Discard current progress?',
  });
  assert.equal(menu.snapshot().view, MENU_VIEWS.CONFIRM);
  assert.equal(menu.snapshot().confirmation.slotId, 'manual-1');
  menu.cancelConfirmation();
  assert.equal(menu.snapshot().view, MENU_VIEWS.MAIN);
  assert.equal(menu.snapshot().confirmation, null);

  menu.close();
  assert.deepEqual(menu.snapshot(), {
    open: false,
    view: MENU_VIEWS.MAIN,
    confirmation: null,
    status: null,
  });
});

test('pause controller delegates to runtime and restores the initial pause state', () => {
  let paused = false;
  const calls = [];
  const runtime = {
    pause() { calls.push('pause'); paused = true; },
    resume() { calls.push('resume'); paused = false; },
    isPaused() { return paused; },
  };
  const pause = createRuntimePauseController(runtime);

  assert.equal(pause.pause(), true);
  assert.equal(pause.isPaused(), true);
  assert.equal(pause.resume(), false);
  assert.equal(pause.isPaused(), false);
  assert.deepEqual(calls, ['pause', 'resume']);

  pause.pause();
  assert.equal(pause.dispose(), true);
  assert.equal(paused, false, 'dispose restores the initial running state');
  assert.equal(pause.dispose(), false);
});

test('menu model normalizes save slots and exposes availability boundaries', () => {
  const state = createMenuState({ open: true, view: MENU_VIEWS.SAVES }).snapshot();
  const model = createMenuModel({
    state,
    missionActive: true,
    storageAvailable: true,
    slots: [{
      slotId: 'manual-1',
      label: 'Campaign',
      status: 'ok',
      updatedAt: 42,
      hasMissionState: false,
    }],
  });
  assert.equal(model.missionActive, true);
  assert.equal(model.storageAvailable, true);
  assert.deepEqual(model.slots[0], {
    slotId: 'manual-1',
    label: 'Campaign',
    status: 'ok',
    updatedAt: 42,
    hasMissionState: false,
    error: null,
  });
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.slots));
});

test('menu save adapter round-trips a validated campaign profile without private mission state', () => {
  const storage = createMemoryCampaignStorage();
  let profile = createCampaignProfile({
    profileId: 'menu-test',
    initialOperationIds: ['donbas'],
  });
  const runtime = createCampaignSaveRuntime({
    storage,
    now: () => 100,
    captureState: () => ({ profile, missionState: null }),
    restoreState: ({ profile: restored }) => { profile = restored; },
  });

  const saved = runtime.saveSlot({ slotId: 'manual-1', label: 'Menu test' });
  assert.equal(saved.profile.profileId, 'menu-test');
  assert.equal(saved.missionState, null);
  assert.equal(runtime.listSlots()[0].hasMissionState, false);

  profile = createCampaignProfile({ profileId: 'other', initialOperationIds: ['donbas'] });
  const loaded = runtime.loadSlot('manual-1');
  assert.equal(loaded.status, 'ok');
  assert.equal(profile.profileId, 'menu-test');
});
