# Audio architecture

UFR-124 establishes `src/audio/audio-mixer.js` as the sole Web Audio lifecycle and routing owner. UFR-125 adds the browser-independent `src/audio/audio-event-map.js` contract for deciding which requested sound may play, which asset variant it resolves to, and how it is routed. UFR-126 adds the original combat-SFX catalog, deterministic synthesis source, and presentation-only `audio.request` adapter. Simulation, AI, campaign, UI, and rendering modules must request audio through domain events or injected adapters instead of constructing `Audio`, `AudioContext`, media sources, or decode calls directly.

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

The contract defines identities and deterministic policy only. UFR-126 through UFR-130 own actual assets and provenance; their catalogs supply the available asset-ID set to the resolver.

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

## Combat-SFX assets and synthesis

`assets/audio/combat/manifest.json` is the versioned UFR-126 catalog for weapon, impact, explosion, vehicle, drone, artillery, air-defense, destruction, repair, and construction cues. Every cue records a stable asset ID, family, event-map ID, packed-bank slice, PCM format, peak ceiling, canonical SHA-256, one-shot policy, and complete provenance.

`src/audio/combat-sfx-synthesis.js` contains the original repository-owned recipes. It generates three compact mono 16-bit PCM WAV banks without external recordings, sample libraries, model output, network access, or package dependencies. `scripts/verify-combat-sfx.mjs` regenerates the canonical Node output in memory and verifies manifest equality, WAV headers, format, hashes, and clipping limits. Reviewable WAV files can be emitted to `artifacts/combat-sfx/` with `scripts/build-combat-sfx.mjs` but are not source-controlled duplicates of the recipes.

## Runtime integration boundary

`src/audio/combat-sfx-catalog.js` validates the combat manifest and creates one exact-asset UFR-125 policy map per declared cue. `src/audio/combat-sfx-runtime.js` synthesizes the banks, optionally checks their digests, decodes each bank once through the mixer, resolves and admits a cue, then plays the declared offset/duration through the `sfx` bus.

`installCombatSfxDomainAdapter()` subscribes to `audio.request` and accepts `{ cue, faction?, distance?, gain?, variantKey? }`. It derives tick and sequence from the immutable domain event. The adapter owns no authoritative state and contains malformed payloads or injected playback exceptions at the presentation boundary.

UFR-126 deliberately does not add combat-system producers or install an assembled application lifecycle. Authoritative systems may emit a declared cue only after their gameplay mutation succeeds. A later composition owner must construct one shared domain stream, mixer, combat-SFX runtime, unlock lifecycle, and exact teardown.

All audio adapters must preserve these constraints:

- simulation results do not depend on whether audio is installed or playback succeeds;
- cooldowns use the event's fixed simulation tick, not `Date.now()` or audio-context time;
- event sequence is the deterministic tie-breaker for equal priority;
- missing, malformed, locked, paused, unavailable, or voice-limited audio fails without throwing into gameplay;
- presentation consumers never mutate authoritative simulation state.

## Safe failure

The mixer returns stable reason codes for locked, unavailable, paused, missing-buffer, voice-limit, start-failed, and decode-failed conditions. Unlock, resume, pause, close, decode, and source-start exceptions are captured in a bounded diagnostic history rather than thrown through gameplay update paths. Invalid direct mixer API calls still fail fast with type/range errors during development.

The event resolver separately rejects unavailable variants, cooldown/concurrency conflicts, inaudible distance, and capacity exhaustion. The UFR-126 runtime translates malformed request validation into `invalid-request`, records bank preload failures in its frozen snapshot, permits a later preload retry, and ensures its domain subscriber does not throw through the event stream. A fallback sound must be explicitly declared and available; fallback is never inferred from an unrelated asset.

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

UFR-126 owns:

- original combat-SFX recipes and provenance;
- the versioned combat asset/slice catalog;
- canonical synthesis verification and review-bank tooling;
- exact cue-to-UFR-125 policy mapping;
- combat-bank preload/decode, availability, and playback adapter behavior;
- the combat `audio.request` presentation subscriber.

Later asset tasks own UI SFX, ambience, music, and voice assets and their provenance. A later runtime-integration owner must compose all selected asset families with the event resolver and mixer without moving gameplay authority into audio. UFR-131 owns settings UI and persistence.

## Verification

```bash
node --check src/audio/audio-mixer.js
node --check src/audio/audio-event-map.js
node --check src/audio/combat-sfx-synthesis.js
node --check src/audio/combat-sfx-catalog.js
node --check src/audio/combat-sfx-runtime.js
node --test tests/audio/audio-mixer.test.mjs tests/audio/audio-event-map.test.mjs tests/audio/combat-sfx.test.mjs
node scripts/build-combat-sfx.mjs --check
node scripts/verify-combat-sfx.mjs
bash verify.sh
```

Focused combat-SFX tests cover catalog/provenance validation, duplicate and unsafe-reference rejection, stable PCM generation, peak bounds, exact cue mapping, synthesis preload/decode/playback, optional digest rejection, transient preload recovery, malformed request containment, and exact event-adapter disposal.

Browser completion checklist for a later assembled audio integration:

1. unlock from pointer, keyboard, and touch without console/autoplay errors;
2. audibly review every combat cue at intended listener distances and representative concurrency;
3. verify each bus and master mute/volume independently;
4. pause/resume while looping and one-shot sounds are active;
5. exceed event concurrency and mixer voice limits without crashes or leaked nodes;
6. verify spatial attenuation, cooldown throttling, and missing-asset behavior;
7. switch tabs and resume according to later settings policy;
8. confirm unsupported/blocked Web Audio leaves gameplay functional.
