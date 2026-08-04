import assert from 'node:assert/strict';

import { createAmbienceCatalog, synthesizeAmbience } from '../src/audio/biome-ambience.js';

const catalog = createAmbienceCatalog();
assert.equal(catalog.length, 54, 'Expected complete 3 biome × 2 period × 3 weather × 3 intensity coverage.');
assert.equal(new Set(catalog.map(({ id }) => id)).size, 54, 'Ambience IDs must be unique.');

for (const descriptor of catalog) {
  assert.equal(descriptor.provenance.license, 'CC0-1.0');
  assert.equal(descriptor.bus, 'ambience');
  assert.equal(descriptor.loop.frameCount, descriptor.loop.sampleRate * descriptor.loop.seconds);
}

for (const descriptor of catalog.filter(({ weather, intensity }) => weather === 'rain' || intensity === 'battle')) {
  const { samples } = synthesizeAmbience(descriptor);
  let peak = 0;
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample), `${descriptor.id} emitted a non-finite sample.`);
    peak = Math.max(peak, Math.abs(sample));
  }
  assert.ok(peak > 0.01, `${descriptor.id} is unexpectedly silent.`);
  assert.ok(peak <= 0.86, `${descriptor.id} exceeds the declared peak ceiling.`);
}

console.log(`[biome-ambience] verified ${catalog.length} deterministic ambience descriptors`);
