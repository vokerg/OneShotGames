import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIO_DYNAMIC_RANGE_MODES,
  BACKGROUND_AUDIO_POLICIES,
  DEFAULT_AUDIO_SETTINGS,
  createAudioSettingsController,
  effectiveAudioLevels,
  normalizeAudioSettings,
  voiceAccessibilityPreferences,
} from '../src/audio/audio-settings.js';
import { describeAudioVisualCue } from '../src/audio/audio-settings-ui.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
const main = readFileSync(resolve(projectRoot, 'src/main.js'), 'utf8');
const css = readFileSync(resolve(projectRoot, 'audio-settings.css'), 'utf8');
const browserSmoke = readFileSync(resolve(projectRoot, 'scripts/browser-startup-smoke.mjs'), 'utf8');
const verificationRunner = readFileSync(resolve(projectRoot, 'scripts/lib/verification-runner.mjs'), 'utf8');

assert.deepEqual(AUDIO_DYNAMIC_RANGE_MODES, ['full', 'reduced', 'night']);
assert.deepEqual(BACKGROUND_AUDIO_POLICIES, ['pause', 'mute', 'continue']);
assert.equal(normalizeAudioSettings({ schema: 'future', version: 99 }).dynamicRangeMode, 'full');
assert.equal(effectiveAudioLevels({ dynamicRangeMode: 'night' }).sfx, 0.48);
assert.deepEqual(voiceAccessibilityPreferences({ muted: { voice: true }, subtitles: true, speakerLabels: true }), {
  voiceEnabled: false,
  subtitles: true,
  speakerLabels: true,
});
assert.equal(describeAudioVisualCue({ cue: 'ui.alert' }).urgency, 'critical');
assert.ok(Object.isFrozen(DEFAULT_AUDIO_SETTINGS.levels));

const calls = [];
const mixer = {
  setMasterVolume: (value) => calls.push(['master-volume', value]),
  setMasterMuted: (value) => calls.push(['master-muted', value]),
  setBusVolume: (bus, value) => calls.push(['bus-volume', bus, value]),
  setBusMuted: (bus, value) => calls.push(['bus-muted', bus, value]),
  snapshot: () => ({ status: 'locked' }),
};
const controller = createAudioSettingsController({ mixer, initialSettings: { dynamicRangeMode: 'reduced' } });
assert.equal(controller.snapshot().effectiveLevels.master, 0.92);
assert.equal(calls.length, 10);
controller.dispose();

for (const id of [
  'audioSettingsToggle', 'audioSettings', 'audioSettingsClose', 'audioSettingsDone', 'audioSettingsForm',
  'audioSettingsReset', 'audioVisualCueTest', 'audioSettingsStatus', 'audioVisualCue',
]) {
  assert.match(index, new RegExp(`id=["']${id}["']`), `Missing audio settings markup: ${id}`);
}
for (const target of ['master', 'music', 'sfx', 'voice', 'ambience']) {
  assert.match(index, new RegExp(`data-audio-level=["']${target}["']`));
  assert.match(index, new RegExp(`data-audio-muted=["']${target}["']`));
}
assert.match(index, /audio-settings\.css/);
assert.match(main, /createAudioMixer/);
assert.match(main, /installAudioSettingsAccessibility/);
assert.match(main, /module\('audio-settings-accessibility'/);
assert.match(css, /#audioSettings/);
assert.match(css, /#audioVisualCue/);
assert.match(index, /id=["']shell["']/);
assert.match(main, /audioSettingsAccessibility/);
assert.match(verificationRunner, /id: 'audio-settings'/);
assert.match(browserSmoke, /audio settings composition to mount/);
assert.match(browserSmoke, /audio level persistence and diagnostics/);
assert.match(browserSmoke, /hearing-accessible visual cue/);
assert.match(browserSmoke, /audio settings close and focus restoration/);

console.log('[audio-settings] verified persistent mixer controls, background policy, accessibility preferences, runtime wiring, browser interaction coverage, and visual equivalents');
