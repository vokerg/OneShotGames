import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditAudioRelease,
  selectReleaseVoices,
  validateAudioReleaseQaLedger,
  validateAutoplayResumeTrace,
} from '../../src/audio/audio-release-qa.js';

const ledger = {
  schema: 'fields-of-resolve.audio-release-qa',
  version: 1,
  releasePeakCeiling: 0.95,
  minimumHeadroomDb: 0.44,
  families: [
    { id: 'combat', bus: 'sfx', kind: 'manifest', sourcePath: 'assets/audio/combat/manifest.json', owner: 'combat', license: 'CC0-1.0', redistribution: 'allowed', generatedTool: 'build', externalInputs: [], peakCeiling: 0.92, minimumRecords: 1 },
    { id: 'voice', bus: 'voice', kind: 'hook', sourcePath: 'assets/audio/voice/manifest.json', owner: 'voice', license: 'CC0-1.0', redistribution: 'allowed', generatedTool: 'none', externalInputs: [], peakCeiling: null, minimumRecords: 1 },
  ],
  voiceBudgets: { total: 3, buses: { music: 0, sfx: 2, voice: 1, ambience: 0 }, dropPolicy: 'priority-oldest-id' },
  campaignContexts: [{ id: 'battle', musicStates: ['battle'], ambienceBiomes: ['donbas'] }],
};

const provenance = { creator: 'contributors', source: 'repository synthesis', license: 'CC0-1.0', redistribution: 'allowed', generatedTool: 'build', externalInputs: [], publicFigureImpersonation: false };

test('release ledger is immutable and reserves no more voices than the mixer budget', () => {
  const value = validateAudioReleaseQaLedger(ledger);
  assert.equal(value.voiceBudgets.total, 3);
  assert.equal(value.voiceBudgets.unreserved, 0);
  assert.equal(Object.isFrozen(value), true);
  assert.throws(() => validateAudioReleaseQaLedger({ ...ledger, voiceBudgets: { ...ledger.voiceBudgets, total: 2 } }), /reserve 3 voices/);
});

test('release audit catches missing, orphaned, clipped, and provenance-invalid assets', () => {
  const valid = auditAudioRelease({
    ledger,
    inventories: {
      combat: [{ id: 'combat.rifle', path: 'assets/audio/combat/rifle.wav', peak: 0.9, provenance }],
      voice: [{ id: 'voice.ready', mode: 'hook-only', path: null, peak: null, provenance: { ...provenance, generatedTool: 'none' } }],
    },
    committedPaths: ['assets/audio/combat/manifest.json', 'assets/audio/voice/manifest.json'],
    generatedPaths: ['assets/audio/combat/rifle.wav'],
    coverage: { musicStates: ['battle'], ambienceBiomes: ['donbas'] },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.recordCount, 2);

  const invalid = auditAudioRelease({
    ledger,
    inventories: {
      combat: [{ id: 'combat.rifle', path: 'assets/audio/combat/missing.wav', peak: 0.96, provenance: { ...provenance, license: 'unknown' } }],
      voice: [{ id: 'voice.ready', mode: 'hook-only', path: 'voice.wav', peak: null, provenance: { ...provenance, generatedTool: 'none', publicFigureImpersonation: true } }],
    },
    committedPaths: ['assets/audio/combat/manifest.json', 'assets/audio/voice/manifest.json'],
    generatedPaths: ['assets/audio/combat/orphan.wav'],
    committedMediaPaths: ['assets/audio/voice/orphan.ogg'],
    coverage: { musicStates: [], ambienceBiomes: [] },
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(new Set(invalid.errors.map((entry) => entry.code)), new Set([
    'headroom', 'hook-path', 'license-mismatch', 'missing-ambience-context', 'missing-music-context', 'missing-output', 'orphan-media', 'orphan-output', 'peak-ceiling', 'public-figure-impersonation',
  ]));
});

test('voice admission drops low-priority requests deterministically at bus budgets', () => {
  const result = selectReleaseVoices([
    { id: 'late-low', bus: 'sfx', priority: 1, startedAt: 8 },
    { id: 'voice-critical', bus: 'voice', priority: 100, startedAt: 4 },
    { id: 'early-normal', bus: 'sfx', priority: 10, startedAt: 1 },
    { id: 'late-normal', bus: 'sfx', priority: 10, startedAt: 2 },
  ], ledger.voiceBudgets);
  assert.deepEqual(result.admitted.map((entry) => entry.id), ['voice-critical', 'early-normal', 'late-normal']);
  assert.deepEqual(result.rejected.map((entry) => [entry.id, entry.reason]), [['late-low', 'bus-budget']]);
});

test('browser lifecycle trace requires gesture unlock and resume after pause', () => {
  const valid = validateAutoplayResumeTrace([
    { state: 'locked', cause: 'startup' },
    { state: 'running', cause: 'user-gesture' },
    { state: 'paused', cause: 'visibility' },
    { state: 'running', cause: 'resume' },
  ]);
  assert.equal(valid.ok, true);
  assert.equal(validateAutoplayResumeTrace([
    { state: 'running', cause: 'startup' },
    { state: 'running', cause: 'user-gesture' },
    { state: 'paused', cause: 'visibility' },
    { state: 'failed', cause: 'resume', error: 'NotAllowedError' },
  ]).ok, false);
});
