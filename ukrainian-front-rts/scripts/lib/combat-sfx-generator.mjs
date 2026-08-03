import { createHash } from 'node:crypto';

export const COMBAT_SFX_SAMPLE_RATE = 12000;
export const COMBAT_SFX_CHANNELS = 1;
export const COMBAT_SFX_BITS_PER_SAMPLE = 16;
export const COMBAT_SFX_LICENSE = 'CC0-1.0';
export const COMBAT_SFX_MANIFEST_SCHEMA = 'fields-of-resolve.combat-sfx';
export const COMBAT_SFX_MANIFEST_VERSION = 1;
export const COMBAT_SFX_GAP_MS = 25;

export const COMBAT_SFX_RECIPES = Object.freeze([
  Object.freeze({ id: 'sfx.combat.weapon.rifle', cue: 'weapon.rifle', eventId: 'combat.weapon-fire', family: 'weapon', bank: 'weapons', durationMs: 170, seed: 0x126001, synthesis: 'bright impulse, short noise crack, low mechanical tail' }),
  Object.freeze({ id: 'sfx.combat.weapon.machine-gun', cue: 'weapon.machine-gun', eventId: 'combat.weapon-fire', family: 'weapon', bank: 'weapons', durationMs: 320, seed: 0x126002, synthesis: 'three compact impulse bursts with alternating mechanical tone' }),
  Object.freeze({ id: 'sfx.combat.weapon.cannon', cue: 'weapon.cannon', eventId: 'combat.weapon-fire', family: 'weapon', bank: 'weapons', durationMs: 520, seed: 0x126003, synthesis: 'low-frequency pressure pulse, noise transient, metallic decay' }),
  Object.freeze({ id: 'sfx.combat.impact.soft', cue: 'impact.soft', eventId: 'combat.impact', family: 'impact', bank: 'battlefield', durationMs: 230, seed: 0x126004, synthesis: 'damped granular thud with short dirt-noise tail' }),
  Object.freeze({ id: 'sfx.combat.impact.armor', cue: 'impact.armor', eventId: 'combat.impact', family: 'impact', bank: 'battlefield', durationMs: 360, seed: 0x126005, synthesis: 'metallic strike with inharmonic ringing partials' }),
  Object.freeze({ id: 'sfx.combat.explosion.field', cue: 'explosion.field', eventId: 'combat.explosion', family: 'explosion', bank: 'battlefield', durationMs: 780, seed: 0x126006, synthesis: 'broadband blast, low pressure bloom, debris tail' }),
  Object.freeze({ id: 'sfx.combat.vehicle.tracks', cue: 'vehicle.tracks', eventId: 'combat.weapon-fire', family: 'vehicle', bank: 'support', durationMs: 560, seed: 0x126007, synthesis: 'rhythmic track clatter, low engine harmonic, suspension knocks' }),
  Object.freeze({ id: 'sfx.combat.drone.pass', cue: 'drone.pass', eventId: 'combat.weapon-fire', family: 'drone', bank: 'support', durationMs: 700, seed: 0x126008, synthesis: 'rising rotor pulse train with filtered air noise' }),
  Object.freeze({ id: 'sfx.combat.artillery.fire', cue: 'artillery.fire', eventId: 'combat.weapon-fire', family: 'artillery', bank: 'weapons', durationMs: 900, seed: 0x126009, synthesis: 'heavy launch transient, pressure wave, long low-frequency decay' }),
  Object.freeze({ id: 'sfx.combat.air-defense.launch', cue: 'air-defense.launch', eventId: 'combat.weapon-fire', family: 'air-defense', bank: 'weapons', durationMs: 720, seed: 0x12600a, synthesis: 'ignition snap, rising rocket hiss, short exhaust tail' }),
  Object.freeze({ id: 'sfx.combat.destruction.vehicle', cue: 'destruction.vehicle', eventId: 'combat.destruction', family: 'destruction', bank: 'battlefield', durationMs: 980, seed: 0x12600b, synthesis: 'structural crack, blast pulse, falling metallic debris' }),
  Object.freeze({ id: 'sfx.combat.repair.field', cue: 'repair.field', eventId: 'combat.repair', family: 'repair', bank: 'support', durationMs: 620, seed: 0x12600c, synthesis: 'tool ratchet, compact weld buzz, metallic taps' }),
  Object.freeze({ id: 'sfx.economy.construction.field', cue: 'construction.field', eventId: 'economy.construction', family: 'construction', bank: 'support', durationMs: 760, seed: 0x12600d, synthesis: 'hammer cadence, material placement thumps, short tool tail' }),
]);

function xorshift32(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function clamp(value, minimum = -1, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }
function envelope(time, duration, attack = 0.004, releasePower = 2.2) {
  if (time < 0 || time >= duration) return 0;
  return Math.min(1, time / Math.max(attack, 1 / COMBAT_SFX_SAMPLE_RATE)) * Math.pow(1 - time / duration, releasePower);
}
function pulse(time, at, width, amplitude = 1) {
  const delta = time - at;
  if (delta < 0 || delta >= width) return 0;
  const phase = delta / width;
  return amplitude * Math.sin(Math.PI * phase) * Math.pow(1 - phase, 1.4);
}
function oscillator(time, frequency, phase = 0) { return Math.sin(Math.PI * 2 * frequency * time + phase); }
function chirp(time, startFrequency, endFrequency, duration, phase = 0) {
  const slope = (endFrequency - startFrequency) / Math.max(duration, 1e-9);
  return Math.sin(Math.PI * 2 * (startFrequency * time + 0.5 * slope * time * time) + phase);
}

function renderRecipeSamples(recipe) {
  const duration = recipe.durationMs / 1000;
  const count = Math.max(1, Math.round(duration * COMBAT_SFX_SAMPLE_RATE));
  const random = xorshift32(recipe.seed);
  const samples = new Float64Array(count);
  let filteredNoise = 0;
  for (let index = 0; index < count; index += 1) {
    const time = index / COMBAT_SFX_SAMPLE_RATE;
    const noise = random() * 2 - 1;
    filteredNoise += 0.18 * (noise - filteredNoise);
    let value = 0;
    switch (recipe.cue) {
      case 'weapon.rifle': value = pulse(time, 0, 0.025, 1.2) * (0.65 * noise + 0.35 * oscillator(time, 1900)) + envelope(time, duration, 0.002, 3.8) * (0.42 * filteredNoise + 0.18 * oscillator(time, 150)); break;
      case 'weapon.machine-gun': value = [0, 0.095, 0.19].reduce((sum, at, shot) => sum + pulse(time, at, 0.03, 0.9) * (0.62 * noise + 0.28 * oscillator(time - at, 1350 + shot * 90)), 0) + envelope(time, duration, 0.002, 2.8) * 0.16 * oscillator(time, 92); break;
      case 'weapon.cannon': value = pulse(time, 0, 0.055, 1.2) * (0.55 * noise + 0.45 * oscillator(time, 420)) + envelope(time, duration, 0.003, 2.5) * (0.55 * oscillator(time, 72) + 0.2 * filteredNoise) + pulse(time, 0.12, 0.1, 0.24) * oscillator(time, 830); break;
      case 'impact.soft': value = envelope(time, duration, 0.002, 3.4) * (0.62 * filteredNoise + 0.5 * oscillator(time, 68)) + pulse(time, 0.025, 0.08, 0.22) * noise; break;
      case 'impact.armor': value = pulse(time, 0, 0.025, 0.9) * noise + envelope(time, duration, 0.001, 2.2) * (0.42 * oscillator(time, 720) + 0.28 * oscillator(time, 1190, 0.4) + 0.18 * oscillator(time, 1810, 1.1)); break;
      case 'explosion.field': value = pulse(time, 0, 0.08, 1.25) * (0.72 * noise + 0.28 * oscillator(time, 105)) + envelope(time, duration, 0.004, 1.8) * (0.52 * filteredNoise + 0.46 * oscillator(time, 47)) + pulse(time, 0.18, 0.22, 0.18) * noise; break;
      case 'vehicle.tracks': value = [0.01, 0.11, 0.205, 0.315, 0.425].reduce((sum, at, beat) => sum + pulse(time, at, 0.045, 0.42) * (0.62 * noise + 0.38 * oscillator(time - at, 260 + beat * 31)), 0) + envelope(time, duration, 0.02, 1.4) * (0.28 * oscillator(time, 58) + 0.12 * oscillator(time, 116)); break;
      case 'drone.pass': value = envelope(time, duration, 0.08, 1.1) * (0.4 * oscillator(time, 118 + 18 * Math.sin(Math.PI * time / duration)) + 0.22 * oscillator(time, 236) + 0.11 * oscillator(time, 354) + 0.15 * filteredNoise) + 0.12 * chirp(time, 280, 520, duration) * Math.sin(Math.PI * time / duration); break;
      case 'artillery.fire': value = pulse(time, 0, 0.09, 1.35) * (0.52 * noise + 0.48 * oscillator(time, 290)) + envelope(time, duration, 0.003, 1.65) * (0.62 * oscillator(time, 38) + 0.31 * filteredNoise) + pulse(time, 0.24, 0.28, 0.2) * noise; break;
      case 'air-defense.launch': value = pulse(time, 0, 0.035, 0.95) * noise + envelope(time, duration, 0.015, 1.25) * (0.38 * filteredNoise + 0.3 * chirp(time, 220, 1280, duration)); break;
      case 'destruction.vehicle': value = pulse(time, 0, 0.085, 1.2) * (0.62 * noise + 0.38 * oscillator(time, 83)) + envelope(time, duration, 0.004, 1.45) * (0.42 * oscillator(time, 44) + 0.24 * filteredNoise) + [0.18, 0.33, 0.49, 0.68].reduce((sum, at, piece) => sum + pulse(time, at, 0.08 + piece * 0.012, 0.2) * (noise + 0.35 * oscillator(time - at, 410 + piece * 175)), 0); break;
      case 'repair.field': value = [0.03, 0.16, 0.31, 0.47].reduce((sum, at, tapIndex) => sum + pulse(time, at, 0.035, 0.32) * oscillator(time - at, 820 + tapIndex * 120), 0) + (time >= 0.2 && time <= 0.44 ? Math.sin(Math.PI * (time - 0.2) / 0.24) : 0) * (0.18 * oscillator(time, 1320) + 0.1 * noise); break;
      case 'construction.field': value = [0.02, 0.19, 0.37, 0.56].reduce((sum, at, hitIndex) => sum + pulse(time, at, 0.06, 0.42) * (0.45 * noise + 0.55 * oscillator(time - at, 260 + hitIndex * 70)), 0) + envelope(time, duration, 0.01, 1.6) * 0.14 * oscillator(time, 74); break;
      default: throw new Error(`Unknown combat SFX recipe: ${recipe.cue}`);
    }
    samples[index] = value;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0 ? 0.92 / peak : 1;
  for (let index = 0; index < samples.length; index += 1) samples[index] = clamp(samples[index] * scale);
  return samples;
}

function writeAscii(buffer, offset, value) { buffer.write(value, offset, value.length, 'ascii'); }
export function encodePcm16Wav(samples, { sampleRate = COMBAT_SFX_SAMPLE_RATE } = {}) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  writeAscii(buffer, 0, 'RIFF'); buffer.writeUInt32LE(36 + dataLength, 4); writeAscii(buffer, 8, 'WAVE'); writeAscii(buffer, 12, 'fmt ');
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(COMBAT_SFX_CHANNELS, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(COMBAT_SFX_BITS_PER_SAMPLE, 34); writeAscii(buffer, 36, 'data'); buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < samples.length; index += 1) buffer.writeInt16LE(Math.round(clamp(samples[index]) * 32767), 44 + index * 2);
  return buffer;
}

export function renderCombatSfxRecipe(recipe) {
  const samples = renderRecipeSamples(recipe);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return Object.freeze({ recipe, samples, sampleCount: samples.length, peak });
}

function bankOutputs(rendered) {
  const gapSamples = Math.round(COMBAT_SFX_GAP_MS / 1000 * COMBAT_SFX_SAMPLE_RATE);
  const groups = new Map();
  for (const entry of rendered) {
    const group = groups.get(entry.recipe.bank) ?? [];
    group.push(entry);
    groups.set(entry.recipe.bank, group);
  }
  const banks = [];
  const assetPositions = new Map();
  for (const bankId of [...groups.keys()].sort()) {
    const entries = groups.get(bankId);
    const totalSamples = entries.reduce((sum, entry) => sum + entry.sampleCount, 0) + gapSamples * Math.max(0, entries.length - 1);
    const samples = new Float64Array(totalSamples);
    let cursor = 0;
    for (const entry of entries) {
      samples.set(entry.samples, cursor);
      assetPositions.set(entry.recipe.id, Object.freeze({ bankId, offsetSamples: cursor }));
      cursor += entry.sampleCount + gapSamples;
    }
    const wav = encodePcm16Wav(samples);
    banks.push(Object.freeze({ id: bankId, path: `combat-${bankId}.wav`, wav, sampleCount: samples.length, byteLength: wav.length, sha256: createHash('sha256').update(wav).digest('hex') }));
  }
  return Object.freeze({ banks: Object.freeze(banks), assetPositions });
}

export function buildCombatSfxOutputs() {
  const rendered = COMBAT_SFX_RECIPES.map(renderCombatSfxRecipe);
  const { banks, assetPositions } = bankOutputs(rendered);
  const assets = rendered.map(({ recipe, sampleCount, peak }) => {
    const position = assetPositions.get(recipe.id);
    return Object.freeze({
      id: recipe.id, cue: recipe.cue, eventId: recipe.eventId, family: recipe.family, bankId: position.bankId,
      offsetMs: Number((position.offsetSamples / COMBAT_SFX_SAMPLE_RATE * 1000).toFixed(3)), durationMs: recipe.durationMs,
      sampleCount, peak: Number(peak.toFixed(6)), loop: false,
      provenance: Object.freeze({ creator: 'Fields of Resolve contributors', source: 'Original deterministic repository synthesis', license: COMBAT_SFX_LICENSE, redistribution: 'allowed', generatedTool: 'scripts/build-combat-sfx.mjs', externalInputs: Object.freeze([]), synthesis: recipe.synthesis, seed: recipe.seed, humanCorrections: 'Recipe levels and envelopes were reviewed and normalized to a 0.92 peak ceiling.' }),
    });
  });
  const manifest = Object.freeze({
    schema: COMBAT_SFX_MANIFEST_SCHEMA, version: COMBAT_SFX_MANIFEST_VERSION, id: 'fields-of-resolve.combat-sfx', generatedAt: '2026-08-03',
    sampleRate: COMBAT_SFX_SAMPLE_RATE, channels: COMBAT_SFX_CHANNELS, bitsPerSample: COMBAT_SFX_BITS_PER_SAMPLE, gapMs: COMBAT_SFX_GAP_MS,
    banks: Object.freeze(banks.map(({ wav, ...bank }) => bank)), assets: Object.freeze(assets),
  });
  return Object.freeze({ manifest, banks, rendered: Object.freeze(rendered) });
}
export function serializeCombatSfxManifest(manifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }
