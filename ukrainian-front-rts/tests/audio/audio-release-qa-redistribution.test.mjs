import assert from 'node:assert/strict';
import test from 'node:test';
import { auditAudioRelease } from '../../src/audio/audio-release-qa.js';

const baseLedger = {
  schema: 'fields-of-resolve.audio-release-qa',
  version: 1,
  releasePeakCeiling: 0.95,
  minimumHeadroomDb: 0.44,
  families: [{
    id: 'combat',
    bus: 'sfx',
    kind: 'manifest',
    sourcePath: 'assets/audio/combat/manifest.json',
    owner: 'combat',
    license: 'CC0-1.0',
    redistribution: 'allowed',
    generatedTool: 'build',
    externalInputs: [],
    peakCeiling: 0.92,
    minimumRecords: 1,
  }],
  voiceBudgets: {
    total: 1,
    buses: { music: 0, sfx: 1, voice: 0, ambience: 0 },
    dropPolicy: 'priority-oldest-id',
  },
  campaignContexts: [{ id: 'battle', musicStates: ['battle'], ambienceBiomes: [] }],
};

function audit(redistribution) {
  return auditAudioRelease({
    ledger: baseLedger,
    inventories: {
      combat: [{
        id: 'combat.rifle',
        path: 'generated/rifle.wav',
        peak: 0.9,
        provenance: {
          creator: 'contributors',
          source: 'repository synthesis',
          license: 'CC0-1.0',
          redistribution,
          generatedTool: 'build',
          externalInputs: [],
          publicFigureImpersonation: false,
        },
      }],
    },
    committedPaths: ['assets/audio/combat/manifest.json'],
    generatedPaths: ['generated/rifle.wav'],
    coverage: { musicStates: ['battle'], ambienceBiomes: [] },
  });
}

test('redistribution provenance recognizes explicit permission and fails closed on denials', () => {
  assert.equal(audit('allowed').ok, true);
  assert.equal(audit('permitted with recipe and manifest').ok, true);
  for (const phrase of ['redistribution prohibited', 'not permitted', 'no redistribution', 'restricted']) {
    const result = audit(phrase);
    assert.equal(result.ok, false, phrase);
    assert.ok(result.errors.some((entry) => entry.code === 'redistribution-mismatch'), phrase);
  }
});
