# Audio architecture

UFR-124 establishes `src/audio/audio-mixer.js` as the sole Web Audio lifecycle and routing owner. UFR-125 adds the browser-independent `src/audio/audio-event-map.js` contract for deciding which requested sound may play, which asset variant it resolves to, and how it is routed. Simulation, AI, campaign, UI, and rendering modules must request audio through domain events or later injected adapters instead of constructing `Audio`, `AudioContext`, media sources, or decode calls directly.

## Mixer graph

The mixer creates the browser graph lazily after a user gesture:

```text
music ───┐
sfx ─────┤
voice ───┼─> master ─> AudioContext.destination
ambience ┘
```

Every bus and the master expose independent bounded volume and mute state. The context is not constructed at module import or mixer creation time, avoiding autoplay-policy errors during startup.

## Unlock and lifecycle

- `unlock()` lazily creates the context and resumes it. It returns `false` and records a diagnostic when Web Audio is unavailable or blocked.
- `bindUnlock(target)` installs pointer, keyboard, and touch listeners and removes all of them after the first successful unlock.
- `pause()` and `resume()` suspend and resume the shared context; they do not mutate simulation time.
- `dispose()` stops active voices, disconnects the graph, closes the context, and becomes idempotent.
- Snapshots are deeply frozen and contain no browser node references.

## Bounded voice slots

`AudioBufferSourceNode` is one-shot and is never represented as reusable. The mixer instead pools a fixed number of reusable voice slots, each owning a gain node. Every play request creates a fresh buffer source, leases the lowest free slot, routes it to one bus, and releases the slot on end or stop.

When all slots are active, playback fails with `voice-limit`. The event-map policy may rank pending admissions, but UFR-124 does not steal, stop, or reprioritize already active voices invisibly.

## Event taxonomy and mapping

`AUDIO_EVENT_IDS` is the stable request vocabulary for combat, economy, unit feedback, mission outcomes, UI, ambience, music, and dialogue. A map created with `createAudioEventMap()` is deeply immutable, versioned by `AUDIO_EVENT_MAP_VERSION`, and contains one validated definition per mapped event ID.

Each definition declares:

- one mixer bus: `music`, `sfx`, `voice`, or `ambience`;
- priority from 0 through 100, with named background/low/normal/high/critical reference values;
- a cooldown in authoritative fixed ticks rather than wall-clock milliseconds;
- a concurrency group and positive simultaneous-voice limit;
- `none` or `linear` distance attenuation with explicit near/far distances and minimum gain;
- `shared`, `prefer`, or `require` faction-variation policy;
- stable shared and faction-specific asset IDs;
- `fallback`, `silent`, or `reject` behavior when no declared asset is available;
- a stable mixer tag used by later playback and stop policies.

The contract defines identities and deterministic policy only. UFR-126 through UFR-130 own actual assets and provenance; their manifests supply the available asset-ID set to the resolver.

## Deterministic resolution and admission

`resolveAudioEvent()` is a pure decision boundary. Given a frozen map, a request, and explicit read-only counters, it applies policy in this order:

1. validate the stable event ID, fixed tick, sequence, optional faction, distance, gain, and variant key;
2. reject requests still inside the event cooldown;
3. reject requests whose concurrency group is already at its limit;
4. compute deterministic distance attenuation and reject zero-gain requests;
5. select a faction-specific variant when permitted and available, otherwise use the shared group according to faction policy;
6. choose a variant deterministically from event ID, faction, and variant key;
7. apply the explicit missing-asset policy.

Successful results are reference-free playback descriptors containing asset ID, bus, priority, gain, tag, cooldown, and concurrency metadata. Rejections use stable reasons such as `unknown-event`, `cooldown`, `concurrency-limit`, `out-of-range`, `silent`, and `missing-asset`. Resolution never mutates last-played or active-count state.

`selectAudioAdmissions()` ranks already resolved requests by descending priority and then stable sequence/identity order. It admits only the supplied number of free mixer slots and marks excess requests `voice-capacity`; it never preempts an existing mixer voice. The same request and explicit state therefore produce the same result independently of rendering frame rate.

## Runtime integration boundary

A later audio runtime adapter may subscribe to `audio.request` domain events and translate their stable payloads into event-map requests. That adapter owns the read-only availability set, last-played tick table, active concurrency counts, listener/camera distance, accepted-admission bookkeeping, asset-buffer lookup, and the final `audioMixer.playBuffer()` call.

The adapter must preserve these constraints:

- simulation results do not depend on whether audio is installed or playback succeeds;
- cooldowns use the event's fixed simulation tick, not `Date.now()` or audio-context time;
- event sequence is the deterministic tie-breaker for equal priority;
- missing, locked, paused, unavailable, or voice-limited audio fails without throwing into gameplay;
- presentation consumers never mutate authoritative simulation state.

## Safe failure

The mixer returns stable reason codes for locked, unavailable, paused, missing-buffer, voice-limit, start-failed, and decode-failed conditions. Unlock, resume, pause, close, decode, and source-start exceptions are captured in a bounded diagnostic history rather than thrown through gameplay update paths. Invalid API calls still fail fast with type/range errors during development.

The event resolver separately fails closed for malformed definitions, invalid requests, unavailable variants, cooldown/concurrency rejection, inaudible distance, or capacity rejection. A fallback sound must be explicitly declared and available; fallback is never inferred from an unrelated asset.

## Ownership boundary

UFR-124 owns:

- context creation, unlock, suspend/resume, and disposal;
- master/music/SFX/voice/ambience routing;
- bus/master volume and mute;
- buffer decode;
- bounded voice-slot leasing and cleanup;
- reference-free diagnostics and inspection.

UFR-125 owns:

- stable audio-event taxonomy;
- immutable event-to-asset descriptors;
- priorities and deterministic pending-request admission;
- fixed-tick cooldown policy;
- concurrency-group policy;
- distance attenuation;
- faction-specific deterministic variation;
- explicit missing-asset fallback, silence, and rejection.

Later asset tasks own source files and provenance. A later runtime-integration owner must connect `audio.request` events, asset buffers, the event resolver, and the mixer without moving gameplay authority into audio. UFR-131 owns settings UI and persistence.

## Verification

```bash
node --check src/audio/audio-mixer.js
node --check src/audio/audio-event-map.js
node --check tests/audio/audio-mixer.test.mjs
node --check tests/audio/audio-event-map.test.mjs
node --test tests/audio/audio-mixer.test.mjs tests/audio/audio-event-map.test.mjs
bash verify.sh
```

Focused event-map tests cover frozen/versioned descriptors, taxonomy and bus validation, duplicate rejection, deterministic faction variants, shared fallback, fixed-tick cooldowns, concurrency groups, linear attenuation, missing-asset policies, priority admission, and malformed temporal state. Mixer fake-context tests cover lazy unlock, graph routing, user-gesture listener removal, volume/mute, bounded voice slots, slot reuse, filtered stop, pause/resume, decoding, unavailable/failed contexts, diagnostics, and disposal.

Browser completion checklist for a later runtime/asset integration:

1. unlock from pointer, keyboard, and touch without console/autoplay errors;
2. verify each bus and master mute/volume independently;
3. pause/resume while looping and one-shot sounds are active;
4. exceed event concurrency and mixer voice limits without crashes or leaked nodes;
5. verify faction variants, spatial attenuation, cooldown throttling, and missing-asset behavior;
6. switch tabs and resume according to later settings policy;
7. confirm unsupported/blocked Web Audio leaves gameplay functional.
