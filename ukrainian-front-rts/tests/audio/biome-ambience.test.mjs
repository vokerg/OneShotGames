import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AMBIENCE_DIMENSIONS,
  createAmbienceCatalog,
  createAmbienceDescriptor,
  resolveAmbience,
  synthesizeAmbience,
} from '../../src/audio/biome-ambience.js';

test('catalog covers every biome, period, weather, and intensity combination', () => {
  const catalog = createAmbienceCatalog();
  const expected = AMBIENCE_DIMENSIONS.BIOMES.length
    * AMBIENCE_DIMENSIONS.PERIODS.length
    * AMBIENCE_DIMENSIONS.WEATHER.length
    * AMBIENCE_DIMENSIONS.INTENSITIES.length;
  assert.equal(catalog.length, expected);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, expected);
});

test('descriptors are immutable, loop-safe contracts with provenance', () => {
  const descriptor = createAmbienceDescriptor({ biome: 'kherson', period: 'night', weather: 'rain', intensity: 'tense' });
  assert.equal(descriptor.bus, 'ambience');
  assert.equal(descriptor.loop.seconds, 8);
  assert.ok(descriptor.loop.crossfadeFrames > 0);
  assert.equal(descriptor.provenance.license, 'CC0-1.0');
  assert.ok(Object.isFrozen(descriptor));
  assert.ok(Object.isFrozen(descriptor.layers));
});

test('same descriptor synthesizes identical bounded samples', () => {
  const first = synthesizeAmbience({ biome: 'zaporizhzhia', period: 'day', weather: 'wind', intensity: 'battle' });
  const second = synthesizeAmbience({ biome: 'zaporizhzhia', period: 'day', weather: 'wind', intensity: 'battle' });
  assert.equal(first.samples.length, 96_000);
  assert.deepEqual(first.samples, second.samples);
  let peak = 0;
  for (const sample of first.samples) peak = Math.max(peak, Math.abs(sample));
  assert.ok(peak <= 0.86);
  assert.ok(peak > 0.01);
});

test('day/night, weather, biome, and intensity materially alter output', () => {
  const base = synthesizeAmbience({ biome: 'donbas', period: 'day', weather: 'clear', intensity: 'calm' }).samples;
  const variants = [
    synthesizeAmbience({ biome: 'donbas', period: 'night', weather: 'clear', intensity: 'calm' }).samples,
    synthesizeAmbience({ biome: 'donbas', period: 'day', weather: 'rain', intensity: 'calm' }).samples,
    synthesizeAmbience({ biome: 'kherson', period: 'day', weather: 'clear', intensity: 'calm' }).samples,
    synthesizeAmbience({ biome: 'donbas', period: 'day', weather: 'clear', intensity: 'battle' }).samples,
  ];
  for (const variant of variants) assert.notDeepEqual(base, variant);
});

test('invalid dimensions fail closed to a conspicuous stable fallback', () => {
  assert.throws(() => createAmbienceDescriptor({ biome: 'unknown' }), /biome must be one of/);
  const result = resolveAmbience({ weather: 'snow' });
  assert.equal(result.status, 'fallback');
  assert.equal(result.descriptor.id, 'ambience.donbas.day.clear.calm');
  assert.match(result.reason, /weather must be one of/);
});
