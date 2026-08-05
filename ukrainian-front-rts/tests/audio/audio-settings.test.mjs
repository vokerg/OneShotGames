import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  createAudioSettingsController,
  createBackgroundAudioController,
  effectiveAudioLevels,
  normalizeAudioSettings,
  voiceAccessibilityPreferences,
} from '../../src/audio/audio-settings.js';

class FakeMixer {
  constructor() {
    this.calls = [];
    this.state = { status: 'running' };
    this.pauses = 0;
    this.resumes = 0;
  }
  setMasterVolume(value) { this.calls.push(['master-volume', value]); return value; }
  setMasterMuted(value) { this.calls.push(['master-muted', value]); return value; }
  setBusVolume(bus, value) { this.calls.push(['bus-volume', bus, value]); return value; }
  setBusMuted(bus, value) { this.calls.push(['bus-muted', bus, value]); return value; }
  snapshot() { return { ...this.state }; }
  async pause() { this.pauses += 1; this.state.status = 'paused'; return true; }
  async resume() { this.resumes += 1; this.state.status = 'running'; return true; }
}

class FakeStorage {
  constructor(value = null, { failRead = false, failWrite = false } = {}) {
    this.value = value;
    this.failRead = failRead;
    this.failWrite = failWrite;
    this.writes = [];
  }
  getItem(key) {
    if (this.failRead) throw new Error('blocked read');
    assert.equal(key, AUDIO_SETTINGS_STORAGE_KEY);
    return this.value;
  }
  setItem(key, value) {
    if (this.failWrite) throw new Error('blocked write');
    this.writes.push([key, value]);
    this.value = value;
  }
}

class VisibilityTarget extends EventTarget {
  hidden = false;
  dispatch() { this.dispatchEvent(new Event('visibilitychange')); }
}

test('normalization migrates legacy settings, clamps levels, and enforces subtitle label dependency', () => {
  const settings = normalizeAudioSettings({
    masterVolume: 2,
    volumes: { music: -1, voice: 0.35 },
    mute: true,
    muted: { sfx: true },
    dynamicRange: 'night',
    backgroundTabBehavior: 'mute',
    subtitles: false,
    speakerLabels: true,
    visualAlerts: false,
  });
  assert.equal(settings.levels.master, 1);
  assert.equal(settings.levels.music, 0);
  assert.equal(settings.levels.voice, 0.35);
  assert.equal(settings.muted.master, true);
  assert.equal(settings.muted.sfx, true);
  assert.equal(settings.dynamicRangeMode, 'night');
  assert.equal(settings.backgroundPolicy, 'mute');
  assert.equal(settings.subtitles, false);
  assert.equal(settings.speakerLabels, true);
  assert.equal(settings.visualCues, false);
  assert.ok(Object.isFrozen(settings.levels));
});

test('dynamic range modes produce deterministic effective gains without mutating requested levels', () => {
  const settings = normalizeAudioSettings({ levels: { master: 0.8, music: 1, sfx: 1, voice: 0.5, ambience: 1 }, dynamicRangeMode: 'night' });
  assert.deepEqual(effectiveAudioLevels(settings), {
    master: 0.576,
    music: 0.58,
    sfx: 0.48,
    voice: 0.5,
    ambience: 0.62,
  });
  assert.equal(settings.levels.master, 0.8);
});

test('controller loads, applies, persists, publishes, and resets complete mixer state', () => {
  const stored = JSON.stringify({
    levels: { master: 0.7, music: 0.6, sfx: 0.5, voice: 0.4, ambience: 0.3 },
    muted: { master: false, music: true, sfx: false, voice: false, ambience: true },
    dynamicRangeMode: 'reduced',
    backgroundPolicy: 'continue',
    subtitles: true,
    speakerLabels: false,
    visualCues: true,
  });
  const mixer = new FakeMixer();
  const storage = new FakeStorage(stored);
  const controller = createAudioSettingsController({ mixer, storage });
  const first = controller.snapshot();
  assert.equal(first.persistence.status, 'loaded');
  assert.equal(first.settings.muted.music, true);
  assert.equal(first.effectiveLevels.master, 0.644);
  assert.equal(mixer.calls.length, 10);

  const observed = [];
  const unsubscribe = controller.subscribe((snapshot) => observed.push(snapshot.settings.levels.music));
  const updated = controller.update({ levels: { music: 0.25 }, muted: { music: false } });
  assert.equal(updated.settings.levels.music, 0.25);
  assert.equal(updated.settings.muted.music, false);
  assert.equal(storage.writes.length, 1);
  assert.deepEqual(observed, [0.25]);
  unsubscribe();

  const reset = controller.reset();
  assert.deepEqual(reset.settings, DEFAULT_AUDIO_SETTINGS);
  assert.equal(storage.writes.length, 2);
  assert.equal(controller.dispose(), true);
  assert.equal(controller.dispose(), false);
  assert.throws(() => controller.update({ levels: { music: 1 } }), /disposed/);
});

test('failed initial observer emission removes the observer before later settings updates', () => {
  const controller = createAudioSettingsController({ mixer: new FakeMixer() });
  let calls = 0;
  assert.throws(() => controller.subscribe(() => {
    calls += 1;
    throw new Error('initial render failed');
  }, { emitCurrent: true }), /initial render failed/);
  controller.update({ subtitles: false });
  assert.equal(calls, 1);
  controller.dispose();
});

test('storage failures remain observable without blocking active settings', () => {
  const mixer = new FakeMixer();
  const controller = createAudioSettingsController({ mixer, storage: new FakeStorage(null, { failRead: true, failWrite: true }) });
  assert.equal(controller.snapshot().persistence.status, 'read-failed');
  const next = controller.update({ subtitles: false });
  assert.equal(next.settings.subtitles, false);
  assert.equal(next.persistence.status, 'write-failed');
  assert.match(next.persistence.error, /blocked write/);
});

test('voice accessibility preferences preserve subtitles independently of voice mute', () => {
  assert.deepEqual(voiceAccessibilityPreferences({ muted: { voice: true }, subtitles: true, speakerLabels: true }), {
    voiceEnabled: false,
    subtitles: true,
    speakerLabels: true,
  });
  assert.deepEqual(voiceAccessibilityPreferences({ muted: { voice: false }, subtitles: false, speakerLabels: true }), {
    voiceEnabled: true,
    subtitles: false,
    speakerLabels: false,
  });
});

test('background controller pauses, mutes, restores exact configured mute, and disposes listeners', async () => {
  const mixer = new FakeMixer();
  const target = new VisibilityTarget();
  const controller = createBackgroundAudioController({ mixer, visibilityTarget: target });
  controller.configure({ backgroundPolicy: 'pause', masterMuted: false });
  target.hidden = true;
  target.dispatch();
  await Promise.resolve();
  assert.equal(mixer.pauses, 1);
  assert.equal(controller.snapshot().action, 'paused');

  target.hidden = false;
  target.dispatch();
  await Promise.resolve();
  assert.equal(mixer.resumes, 1);
  assert.equal(controller.snapshot().action, null);

  controller.configure({ backgroundPolicy: 'mute', masterMuted: true });
  target.hidden = true;
  target.dispatch();
  assert.deepEqual(mixer.calls.at(-1), ['master-muted', true]);
  target.hidden = false;
  target.dispatch();
  assert.deepEqual(mixer.calls.at(-1), ['master-muted', true]);

  const callsBeforeDispose = mixer.calls.length;
  assert.equal(controller.dispose(), true);
  target.hidden = true;
  target.dispatch();
  assert.equal(mixer.calls.length, callsBeforeDispose);
});

test('failed mixer application rolls back previous effective state without persisting or publishing', () => {
  class FailingMixer extends FakeMixer {
    constructor() { super(); this.failVoice = false; }
    setBusVolume(bus, value) {
      this.calls.push(['bus-volume', bus, value]);
      if (bus === 'voice' && this.failVoice) { this.failVoice = false; throw new Error('voice gain unavailable'); }
      return value;
    }
  }
  const mixer = new FailingMixer();
  const storage = new FakeStorage();
  const controller = createAudioSettingsController({ mixer, storage });
  const before = controller.snapshot();
  const observed = [];
  controller.subscribe((state) => observed.push(state));
  mixer.failVoice = true;
  assert.throws(() => controller.update({ levels: { music: 0.25 } }), /voice gain unavailable/);
  assert.deepEqual(controller.snapshot().settings, before.settings);
  assert.equal(storage.writes.length, 0);
  assert.equal(observed.length, 0);
  assert.ok(mixer.calls.length > 10, 'rollback should reapply the prior complete mixer state');
});
