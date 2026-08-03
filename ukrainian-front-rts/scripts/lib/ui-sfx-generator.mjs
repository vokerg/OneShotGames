import { createHash } from 'node:crypto';
import {
  buildUiSfxBanks,
  UI_SFX_BITS_PER_SAMPLE,
  UI_SFX_CHANNELS,
  UI_SFX_GAP_MS,
  UI_SFX_RECIPES,
  UI_SFX_SAMPLE_RATE,
} from '../../src/audio/ui-sfx-synthesis.js';

export const UI_SFX_LICENSE = 'CC0-1.0';
export const UI_SFX_MANIFEST_SCHEMA = 'fields-of-resolve.ui-sfx';
export const UI_SFX_MANIFEST_VERSION = 1;
export { UI_SFX_RECIPES };

export function buildUiSfxOutputs() {
  const built = buildUiSfxBanks();
  const banks = built.banks.map((bank) => Object.freeze({
    id: bank.id,
    path: `ui-${bank.id}.wav`,
    sampleCount: bank.sampleCount,
    byteLength: bank.bytes.byteLength,
    sha256: createHash('sha256').update(bank.bytes).digest('hex'),
    bytes: bank.bytes,
  }));
  const assets = built.rendered.map(({ recipe, sampleCount, peak }) => {
    const position = built.positions.get(recipe.id);
    return Object.freeze({
      id: recipe.id,
      cue: recipe.cue,
      eventId: recipe.eventId,
      family: recipe.family,
      bankId: position.bankId,
      offsetMs: Number((position.offsetSamples / UI_SFX_SAMPLE_RATE * 1000).toFixed(3)),
      durationMs: recipe.durationMs,
      sampleCount,
      peak: Number(peak.toFixed(6)),
      loop: false,
      provenance: Object.freeze({
        creator: 'Fields of Resolve contributors',
        source: 'Original deterministic repository synthesis',
        license: UI_SFX_LICENSE,
        redistribution: 'allowed',
        generatedTool: 'scripts/build-ui-sfx.mjs',
        externalInputs: Object.freeze([]),
        synthesis: recipe.synthesis,
        seed: recipe.seed,
        humanCorrections: 'Tone spacing, envelopes, and relative levels were reviewed and normalized to a 0.86 peak ceiling.',
      }),
    });
  });
  const manifest = Object.freeze({
    schema: UI_SFX_MANIFEST_SCHEMA,
    version: UI_SFX_MANIFEST_VERSION,
    id: 'fields-of-resolve.ui-sfx',
    generatedAt: '2026-08-03',
    sampleRate: UI_SFX_SAMPLE_RATE,
    channels: UI_SFX_CHANNELS,
    bitsPerSample: UI_SFX_BITS_PER_SAMPLE,
    gapMs: UI_SFX_GAP_MS,
    banks: Object.freeze(banks.map(({ bytes, ...bank }) => bank)),
    assets: Object.freeze(assets),
  });
  return Object.freeze({ manifest, banks: Object.freeze(banks), rendered: built.rendered });
}
export function serializeUiSfxManifest(manifest) { return JSON.stringify(manifest, null, 2); }
