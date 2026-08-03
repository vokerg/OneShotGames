import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createDomainEventStream, DOMAIN_EVENT_TYPES } from '../../src/core/events.js';
import {
  createUiSfxResolver,
  createUiSfxRuntime,
  installUiSfxDomainAdapter,
  validateUiSfxCatalog,
} from '../../src/audio/ui-sfx.js';
import { buildUiSfxBanks, UI_SFX_RECIPES } from '../../src/audio/ui-sfx-synthesis.js';
import { buildUiSfxOutputs } from '../../scripts/lib/ui-sfx-generator.mjs';

const manifest = JSON.parse(await readFile(new URL('../../assets/audio/ui/manifest.json', import.meta.url), 'utf8'));
const digest = async (data) => createHash('sha256').update(new Uint8Array(data)).digest('hex');

function mixer({ maxVoices = 6 } = {}) {
  const voices = [];
  return {
    decoded: [], played: [],
    async decodeAudioData(data) { this.decoded.push(data.byteLength); return { ok: true, buffer: { byteLength: data.byteLength } }; },
    playBuffer(options) { this.played.push(options); const id = `voice-${voices.length + 1}`; voices.push({ id, tag: options.tag, bus: options.bus }); return { ok: true, id, tag: options.tag, bus: options.bus }; },
    snapshot() { return { maxVoices, activeVoiceCount: voices.length, voices: [...voices] }; },
  };
}

test('validates complete UI cue coverage and original provenance', () => {
  const catalog = validateUiSfxCatalog(manifest);
  assert.equal(catalog.assets.length, 17);
  assert.equal(catalog.banks.length, 3);
  assert.equal(Object.isFrozen(catalog), true);
  assert.deepEqual(new Set(catalog.assets.map((asset) => asset.family)), new Set([
    'selection', 'acknowledgement', 'command', 'queue', 'complete', 'error', 'alert', 'objective', 'victory', 'defeat', 'menu', 'save', 'load',
  ]));
  assert.ok(catalog.assets.every((asset) => asset.provenance.license === 'CC0-1.0'));
  assert.ok(catalog.assets.every((asset) => asset.provenance.externalInputs.length === 0));
});

test('rejects unsafe, duplicate, unsupported, and out-of-bank records', () => {
  assert.throws(() => validateUiSfxCatalog({ ...manifest, banks: [{ ...manifest.banks[0], path: '../bad.wav' }] }), /relative WAV path/);
  assert.throws(() => validateUiSfxCatalog({ ...manifest, assets: [manifest.assets[0], { ...manifest.assets[1], cue: manifest.assets[0].cue }] }), /unique/);
  assert.throws(() => validateUiSfxCatalog({ ...manifest, assets: [{ ...manifest.assets[0], eventId: 'music.state' }] }), /unsupported event/);
  assert.throws(() => validateUiSfxCatalog({ ...manifest, assets: [{ ...manifest.assets[0], offsetMs: 999999 }] }), /exceeds bank/);
});

test('generates stable PCM banks and enforces the peak ceiling', () => {
  const first = buildUiSfxOutputs();
  const second = buildUiSfxOutputs();
  assert.equal(first.rendered.length, UI_SFX_RECIPES.length);
  assert.equal(first.banks.length, 3);
  for (let index = 0; index < first.banks.length; index += 1) {
    assert.equal(first.banks[index].sha256, second.banks[index].sha256);
    assert.deepEqual(first.banks[index].bytes, second.banks[index].bytes);
    assert.equal(String.fromCharCode(...first.banks[index].bytes.subarray(0, 4)), 'RIFF');
  }
  assert.ok(first.rendered.every((entry) => entry.peak <= 0.861));
});

test('maps every cue to its exact asset through UFR-125 policy', () => {
  const catalog = validateUiSfxCatalog(manifest);
  const resolver = createUiSfxResolver(catalog);
  for (const asset of catalog.assets) {
    const result = resolver.resolve(asset.cue, { tick: 20, sequence: 1 }, { availableAssetIds: [asset.id] });
    assert.equal(result.ok, true);
    assert.equal(result.assetId, asset.id);
    assert.equal(result.eventId, asset.eventId);
    assert.equal(result.bus, 'sfx');
  }
  assert.deepEqual(resolver.resolve('unknown'), { ok: false, cue: 'unknown', reason: 'unknown-cue' });
});

test('synthesizes, verifies, decodes, and plays declared UI slices', async () => {
  const audioMixer = mixer();
  const runtime = await createUiSfxRuntime({ mixer: audioMixer, catalogSource: manifest, digestImpl: digest });
  const preload = await runtime.preload();
  assert.equal(preload.loadedBankIds.length, 3);
  assert.equal(preload.loadedAssetIds.length, 17);
  assert.deepEqual(preload.failures, {});
  assert.equal(audioMixer.decoded.length, 3);
  const played = runtime.play('menu.confirm', { tick: 8, sequence: 2 });
  assert.equal(played.ok, true);
  assert.equal(played.assetId, 'sfx.ui.menu.confirm');
  assert.equal(audioMixer.played[0].tag, 'ui-confirm');
  assert.equal(audioMixer.played[0].offset, 0.108);
  assert.equal(audioMixer.played[0].duration, 0.135);
  assert.deepEqual(runtime.play('menu.confirm', { tick: 9, gain: 2 }), { ok: false, cue: 'menu.confirm', reason: 'invalid-request' });
});

test('contains integrity failures and permits later preload recovery', async () => {
  let corrupt = true;
  const runtime = await createUiSfxRuntime({
    mixer: mixer(), catalogSource: manifest, bankFactory: buildUiSfxBanks,
    digestImpl: async (data) => corrupt ? '0'.repeat(64) : digest(data),
  });
  const failed = await runtime.preload();
  assert.equal(failed.loadedAssetIds.length, 0);
  assert.equal(Object.keys(failed.failures).length, 3);
  corrupt = false;
  const recovered = await runtime.preload();
  assert.equal(recovered.loadedAssetIds.length, 17);
  assert.deepEqual(recovered.failures, {});
});

test('domain adapter forwards tick/sequence and disposes without leaking errors', () => {
  const events = createDomainEventStream();
  const calls = [];
  const dispose = installUiSfxDomainAdapter({ events, runtime: { play: (...args) => calls.push(args) } });
  events.setTick(6);
  events.emit(DOMAIN_EVENT_TYPES.AUDIO, { cue: 'objective.update', gain: 0.8 });
  assert.deepEqual(calls, [['objective.update', { tick: 6, sequence: 1, gain: 0.8, variantKey: null }]]);
  dispose();
  events.emit(DOMAIN_EVENT_TYPES.AUDIO, { cue: 'menu.cancel' });
  assert.equal(calls.length, 1);
  const failingEvents = createDomainEventStream();
  installUiSfxDomainAdapter({ events: failingEvents, runtime: { play: () => { throw new Error('decode'); } } });
  assert.doesNotThrow(() => failingEvents.emit(DOMAIN_EVENT_TYPES.AUDIO, { cue: 'menu.confirm' }));
});
