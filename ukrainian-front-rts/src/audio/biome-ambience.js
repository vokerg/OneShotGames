const SAMPLE_RATE = 12_000;
const LOOP_SECONDS = 8;
const FRAME_COUNT = SAMPLE_RATE * LOOP_SECONDS;

const BIOMES = Object.freeze(['donbas', 'zaporizhzhia', 'kherson']);
const PERIODS = Object.freeze(['day', 'night']);
const WEATHER = Object.freeze(['clear', 'wind', 'rain']);
const INTENSITIES = Object.freeze(['calm', 'tense', 'battle']);

const PROVENANCE = Object.freeze({
  license: 'CC0-1.0',
  source: 'Repository-owned deterministic synthesis; no recordings, sample libraries, models, or network inputs.',
  authoringTask: 'UFR-128',
});

function assertMember(value, allowed, label) {
  if (!allowed.includes(value)) throw new RangeError(`${label} must be one of: ${allowed.join(', ')}`);
}

function hashSeed(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomStep(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function profileFor({ biome, period, weather, intensity }) {
  const biomeBase = {
    donbas: { wind: 0.19, industry: 0.15, insects: 0.02, water: 0.01 },
    zaporizhzhia: { wind: 0.24, industry: 0.08, insects: 0.04, water: 0.02 },
    kherson: { wind: 0.17, industry: 0.03, insects: 0.05, water: 0.11 },
  }[biome];
  const periodScale = period === 'night' ? { insects: 1.65, industry: 0.72 } : { insects: 1, industry: 1 };
  const weatherScale = weather === 'rain' ? 1.55 : weather === 'wind' ? 1.28 : 1;
  const battleGain = intensity === 'battle' ? 0.18 : intensity === 'tense' ? 0.08 : 0;
  return Object.freeze({
    wind: biomeBase.wind * weatherScale,
    industry: biomeBase.industry * periodScale.industry,
    insects: biomeBase.insects * periodScale.insects,
    water: biomeBase.water,
    battle: battleGain,
    rain: weather === 'rain' ? 0.22 : 0,
  });
}

export function createAmbienceDescriptor(input = {}) {
  const biome = input.biome ?? 'donbas';
  const period = input.period ?? 'day';
  const weather = input.weather ?? 'clear';
  const intensity = input.intensity ?? 'calm';
  assertMember(biome, BIOMES, 'biome');
  assertMember(period, PERIODS, 'period');
  assertMember(weather, WEATHER, 'weather');
  assertMember(intensity, INTENSITIES, 'intensity');
  const id = `ambience.${biome}.${period}.${weather}.${intensity}`;
  return Object.freeze({
    schemaVersion: 1,
    id,
    biome,
    period,
    weather,
    intensity,
    bus: 'ambience',
    loop: Object.freeze({ sampleRate: SAMPLE_RATE, frameCount: FRAME_COUNT, seconds: LOOP_SECONDS, crossfadeFrames: 1_200 }),
    layers: profileFor({ biome, period, weather, intensity }),
    provenance: PROVENANCE,
  });
}

export function synthesizeAmbience(input = {}) {
  const descriptor = createAmbienceDescriptor(input);
  const samples = new Float32Array(FRAME_COUNT);
  let state = hashSeed(descriptor.id) || 1;
  let smoothNoise = 0;
  let slowNoise = 0;
  const { wind, industry, insects, water, battle, rain } = descriptor.layers;

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    state = randomStep(state);
    const white = ((state / 0xffffffff) * 2) - 1;
    smoothNoise += (white - smoothNoise) * 0.018;
    slowNoise += (white - slowNoise) * 0.0015;
    const time = frame / SAMPLE_RATE;
    const industrialHum = Math.sin(time * Math.PI * 2 * 47) * industry;
    const insectPulse = Math.max(0, Math.sin(time * Math.PI * 2 * 6.7)) * insects * Math.sin(time * Math.PI * 2 * 310);
    const waterLap = Math.sin(time * Math.PI * 2 * 0.31) * smoothNoise * water;
    const distantBattle = battle > 0 && frame % 18_000 < 1_100
      ? Math.sin(time * Math.PI * 2 * 72) * battle * (1 - ((frame % 18_000) / 1_100))
      : 0;
    const rainNoise = white * rain;
    const envelope = Math.sin(Math.PI * frame / FRAME_COUNT) ** 2;
    const value = (smoothNoise * wind) + (slowNoise * wind * 0.7) + industrialHum + insectPulse + waterLap + distantBattle + rainNoise;
    samples[frame] = Math.max(-0.86, Math.min(0.86, value * (0.72 + envelope * 0.28)));
  }

  return Object.freeze({ descriptor, samples });
}

export function createAmbienceCatalog() {
  return Object.freeze(BIOMES.flatMap((biome) => PERIODS.flatMap((period) => WEATHER.flatMap((weather) =>
    INTENSITIES.map((intensity) => createAmbienceDescriptor({ biome, period, weather, intensity }))))));
}

export function resolveAmbience(input = {}) {
  try {
    return Object.freeze({ status: 'ok', descriptor: createAmbienceDescriptor(input) });
  } catch (error) {
    return Object.freeze({
      status: 'fallback',
      reason: error.message,
      descriptor: createAmbienceDescriptor({ biome: 'donbas', period: 'day', weather: 'clear', intensity: 'calm' }),
    });
  }
}

export const AMBIENCE_DIMENSIONS = Object.freeze({ BIOMES, PERIODS, WEATHER, INTENSITIES });
