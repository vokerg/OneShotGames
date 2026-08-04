import { createHash } from 'node:crypto';
import {
  ADAPTIVE_MUSIC_BITS_PER_SAMPLE,
  ADAPTIVE_MUSIC_CHANNELS,
  ADAPTIVE_MUSIC_PEAK,
  ADAPTIVE_MUSIC_RECIPES,
  ADAPTIVE_MUSIC_SAMPLE_RATE,
  buildAdaptiveMusicBanks,
} from '../../src/audio/adaptive-music-synthesis.js';

const GENERATED_AT = '2026-08-04T00:00:00.000Z';

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function provenance(recipe) {
  return {
    creator: 'OneShotGames contributors',
    source: 'Repository-authored deterministic synthesis recipe',
    license: 'CC0-1.0',
    redistribution: 'Permitted with source recipe and manifest',
    generatedTool: 'scripts/build-adaptive-music.mjs',
    externalInputs: [],
    synthesis: recipe.description,
    seed: recipe.seed,
    humanCorrections: 'Recipe values reviewed for loop continuity, hierarchy, and peak safety.',
  };
}

export function generateAdaptiveMusicArtifacts() {
  const generated = buildAdaptiveMusicBanks();
  const banks = new Map(generated.banks.map((bank) => [bank.id, bank]));
  const rendered = new Map(generated.rendered.map((entry) => [entry.recipe.state, entry]));
  const tracks = ADAPTIVE_MUSIC_RECIPES.map((recipe) => {
    const bank = banks.get(recipe.bankId);
    const render = rendered.get(recipe.state);
    return {
      id: recipe.id,
      state: recipe.state,
      eventId: 'music.state',
      path: `generated/${recipe.state}.wav`,
      durationMs: recipe.durationMs,
      sampleCount: bank.sampleCount,
      byteLength: bank.bytes.byteLength,
      sha256: sha256(bank.bytes),
      peak: render.peak,
      gain: recipe.state === 'battle' || recipe.state === 'crisis' ? 0.86 : 0.8,
      loop: true,
      provenance: provenance(recipe),
    };
  });
  return Object.freeze({
    manifest: {
      schema: 'fields-of-resolve.adaptive-music',
      version: 1,
      id: 'fields-of-resolve-adaptive-score-v1',
      generatedAt: GENERATED_AT,
      sampleRate: ADAPTIVE_MUSIC_SAMPLE_RATE,
      channels: ADAPTIVE_MUSIC_CHANNELS,
      bitsPerSample: ADAPTIVE_MUSIC_BITS_PER_SAMPLE,
      peakCeiling: ADAPTIVE_MUSIC_PEAK,
      tracks,
    },
    banks: generated.banks,
  });
}
