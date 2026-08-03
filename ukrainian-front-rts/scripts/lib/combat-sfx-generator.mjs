import { createHash } from 'node:crypto';
import {
  buildCombatSfxBanks,
  COMBAT_SFX_BITS_PER_SAMPLE,
  COMBAT_SFX_CHANNELS,
  COMBAT_SFX_GAP_MS,
  COMBAT_SFX_RECIPES,
  COMBAT_SFX_SAMPLE_RATE,
} from '../../src/audio/combat-sfx-synthesis.js';

export const COMBAT_SFX_LICENSE = 'CC0-1.0';
export const COMBAT_SFX_MANIFEST_SCHEMA = 'fields-of-resolve.combat-sfx';
export const COMBAT_SFX_MANIFEST_VERSION = 1;
export { COMBAT_SFX_RECIPES };

export function buildCombatSfxOutputs() {
  const built = buildCombatSfxBanks();
  const banks = built.banks.map((bank) => Object.freeze({
    ...bank,
    path: `combat-${bank.id}.wav`,
    byteLength: bank.bytes.byteLength,
    sha256: createHash('sha256').update(bank.bytes).digest('hex'),
  }));
  const assets = built.rendered.map(({ recipe, sampleCount, peak }) => {
    const position = built.positions.get(recipe.id);
    return Object.freeze({
      id: recipe.id,
      cue: recipe.cue,
      eventId: recipe.eventId,
      family: recipe.family,
      bankId: position.bankId,
      offsetMs: Number((position.offsetSamples / COMBAT_SFX_SAMPLE_RATE * 1000).toFixed(3)),
      durationMs: recipe.durationMs,
      sampleCount,
      peak: Number(peak.toFixed(6)),
      loop: false,
      provenance: Object.freeze({
        creator: 'Fields of Resolve contributors',
        source: 'Original deterministic repository synthesis',
        license: COMBAT_SFX_LICENSE,
        redistribution: 'allowed',
        generatedTool: 'src/audio/combat-sfx-synthesis.js',
        externalInputs: Object.freeze([]),
        synthesis: recipe.synthesis,
        seed: recipe.seed,
        humanCorrections: 'Recipe levels and envelopes were reviewed and normalized to a 0.92 peak ceiling.',
      }),
    });
  });
  const manifest = Object.freeze({
    schema: COMBAT_SFX_MANIFEST_SCHEMA,
    version: COMBAT_SFX_MANIFEST_VERSION,
    id: 'fields-of-resolve.combat-sfx',
    generatedAt: '2026-08-03',
    sampleRate: COMBAT_SFX_SAMPLE_RATE,
    channels: COMBAT_SFX_CHANNELS,
    bitsPerSample: COMBAT_SFX_BITS_PER_SAMPLE,
    gapMs: COMBAT_SFX_GAP_MS,
    banks: Object.freeze(banks.map(({ bytes, ...bank }) => bank)),
    assets: Object.freeze(assets),
  });
  return Object.freeze({ manifest, banks: Object.freeze(banks), rendered: built.rendered });
}
export function serializeCombatSfxManifest(manifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }
