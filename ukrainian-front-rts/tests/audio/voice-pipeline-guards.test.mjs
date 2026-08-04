import assert from 'node:assert/strict';
import test from 'node:test';

import manifest from '../../assets/audio/voice/manifest.json' with { type: 'json' };
import {
  createVoicePipeline,
  resolveVoiceLanguage,
  resolveVoiceRequest,
} from '../../src/audio/voice-pipeline.js';

const clone = (value) => structuredClone(value);

test('normalizes raw manifest input at pure resolver boundaries', () => {
  assert.equal(resolveVoiceLanguage(clone(manifest), 'uk-UA').language, 'uk');
  const result = resolveVoiceRequest(clone(manifest), {
    hookId: 'unit.ready',
    tick: 1,
    sequence: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.hookId, 'unit.ready');
});

test('rejects an explicitly supplied incompatible mixer for hook-only catalogs', async () => {
  await assert.rejects(
    () => createVoicePipeline({ catalogSource: clone(manifest), mixer: {} }),
    /compatible audio mixer/,
  );
});
