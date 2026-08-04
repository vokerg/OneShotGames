import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import manifest from '../../assets/audio/music/manifest.json' with { type: 'json' };
import {
  ADAPTIVE_MUSIC_STATES,
  buildAdaptiveMusicBanks,
} from '../../src/audio/adaptive-music-synthesis.js';
import {
  ADAPTIVE_MUSIC_TAG,
  chooseAdaptiveMusicState,
  createAdaptiveMusicDirector,
  createAdaptiveMusicRuntime,
  validateAdaptiveMusicCatalog,
} from '../../src/audio/adaptive-music.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function createMixer({ failDecodeOnce = false } = {}) {
  const calls = [];
  let decodeFailures = failDecodeOnce ? 1 : 0;
  let nextVoice = 1;
  let voices = [];
  return {
    calls,
    async decodeAudioData(data) {
      calls.push(['decode', data.byteLength]);
      if (decodeFailures > 0) { decodeFailures -= 1; return { ok: false, reason: 'decode-failed' }; }
      return { ok: true, buffer: { byteLength: data.byteLength } };
    },
    playBuffer(options) { const id = `voice-${nextVoice++}`; voices = [{ id, bus: options.bus, tag: options.tag }]; calls.push(['play', options]); return { ok: true, id }; },
    stopAll(options) { const count = voices.length; voices = []; calls.push(['stopAll', options]); return count; },
    dropVoices() { voices = []; },
    async pause() { calls.push(['pause']); return true; },
    async resume() { calls.push(['resume']); return true; },
    snapshot() { return { voices: [...voices], activeVoiceCount: voices.length, maxVoices: 8 }; },
  };
}

test('catalog covers every adaptive score state with loop-safe provenance', () => {
  const catalog = validateAdaptiveMusicCatalog(manifest);
  assert.deepEqual(catalog.tracks.map((track) => track.state).sort(), Object.values(ADAPTIVE_MUSIC_STATES).sort());
  assert.ok(catalog.tracks.every((track) => track.loop && track.eventId === 'music.state' && track.provenance.externalInputs.length === 0));
});

test('catalog rejects inconsistent PCM metadata and peak ceilings', () => {
  assert.throws(() => validateAdaptiveMusicCatalog({ ...manifest, peakCeiling: 0.5 }), /peak/);
  const broken = structuredClone(manifest);
  broken.tracks[0].sampleCount += 1;
  assert.throws(() => validateAdaptiveMusicCatalog(broken), /sampleCount/);
});

test('synthesis is byte deterministic and matches canonical hashes', () => {
  const first = buildAdaptiveMusicBanks();
  const second = buildAdaptiveMusicBanks();
  for (const track of manifest.tracks) {
    const left = first.banks.find((bank) => bank.id === track.state);
    const right = second.banks.find((bank) => bank.id === track.state);
    assert.deepEqual(left.bytes, right.bytes);
    assert.equal(hash(left.bytes), track.sha256);
    assert.equal(left.bytes.byteLength, track.byteLength);
    const view = new DataView(left.bytes.buffer, left.bytes.byteOffset, left.bytes.byteLength);
    assert.ok(Math.abs(view.getInt16(44, true) - view.getInt16(left.bytes.byteLength - 2, true)) <= 16);
  }
});

test('state selection applies stage precedence, thresholds, and hysteresis', () => {
  assert.equal(chooseAdaptiveMusicState({ stage: 'operations', tick: 0, intensity: 1 }, 'crisis'), 'menu');
  assert.equal(chooseAdaptiveMusicState({ stage: 'briefing', tick: 0 }, 'menu'), 'briefing');
  assert.equal(chooseAdaptiveMusicState({ stage: 'battlefield', tick: 0, intensity: 0.24 }, 'menu'), 'calm');
  assert.equal(chooseAdaptiveMusicState({ stage: 'battlefield', tick: 0, intensity: 0.55 }, 'tension'), 'battle');
  assert.equal(chooseAdaptiveMusicState({ stage: 'battlefield', tick: 0, intensity: 0.74 }, 'crisis'), 'crisis');
  assert.equal(chooseAdaptiveMusicState({ stage: 'battlefield', tick: 0, intensity: 0.44 }, 'battle'), 'tension');
  assert.equal(chooseAdaptiveMusicState({ stage: 'battlefield', tick: 0, outcome: 'victory' }, 'crisis'), 'victory');
});

test('director enters battlefield music immediately, then enforces dwell and outcome precedence', () => {
  const played = [];
  const director = createAdaptiveMusicDirector({ runtime: { playState(state, request) { played.push([state, request.tick]); return { ok: true, id: state }; } }, initialState: 'menu', minDwellTicks: 120 });
  const entry = director.update({ stage: 'battlefield', tick: 1, intensity: 0.1 });
  assert.equal(entry.changed, true);
  assert.equal(entry.currentState, 'calm');
  assert.equal(director.update({ stage: 'battlefield', tick: 60, intensity: 0.9 }).reason, 'dwell');
  const battle = director.update({ stage: 'battlefield', tick: 121, intensity: 0.6 });
  assert.equal(battle.changed, true);
  assert.equal(battle.currentState, 'battle');
  const victory = director.update({ stage: 'battlefield', tick: 122, intensity: 0, outcome: 'victory' });
  assert.equal(victory.changed, true);
  assert.equal(victory.currentState, 'victory');
  assert.deepEqual(played, [['calm', 1], ['battle', 121], ['victory', 122]]);
});

test('director fails closed for malformed contexts and runtime errors', () => {
  const director = createAdaptiveMusicDirector({ runtime: { playState() { throw new Error('boom'); } }, initialState: 'calm', minDwellTicks: 0 });
  assert.equal(director.update({ stage: 'bogus', tick: 1 }).reason, 'invalid-context');
  const result = director.update({ stage: 'battlefield', tick: 2, intensity: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.currentState, 'calm');
});

test('runtime preloads, loops on music bus, replaces states, and delegates pause/resume', async () => {
  const mixer = createMixer();
  const runtime = await createAdaptiveMusicRuntime({ mixer, catalogSource: manifest });
  const preload = await runtime.preload();
  assert.equal(preload.loadedStates.length, 8);
  const first = runtime.playState('menu', { tick: 1 });
  assert.equal(first.ok, true);
  assert.equal(first.loop, true);
  const second = runtime.playState('battle', { tick: 2 });
  assert.equal(second.ok, true);
  const playCalls = mixer.calls.filter(([kind]) => kind === 'play');
  assert.equal(playCalls.length, 2);
  assert.ok(playCalls.every(([, options]) => options.bus === 'music' && options.loop === true && options.tag === ADAPTIVE_MUSIC_TAG));
  assert.equal(await runtime.pause(), true);
  assert.equal(await runtime.resume(), true);
  runtime.dispose();
  assert.equal(runtime.snapshot().disposed, true);
});

test('runtime avoids duplicate starts but recovers from externally lost voices', async () => {
  const mixer = createMixer();
  const runtime = await createAdaptiveMusicRuntime({ mixer, catalogSource: manifest });
  await runtime.preload();
  assert.equal(runtime.playState('menu', { tick: 1 }).ok, true);
  assert.equal(runtime.playState('menu', { tick: 2 }).reason, 'already-playing');
  mixer.dropVoices();
  assert.equal(runtime.playState('menu', { tick: 3 }).ok, true);
  assert.equal(mixer.calls.filter(([kind]) => kind === 'play').length, 2);
});

test('runtime retries transient decode failures without poisoning later preload', async () => {
  const mixer = createMixer({ failDecodeOnce: true });
  const runtime = await createAdaptiveMusicRuntime({ mixer, catalogSource: manifest });
  const first = await runtime.preload();
  assert.equal(first.loadedStates.length, 7);
  assert.equal(Object.keys(first.failures).length, 1);
  const second = await runtime.preload();
  assert.equal(second.loadedStates.length, 8);
  assert.deepEqual(second.failures, {});
});
