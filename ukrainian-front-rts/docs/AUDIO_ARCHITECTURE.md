# Audio architecture

UFR-124 establishes `src/audio/audio-mixer.js` as the sole Web Audio lifecycle and routing owner. Simulation, AI, campaign, UI, and rendering modules must request audio through later adapters instead of constructing `Audio`, `AudioContext`, media sources, or decode calls directly.

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

When all slots are active, playback fails with `voice-limit`. UFR-125 may decide which events deserve admission, cooldown, or priority, but UFR-124 does not steal or reprioritize voices invisibly.

## Safe failure

The mixer returns stable reason codes for locked, unavailable, paused, missing-buffer, voice-limit, start-failed, and decode-failed conditions. Unlock, resume, pause, close, decode, and source-start exceptions are captured in a bounded diagnostic history rather than thrown through gameplay update paths. Invalid API calls still fail fast with type/range errors during development.

## Ownership boundary

UFR-124 owns:

- context creation, unlock, suspend/resume, and disposal;
- master/music/SFX/voice/ambience routing;
- bus/master volume and mute;
- buffer decode;
- bounded voice-slot leasing and cleanup;
- reference-free diagnostics and inspection.

UFR-125 owns event taxonomy, event-to-asset mapping, priorities, cooldowns, concurrency rules, distance attenuation, faction variation, and missing-asset fallback. Later asset tasks own source files and provenance. UFR-131 owns settings UI and persistence.

## Verification

```bash
node --check src/audio/audio-mixer.js
node --check tests/audio/audio-mixer.test.mjs
node --test tests/audio/audio-mixer.test.mjs
bash verify.sh
```

Focused fake-context tests cover lazy unlock, graph routing, user-gesture listener removal, volume/mute, bounded voice slots, slot reuse, filtered stop, pause/resume, decoding, unavailable/failed contexts, diagnostics, and disposal.

Browser completion checklist:

1. unlock from pointer, keyboard, and touch without console/autoplay errors;
2. verify each bus and master mute/volume independently;
3. pause/resume while looping and one-shot sounds are active;
4. exceed the voice limit without crashes or leaked nodes;
5. switch tabs and resume according to later settings policy;
6. confirm unsupported/blocked Web Audio leaves gameplay functional.
