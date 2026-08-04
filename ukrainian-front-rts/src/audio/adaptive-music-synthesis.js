export const ADAPTIVE_MUSIC_SAMPLE_RATE = 12000;
export const ADAPTIVE_MUSIC_CHANNELS = 1;
export const ADAPTIVE_MUSIC_BITS_PER_SAMPLE = 16;
export const ADAPTIVE_MUSIC_LOOP_MS = 4000;
export const ADAPTIVE_MUSIC_PEAK = 0.72;

export const ADAPTIVE_MUSIC_STATES = Object.freeze({
  MENU: 'menu',
  BRIEFING: 'briefing',
  CALM: 'calm',
  TENSION: 'tension',
  BATTLE: 'battle',
  CRISIS: 'crisis',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
});

const STATES = Object.freeze(Object.values(ADAPTIVE_MUSIC_STATES));

function layer(cycles, amplitude, harmonic = 1, phase = 0) {
  return Object.freeze({ cycles, amplitude, harmonic, phase });
}

function pulse(step, width, amplitude, cycles, phase = 0) {
  return Object.freeze({ step, width, amplitude, cycles, phase });
}

function recipe(state, seed, description, tonalLayers, pulses, noise = 0) {
  return Object.freeze({
    id: `music.${state}`,
    state,
    bankId: state,
    durationMs: ADAPTIVE_MUSIC_LOOP_MS,
    seed,
    description,
    tonalLayers: Object.freeze(tonalLayers),
    pulses: Object.freeze(pulses),
    noise,
  });
}

export const ADAPTIVE_MUSIC_RECIPES = Object.freeze([
  recipe('menu', 0x129001, 'measured modal menu theme', [layer(16, 0.34), layer(24, 0.18, 2, 0.25), layer(10, 0.16, 0.5, 0.5)], [pulse(0.25, 0.12, 0.16, 32)], 0.015),
  recipe('briefing', 0x129002, 'restrained briefing ostinato', [layer(12, 0.3), layer(18, 0.18, 1.5, 0.25), layer(7, 0.14, 0.5, 0.5)], [pulse(0.125, 0.07, 0.13, 40)], 0.012),
  recipe('calm', 0x129003, 'open calm battlefield bed', [layer(8, 0.28), layer(12, 0.17, 1.5, 0.5), layer(5, 0.12, 0.5, 0.25)], [pulse(0.25, 0.09, 0.08, 24)], 0.02),
  recipe('tension', 0x129004, 'syncopated tension layer', [layer(14, 0.3), layer(21, 0.2, 1.5, 0.25), layer(9, 0.14, 0.5, 0.5)], [pulse(0.125, 0.08, 0.18, 48), pulse(0.25, 0.05, 0.1, 72, 0.5)], 0.025),
  recipe('battle', 0x129005, 'driving battle rhythm', [layer(20, 0.3), layer(30, 0.2, 1.5, 0.25), layer(12, 0.16, 0.5, 0.5)], [pulse(0.0625, 0.045, 0.2, 64), pulse(0.125, 0.06, 0.13, 96, 0.5)], 0.032),
  recipe('crisis', 0x129006, 'high-pressure crisis pattern', [layer(24, 0.29), layer(36, 0.2, 1.5, 0.25), layer(15, 0.17, 0.5, 0.5)], [pulse(0.0625, 0.05, 0.22, 80), pulse(0.125, 0.07, 0.15, 120, 0.5)], 0.04),
  recipe('victory', 0x129007, 'ascending victory resolution', [layer(10, 0.32), layer(15, 0.22, 1.5, 0.25), layer(20, 0.16, 2, 0.5)], [pulse(0.25, 0.13, 0.15, 40)], 0.012),
  recipe('defeat', 0x129008, 'descending defeat resolution', [layer(7, 0.31), layer(10, 0.2, 1.5, 0.5), layer(5, 0.16, 0.5, 0.25)], [pulse(0.25, 0.15, 0.11, 28, 0.5)], 0.018),
]);

if (new Set(ADAPTIVE_MUSIC_RECIPES.map((entry) => entry.state)).size !== STATES.length) {
  throw new Error('Adaptive music recipes must cover each score state exactly once.');
}

function xorshift32(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothPulse(phase, step, width) {
  const local = ((phase + step * 0.5) % step) / step;
  const distance = Math.abs(local - 0.5) * 2;
  if (distance >= width) return 0;
  const progress = 1 - distance / width;
  return progress * progress * (3 - 2 * progress);
}

export function renderAdaptiveMusicRecipe(recipeValue) {
  const sampleCount = Math.round(recipeValue.durationMs / 1000 * ADAPTIVE_MUSIC_SAMPLE_RATE);
  const samples = new Float64Array(sampleCount);
  const random = xorshift32(recipeValue.seed);
  let filteredNoise = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const phase = index / sampleCount;
    const edge = Math.sin(Math.PI * phase) ** 2;
    let value = 0;
    for (const tone of recipeValue.tonalLayers) {
      const angle = Math.PI * 2 * (tone.cycles * phase * tone.harmonic + tone.phase);
      value += tone.amplitude * Math.sin(angle);
    }
    for (const beat of recipeValue.pulses) {
      const envelope = smoothPulse(phase, beat.step, beat.width);
      value += beat.amplitude * envelope * Math.sin(Math.PI * 2 * (beat.cycles * phase + beat.phase));
    }
    const rawNoise = random() * 2 - 1;
    filteredNoise += 0.08 * (rawNoise - filteredNoise);
    value += recipeValue.noise * filteredNoise;
    samples[index] = value * edge;
  }
  let rawPeak = 0;
  for (const sample of samples) rawPeak = Math.max(rawPeak, Math.abs(sample));
  const scale = rawPeak > 0 ? ADAPTIVE_MUSIC_PEAK / rawPeak : 1;
  for (let index = 0; index < samples.length; index += 1) samples[index] = clamp(samples[index] * scale);
  return Object.freeze({ recipe: recipeValue, samples, sampleCount, peak: rawPeak > 0 ? ADAPTIVE_MUSIC_PEAK : 0 });
}

function writeAscii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

export function encodeAdaptiveMusicPcm16Wav(samples, { sampleRate = ADAPTIVE_MUSIC_SAMPLE_RATE } = {}) {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ADAPTIVE_MUSIC_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, ADAPTIVE_MUSIC_BITS_PER_SAMPLE, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, Math.round(clamp(samples[index]) * 32767), true);
  }
  return bytes;
}

export function buildAdaptiveMusicBanks() {
  const rendered = ADAPTIVE_MUSIC_RECIPES.map(renderAdaptiveMusicRecipe);
  const banks = rendered.map((entry) => Object.freeze({
    id: entry.recipe.bankId,
    bytes: encodeAdaptiveMusicPcm16Wav(entry.samples),
    sampleCount: entry.sampleCount,
  }));
  return Object.freeze({ banks: Object.freeze(banks), rendered: Object.freeze(rendered) });
}
