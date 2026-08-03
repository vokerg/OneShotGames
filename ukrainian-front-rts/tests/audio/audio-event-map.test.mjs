import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIO_EVENT_IDS,
  AUDIO_EVENT_MAP_VERSION,
  AUDIO_EVENT_PRIORITIES,
  createAudioEventMap,
  resolveAudioEvent,
  selectAudioAdmissions,
} from '../../src/audio/audio-event-map.js';

function createCatalog() {
  return createAudioEventMap([
    {
      id: AUDIO_EVENT_IDS.UI_CONFIRM,
      bus: 'sfx',
      priority: AUDIO_EVENT_PRIORITIES.NORMAL,
      cooldownTicks: 2,
      concurrency: { key: 'ui-feedback', limit: 2 },
      assets: { shared: ['sfx.ui.confirm-a', 'sfx.ui.confirm-b'] },
      missingAsset: { policy: 'fallback' },
    },
    {
      id: AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT,
      bus: 'voice',
      priority: AUDIO_EVENT_PRIORITIES.HIGH,
      cooldownTicks: 8,
      concurrency: { key: 'unit-acknowledgement', limit: 1 },
      factionMode: 'prefer',
      assets: {
        shared: ['voice.shared.ack'],
        byFaction: {
          ukrainian: ['voice.ua.ack-a', 'voice.ua.ack-b'],
          russian: ['voice.ru.ack'],
        },
      },
      missingAsset: { policy: 'fallback' },
    },
    {
      id: AUDIO_EVENT_IDS.IMPACT,
      bus: 'sfx',
      priority: AUDIO_EVENT_PRIORITIES.LOW,
      cooldownTicks: 0,
      concurrency: { key: 'combat-impacts', limit: 6 },
      attenuation: { mode: 'linear', nearDistance: 10, farDistance: 90, minimumGain: 0.2 },
      assets: { shared: ['sfx.impact'] },
    },
    {
      id: AUDIO_EVENT_IDS.AMBIENCE_BIOME,
      bus: 'ambience',
      priority: AUDIO_EVENT_PRIORITIES.BACKGROUND,
      assets: { shared: ['ambience.steppe'] },
      missingAsset: { policy: 'silent' },
    },
  ], { fallbackAssetId: 'audio.missing' });
}

test('defines a stable frozen taxonomy and versioned event-map contract', () => {
  const catalog = createCatalog();
  assert.equal(catalog.version, AUDIO_EVENT_MAP_VERSION);
  assert.deepEqual(catalog.ids, [...catalog.ids].sort());
  assert.ok(Object.values(AUDIO_EVENT_IDS).includes('combat.impact'));
  assert.equal(Object.isFrozen(AUDIO_EVENT_IDS), true);
  assert.equal(Object.isFrozen(catalog.events[AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT].assets.byFaction), true);
  assert.throws(() => { catalog.ids.push('bad'); }, TypeError);
});

test('rejects invalid taxonomy, buses, duplicate definitions, and ambiguous faction data', () => {
  assert.throws(() => createAudioEventMap([{ id: 'custom.event', bus: 'sfx', assets: { shared: ['sfx.a'] } }]), /not registered/);
  assert.throws(() => createAudioEventMap([{ id: AUDIO_EVENT_IDS.UI_CONFIRM, bus: 'bad', assets: { shared: ['sfx.a'] } }]), /Unknown audio bus/);
  assert.throws(() => createAudioEventMap([
    { id: AUDIO_EVENT_IDS.UI_CONFIRM, bus: 'sfx', assets: { shared: ['sfx.a'] } },
    { id: AUDIO_EVENT_IDS.UI_CONFIRM, bus: 'sfx', assets: { shared: ['sfx.b'] } },
  ]), /Duplicate audio event/);
  assert.throws(() => createAudioEventMap([{
    id: AUDIO_EVENT_IDS.UI_CONFIRM,
    bus: 'sfx',
    factionMode: 'shared',
    assets: { shared: ['sfx.a'], byFaction: { ukrainian: ['sfx.ua'] } },
  }]), /not allowed/);
});

test('resolves faction-preferred variants deterministically and falls back to shared assets', () => {
  const catalog = createCatalog();
  const request = {
    id: AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT,
    tick: 20,
    sequence: 4,
    faction: 'ukrainian',
    variantKey: 'unit-42',
  };
  const first = resolveAudioEvent(catalog, request);
  const second = resolveAudioEvent(catalog, request);
  assert.deepEqual(second, first);
  assert.equal(first.ok, true);
  assert.ok(['voice.ua.ack-a', 'voice.ua.ack-b'].includes(first.assetId));
  assert.equal(Object.isFrozen(first), true);

  const shared = resolveAudioEvent(catalog, { ...request, faction: 'other' });
  assert.equal(shared.assetId, 'voice.shared.ack');
  const unavailableFaction = resolveAudioEvent(catalog, request, { availableAssetIds: ['voice.shared.ack'] });
  assert.equal(unavailableFaction.assetId, 'voice.shared.ack');

  const seen = new Set();
  for (let index = 0; index < 20; index += 1) {
    seen.add(resolveAudioEvent(catalog, { ...request, variantKey: `unit-${index}` }).assetId);
  }
  assert.deepEqual([...seen].sort(), ['voice.ua.ack-a', 'voice.ua.ack-b']);
});

test('enforces fixed-tick cooldowns and shared concurrency groups without mutating state', () => {
  const catalog = createCatalog();
  const lastPlayedTicks = { [AUDIO_EVENT_IDS.UI_CONFIRM]: 10 };
  const activeCounts = { 'ui-feedback': 1 };
  const cooldown = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 11 }, { lastPlayedTicks, activeCounts });
  assert.deepEqual(cooldown, {
    ok: false,
    eventId: AUDIO_EVENT_IDS.UI_CONFIRM,
    tick: 11,
    sequence: 0,
    priority: AUDIO_EVENT_PRIORITIES.NORMAL,
    reason: 'cooldown',
    retryAtTick: 12,
  });
  const concurrency = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 12 }, {
    lastPlayedTicks,
    activeCounts: { 'ui-feedback': 2 },
  });
  assert.equal(concurrency.reason, 'concurrency-limit');
  assert.equal(concurrency.concurrencyKey, 'ui-feedback');
  assert.equal(concurrency.maxConcurrent, 2);
  assert.deepEqual(lastPlayedTicks, { [AUDIO_EVENT_IDS.UI_CONFIRM]: 10 });
  assert.deepEqual(activeCounts, { 'ui-feedback': 1 });
});

test('applies deterministic linear distance attenuation and rejects inaudible events', () => {
  const catalog = createCatalog();
  const midpoint = resolveAudioEvent(catalog, {
    id: AUDIO_EVENT_IDS.IMPACT,
    tick: 1,
    distance: 50,
    gain: 0.5,
  });
  assert.equal(midpoint.ok, true);
  assert.equal(midpoint.gain, 0.3);
  const far = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.IMPACT, tick: 1, distance: 200 });
  assert.equal(far.gain, 0.2);

  const zeroFloorCatalog = createAudioEventMap([{
    id: AUDIO_EVENT_IDS.IMPACT,
    bus: 'sfx',
    attenuation: { mode: 'linear', nearDistance: 0, farDistance: 20, minimumGain: 0 },
    assets: { shared: ['sfx.impact'] },
  }]);
  assert.equal(resolveAudioEvent(zeroFloorCatalog, { id: AUDIO_EVENT_IDS.IMPACT, distance: 20 }).reason, 'out-of-range');
});

test('uses explicit fallback, silent, and reject behavior for missing assets', () => {
  const catalog = createCatalog();
  const fallback = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 3 }, {
    availableAssetIds: ['audio.missing'],
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.assetId, 'audio.missing');
  assert.equal(fallback.fallbackUsed, true);

  const missing = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 3 }, { availableAssetIds: [] });
  assert.equal(missing.reason, 'missing-asset');
  const silent = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.AMBIENCE_BIOME }, { availableAssetIds: [] });
  assert.equal(silent.reason, 'silent');

  const rejectCatalog = createAudioEventMap([{
    id: AUDIO_EVENT_IDS.UI_ERROR,
    bus: 'sfx',
    assets: { shared: ['sfx.ui.error'] },
  }]);
  assert.equal(resolveAudioEvent(rejectCatalog, { id: AUDIO_EVENT_IDS.UI_ERROR }, { availableAssetIds: [] }).reason, 'missing-asset');
});

test('ranks successful requests by priority then deterministic sequence without preempting active voices', () => {
  const catalog = createCatalog();
  const low = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.IMPACT, tick: 2, sequence: 1 });
  const normal = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 2, sequence: 3 });
  const high = resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT, tick: 2, sequence: 2, faction: 'russian' });
  const result = selectAudioAdmissions([low, normal, high], { availableVoiceSlots: 2 });
  assert.deepEqual(result.accepted.map((event) => event.eventId), [
    AUDIO_EVENT_IDS.UNIT_ACKNOWLEDGEMENT,
    AUDIO_EVENT_IDS.UI_CONFIRM,
  ]);
  assert.equal(result.rejected[0].event.eventId, AUDIO_EVENT_IDS.IMPACT);
  assert.equal(result.rejected[0].reason, 'voice-capacity');
  assert.equal(Object.isFrozen(result), true);
});

test('fails closed for unknown mapped events and validates temporal state', () => {
  const catalog = createCatalog();
  assert.equal(resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.VICTORY }).reason, 'unknown-event');
  assert.throws(() => resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, tick: 2 }, {
    lastPlayedTicks: { [AUDIO_EVENT_IDS.UI_CONFIRM]: 3 },
  }), /in the future/);
  assert.throws(() => resolveAudioEvent(catalog, { id: AUDIO_EVENT_IDS.UI_CONFIRM, gain: 2 }), /between 0 and 1/);
});
