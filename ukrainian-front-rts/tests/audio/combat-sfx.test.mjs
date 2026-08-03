import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createDomainEventStream, DOMAIN_EVENT_TYPES } from '../../src/core/events.js';
import {
  createCombatSfxResolver,
  validateCombatSfxCatalog,
} from '../../src/audio/combat-sfx-catalog.js';
import {
  createCombatSfxRuntime,
  installCombatSfxDomainAdapter,
} from '../../src/audio/combat-sfx-runtime.js';
import {
  buildCombatSfxOutputs,
  COMBAT_SFX_RECIPES,
  renderCombatSfxRecipe,
} from '../../scripts/lib/combat-sfx-generator.mjs';

const catalogPath = new URL('../../assets/audio/combat/manifest.json', import.meta.url);
const catalogValue = JSON.parse(await readFile(catalogPath, 'utf8'));

function digest(arrayBuffer) {
  return createHash('sha256').update(new Uint8Array(arrayBuffer)).digest('hex');
}

function fakeMixer({ maxVoices = 4 } = {}) {
  const voices = [];
  let nextId = 1;
  return {
    decoded: [],
    played: [],
    async decodeAudioData(data) {
      this.decoded.push(data.byteLength);
      return { ok: true, buffer: { bytes: data.byteLength } };
    },
    playBuffer(options) {
      this.played.push(options);
      const id = `voice-${nextId++}`;
      voices.push({ id, tag: options.tag, bus: options.bus });
      return { ok: true, id, bus: options.bus, tag: options.tag };
    },
    snapshot() {
      return { maxVoices, activeVoiceCount: voices.length, voices: [...voices] };
    },
  };
}

test('validates a complete original combat-SFX family catalog', () => {
  const catalog = validateCombatSfxCatalog(catalogValue);
  assert.equal(catalog.assets.length, 13);
  assert.equal(catalog.banks.length, 3);
  assert.equal(Object.isFrozen(catalog), true);
  assert.deepEqual(new Set(catalog.assets.map((asset) => asset.family)), new Set([
    'weapon', 'impact', 'explosion', 'vehicle', 'drone', 'artillery', 'air-defense', 'destruction', 'repair', 'construction',
  ]));
  assert.ok(catalog.assets.every((asset) => asset.provenance.externalInputs.length === 0));
  assert.ok(catalog.assets.every((asset) => asset.provenance.license === 'CC0-1.0'));
});

test('rejects duplicate cues, unsafe paths, unsupported events, and format drift', () => {
  assert.throws(() => validateCombatSfxCatalog({
    ...catalogValue,
    assets: [catalogValue.assets[0], { ...catalogValue.assets[1], cue: catalogValue.assets[0].cue }],
  }), /cues must be unique/);
  assert.throws(() => validateCombatSfxCatalog({
    ...catalogValue,
    banks: [{ ...catalogValue.banks[0], path: '../bad.wav' }],
  }), /relative WAV path/);
  assert.throws(() => validateCombatSfxCatalog({
    ...catalogValue,
    assets: [{ ...catalogValue.assets[0], eventId: 'music.state' }],
  }), /unsupported event/);
  assert.throws(() => validateCombatSfxCatalog({
    ...catalogValue,
    assets: [{ ...catalogValue.assets[0], bankId: 'missing' }],
  }), /unknown bank/);
});

test('renders stable PCM WAV bytes with a bounded peak ceiling', () => {
  const first = buildCombatSfxOutputs();
  const second = buildCombatSfxOutputs();
  assert.equal(first.rendered.length, COMBAT_SFX_RECIPES.length);
  assert.equal(first.banks.length, 3);
  for (let index = 0; index < first.rendered.length; index += 1) {
    assert.deepEqual(first.rendered[index].samples, second.rendered[index].samples);
    assert.ok(first.rendered[index].peak <= 0.921);
  }
  for (let index = 0; index < first.banks.length; index += 1) {
    assert.equal(first.banks[index].sha256, second.banks[index].sha256);
    assert.equal(first.banks[index].wav.equals(second.banks[index].wav), true);
    assert.equal(first.banks[index].wav.subarray(0, 4).toString('ascii'), 'RIFF');
  }
  assert.ok(renderCombatSfxRecipe(COMBAT_SFX_RECIPES[0]).sampleCount > 0);
});

test('resolves each cue through an exact one-asset UFR-125 policy map', () => {
  const catalog = validateCombatSfxCatalog(catalogValue);
  const resolver = createCombatSfxResolver(catalog);
  for (const asset of catalog.assets) {
    const result = resolver.resolve(asset.cue, { tick: 10, sequence: 1 }, { availableAssetIds: [asset.id] });
    assert.equal(result.ok, true);
    assert.equal(result.assetId, asset.id);
    assert.equal(result.eventId, asset.eventId);
    assert.equal(result.bus, 'sfx');
  }
  assert.deepEqual(resolver.resolve('missing.cue'), { ok: false, cue: 'missing.cue', reason: 'unknown-cue' });
});

test('preloads hash-verified WAVs and plays decoded cues through the mixer', async () => {
  const catalog = validateCombatSfxCatalog(catalogValue);
  const fileBytes = new Map();
  for (const bank of catalog.banks) fileBytes.set(bank.path, await readFile(new URL(`../../assets/audio/combat/${bank.path}`, import.meta.url)));
  const mixer = fakeMixer();
  const runtime = await createCombatSfxRuntime({
    mixer,
    catalogSource: catalogValue,
    baseUrl: 'https://example.test/assets/audio/combat/',
    digestImpl: digest,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname.split('/').at(-1);
      const bytes = fileBytes.get(path);
      return bytes
        ? { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
        : { ok: false, status: 404 };
    },
  });
  const preload = await runtime.preload();
  assert.equal(preload.loadedBankIds.length, catalog.banks.length);
  assert.equal(preload.loadedAssetIds.length, catalog.assets.length);
  assert.deepEqual(preload.failures, {});
  assert.equal(mixer.decoded.length, catalog.banks.length);

  const played = runtime.play('weapon.rifle', { tick: 12, sequence: 4, distance: 12 });
  assert.equal(played.ok, true);
  assert.equal(played.assetId, 'sfx.combat.weapon.rifle');
  assert.equal(mixer.played[0].bus, 'sfx');
  assert.equal(mixer.played[0].tag, 'combat-weapon-fire');
  assert.equal(mixer.played[0].offset, 0);
  assert.equal(mixer.played[0].duration, 0.17);
});

test('fails closed for corrupted or missing assets without throwing into gameplay', async () => {
  const mixer = fakeMixer();
  const runtime = await createCombatSfxRuntime({
    mixer,
    catalogSource: catalogValue,
    baseUrl: 'https://example.test/audio/',
    digestImpl: async () => '0'.repeat(64),
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) }),
  });
  const preload = await runtime.preload();
  assert.equal(preload.loadedAssetIds.length, 0);
  assert.equal(Object.keys(preload.failures).length, catalogValue.banks.length);
  assert.equal(runtime.play('weapon.rifle', { tick: 1 }).reason, 'missing-asset');
});

test('domain adapter forwards immutable audio.request payloads and disposes exactly', () => {
  const events = createDomainEventStream();
  const calls = [];
  const dispose = installCombatSfxDomainAdapter({
    events,
    runtime: { play: (...args) => calls.push(args) },
  });
  events.setTick(7);
  events.emit(DOMAIN_EVENT_TYPES.AUDIO, { cue: 'artillery.fire', distance: 32, gain: 0.8, faction: 'ukrainian' });
  assert.deepEqual(calls, [['artillery.fire', {
    tick: 7,
    sequence: 1,
    faction: 'ukrainian',
    distance: 32,
    gain: 0.8,
    variantKey: null,
  }]]);
  dispose();
  events.emit(DOMAIN_EVENT_TYPES.AUDIO, { cue: 'weapon.rifle' });
  assert.equal(calls.length, 1);
});
