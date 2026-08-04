import assert from 'node:assert/strict';
import test from 'node:test';

import manifest from '../../assets/audio/voice/manifest.json' with { type: 'json' };
import {
  DEFAULT_VOICE_PREFERENCES,
  VOICE_CATALOG_SCHEMA,
  VOICE_CATALOG_VERSION,
  VOICE_HOOK_KINDS,
  createNarrativeVoiceRequest,
  createVoicePipeline,
  installVoiceDomainAdapter,
  resolveVoiceLanguage,
  resolveVoiceRequest,
  validateVoiceCatalog,
} from '../../src/audio/voice-pipeline.js';

function clone(value) { return structuredClone(value); }
function catalog() { return validateVoiceCatalog(clone(manifest)); }

function binaryCatalog() {
  const value = clone(manifest);
  const variant = value.hooks.find((hook) => hook.id === 'unit.ready').variants.en[0];
  variant.asset = {
    mode: 'synthetic',
    path: 'generated/unit-ready.wav',
    sha256: 'a'.repeat(64),
    durationMs: 500,
    provenance: {
      creator: 'Test fixture', source: 'Deterministic synthetic fixture', license: 'CC0-1.0',
      redistribution: 'Fixture only', generatedTool: 'test', externalInputs: [], humanCorrections: 'none',
      publicFigureImpersonation: false,
    },
  };
  return value;
}

class FakeEvents {
  listeners = new Set();
  subscribe(type, listener) { assert.equal(type, 'audio.request'); this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event) { for (const listener of this.listeners) listener(event); }
}

class FakeMixer {
  voices = [];
  plays = [];
  stops = [];
  async decodeAudioData(data) { return { ok: true, buffer: { bytes: data.byteLength } }; }
  snapshot() { return { voices: this.voices, maxVoices: 8, activeVoiceCount: this.voices.length }; }
  playBuffer(options) { this.plays.push(options); const id = `voice-${this.plays.length}`; this.voices.push({ id, tag: options.tag }); return { ok: true, id }; }
  stopAll(filter) { this.stops.push(filter); const before = this.voices.length; this.voices = this.voices.filter((voice) => voice.tag !== filter.tag); return before - this.voices.length; }
}

test('validates an immutable versioned catalog covering all required voice families', () => {
  const value = catalog();
  assert.equal(value.schema, VOICE_CATALOG_SCHEMA);
  assert.equal(value.version, VOICE_CATALOG_VERSION);
  assert.deepEqual(value.languageIds, ['en', 'uk']);
  assert.deepEqual(new Set(Object.values(value.hooks).map((hook) => hook.kind)), new Set(Object.values(VOICE_HOOK_KINDS)));
  assert.equal(Object.isFrozen(value.hooks['unit.ready'].variants.uk[0].asset.provenance), true);
  assert.throws(() => { value.hookIds.push('bad'); }, TypeError);
});

test('rejects invalid fallbacks, event ownership, binary provenance, and public-figure speech', () => {
  const cycle = clone(manifest);
  cycle.languages[0].fallbacks = ['uk'];
  assert.throws(() => validateVoiceCatalog(cycle), /fallback cycle/);

  const event = clone(manifest);
  event.hooks[0].eventId = 'voice.dialogue';
  assert.throws(() => validateVoiceCatalog(event), /eventId must be/);

  const unsafe = binaryCatalog();
  unsafe.hooks[0].variants.en[0].asset.provenance.publicFigureImpersonation = true;
  assert.throws(() => validateVoiceCatalog(unsafe), /must not impersonate/);

  const figure = binaryCatalog();
  figure.speakers[0].publicFigure = true;
  figure.speakers[0].voiceAllowed = false;
  assert.throws(() => validateVoiceCatalog(figure), /must not voice a public figure/);
});

test('resolves exact, regional, declared, and default language fallbacks deterministically', () => {
  const value = catalog();
  assert.deepEqual(resolveVoiceLanguage(value, 'uk'), { requested: 'uk', language: 'uk', fallbackUsed: false, chain: ['uk', 'en'] });
  assert.equal(resolveVoiceLanguage(value, 'uk-UA').language, 'uk');
  assert.equal(resolveVoiceLanguage(value, 'fr-CA').language, 'en');
  const first = resolveVoiceRequest(value, { hookId: 'unit.ready', tick: 1, sequence: 7, language: 'uk-UA' });
  const second = resolveVoiceRequest(value, { hookId: 'unit.ready', tick: 1, sequence: 7, language: 'uk-UA' });
  assert.deepEqual(second, first);
  assert.equal(first.language, 'uk');
  assert.match(first.subtitle.text, /[А-Яа-яІіЇїЄє]/);
});

test('couples subtitles and speaker labels without making them depend on audible playback', () => {
  const value = catalog();
  const disabledVoice = resolveVoiceRequest(value, {
    hookId: 'alert.under-attack', tick: 10, language: 'en',
    preferences: { voiceEnabled: false, subtitlesEnabled: true, speakerLabelsEnabled: true },
  });
  assert.equal(disabledVoice.ok, true);
  assert.equal(disabledVoice.accepted, true);
  assert.equal(disabledVoice.voice.reason, 'voice-disabled');
  assert.equal(disabledVoice.subtitle.visible, true);
  assert.equal(disabledVoice.subtitle.speakerLabel, 'Operations');

  const hiddenLabels = resolveVoiceRequest(value, {
    hookId: 'unit.ready', tick: 10,
    preferences: { voiceEnabled: true, subtitlesEnabled: true, speakerLabelsEnabled: false },
  });
  assert.equal(hiddenLabels.subtitle.text.length > 0, true);
  assert.equal(hiddenLabels.subtitle.speakerLabel, '');

  const allDisabled = resolveVoiceRequest(value, {
    hookId: 'unit.ready', tick: 10,
    preferences: { voiceEnabled: false, subtitlesEnabled: false, speakerLabelsEnabled: false },
  });
  assert.equal(allDisabled.accepted, false);
  assert.equal(allDisabled.reason, 'all-output-disabled');
});

test('enforces deterministic fixed-tick repetition limits and reports retry ticks', () => {
  const value = catalog();
  const first = resolveVoiceRequest(value, { hookId: 'alert.under-attack', tick: 10, sequence: 1 });
  const repeated = resolveVoiceRequest(value, { hookId: 'alert.under-attack', tick: 20, sequence: 2 }, { history: [first.historyEntry] });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'repetition-limit');
  assert.equal(repeated.retryAtTick, 190);
  assert.equal(resolveVoiceRequest(value, { hookId: 'alert.under-attack', tick: 190, sequence: 3 }, { history: [first.historyEntry] }).ok, true);
  assert.throws(() => resolveVoiceRequest(value, { hookId: 'unit.ready', tick: 3 }, {
    history: [{ hookId: 'unit.ready', repetitionKey: 'unit.ready', variantId: 'voice.unit.ready.en.a', tick: 4 }],
  }), /in the future/);
});

test('avoids the most recent acknowledgement variant when alternatives exist', () => {
  const value = catalog();
  const first = resolveVoiceRequest(value, { hookId: 'unit.ready', tick: 10, sequence: 1, language: 'en' });
  const second = resolveVoiceRequest(value, { hookId: 'unit.ready', tick: 20, sequence: 1, language: 'en' }, { history: [first.historyEntry] });
  assert.notEqual(second.variantId, first.variantId);
});

test('preserves authored campaign dialogue and keys repetition by narrative cue identity', () => {
  const value = catalog();
  const alpha = resolveVoiceRequest(value, {
    hookId: 'campaign.dialogue', tick: 20, sequence: 1, repetitionKey: 'dialogue.alpha',
    speakerId: 'captain-koval', speakerLabel: 'Captain Koval', subtitleText: 'Hold the crossing.', language: 'en',
  });
  assert.equal(alpha.subtitle.text, 'Hold the crossing.');
  assert.equal(alpha.subtitle.speakerLabel, 'Captain Koval');
  assert.equal(alpha.voice.reason, 'speaker-voice-disabled');
  const beta = resolveVoiceRequest(value, {
    hookId: 'campaign.dialogue', tick: 21, sequence: 2, repetitionKey: 'dialogue.beta',
    speakerId: 'captain-koval', speakerLabel: 'Captain Koval', subtitleText: 'Move to the second line.', language: 'en',
  }, { history: [alpha.historyEntry] });
  assert.equal(beta.ok, true);
  assert.throws(() => resolveVoiceRequest(value, {
    hookId: 'campaign.dialogue', tick: 22, repetitionKey: 'dialogue.gamma', speakerId: 'captain-koval',
  }), /subtitleText/);
});

test('creates a narrative request without importing or mutating the UI model', () => {
  const cue = Object.freeze({ id: 'dialogue:opening:1', tick: 8, sequence: 3, speakerId: 'operations', text: 'Advance by bounds.' });
  const request = createNarrativeVoiceRequest(cue, { language: 'uk', speakerLabel: 'Оперативний центр' });
  assert.deepEqual(request, {
    hookId: 'campaign.dialogue', tick: 8, sequence: 3, repetitionKey: 'dialogue:opening:1',
    speakerId: 'operations', speakerLabel: 'Оперативний центр', subtitleText: 'Advance by bounds.', language: 'uk', gain: 1,
  });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(cue), true);
});

test('runs hook-only output without constructing or requiring a mixer', async () => {
  const pipeline = await createVoicePipeline({ catalogSource: clone(manifest), preferences: { ...DEFAULT_VOICE_PREFERENCES, language: 'uk' } });
  const result = pipeline.request({ hookId: 'unit.ready', tick: 1, sequence: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.playback, null);
  assert.equal(result.subtitle.language, 'uk');
  assert.equal(pipeline.snapshot().history.length, 1);
  pipeline.dispose();
  assert.equal(pipeline.snapshot().disposed, true);
  assert.equal(pipeline.request({ hookId: 'unit.ready' }).reason, 'disposed');
});

test('preloads and routes future provenance-backed assets through the voice bus', async () => {
  const mixer = new FakeMixer();
  const value = binaryCatalog();
  const pipeline = await createVoicePipeline({
    catalogSource: value,
    mixer,
    assetLoader: async () => new ArrayBuffer(8),
    digestImpl: async () => 'a'.repeat(64),
  });
  const preload = await pipeline.preload();
  assert.deepEqual(preload.loadedAssetIds, ['voice.unit.ready.en.a']);
  const result = pipeline.request({ hookId: 'unit.ready', tick: 1, sequence: 2, language: 'en' });
  if (result.variantId === 'voice.unit.ready.en.a') {
    assert.equal(result.playback.ok, true);
    assert.equal(mixer.plays[0].bus, 'voice');
    assert.equal(mixer.plays[0].tag, 'voice-unit-acknowledgement');
  } else {
    assert.equal(result.voice.reason, 'hook-only');
  }
  pipeline.dispose();
  assert.ok(mixer.stops.some((entry) => entry.bus === 'voice'));
});

test('fails closed when audible playback fails and no subtitle is enabled', async () => {
  const mixer = new FakeMixer();
  mixer.playBuffer = () => ({ ok: false, reason: 'voice-limit' });
  const pipeline = await createVoicePipeline({
    catalogSource: binaryCatalog(), mixer,
    assetLoader: async () => new ArrayBuffer(4),
    digestImpl: async () => 'a'.repeat(64),
    preferences: { language: 'en', voiceEnabled: true, subtitlesEnabled: false, speakerLabelsEnabled: false },
  });
  await pipeline.preload();
  let result;
  for (let sequence = 0; sequence < 20; sequence += 1) {
    result = pipeline.request({ hookId: 'unit.ready', tick: sequence, sequence, language: 'en' });
    if (result.variantId === 'voice.unit.ready.en.a') break;
  }
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'voice-limit');
  assert.equal(pipeline.snapshot().history.length, 0);
});

test('records preload failures and permits deterministic retry', async () => {
  const mixer = new FakeMixer();
  let fail = true;
  const pipeline = await createVoicePipeline({
    catalogSource: binaryCatalog(), mixer,
    assetLoader: async () => { if (fail) throw new Error('temporary'); return new ArrayBuffer(4); },
    digestImpl: async () => 'a'.repeat(64),
  });
  assert.equal((await pipeline.preload()).failures['voice.unit.ready.en.a'], 'temporary');
  fail = false;
  const retried = await pipeline.preload();
  assert.deepEqual(retried.loadedAssetIds, ['voice.unit.ready.en.a']);
  assert.deepEqual(retried.failures, {});
});

test('contains malformed domain requests and disposes the exact subscription', () => {
  const events = new FakeEvents();
  const calls = [];
  const pipeline = { request(value) { calls.push(value); if (value.voiceHookId === 'throw') throw new Error('bad'); } };
  const dispose = installVoiceDomainAdapter({ events, pipeline });
  events.emit({ tick: 7, sequence: 9, payload: { voiceHookId: 'unit.ready', language: 'uk', gain: 0.8 } });
  events.emit({ tick: 8, sequence: 10, payload: { malformed: true } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hookId, 'unit.ready');
  assert.equal(calls[0].tick, 7);
  dispose();
  events.emit({ tick: 9, sequence: 11, payload: { voiceHookId: 'unit.ready' } });
  assert.equal(calls.length, 1);
});
