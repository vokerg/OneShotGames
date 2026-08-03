# UI SFX production

UFR-127 owns the original user-interface sound family and its presentation-only adapter. It does not own semantic UI state, browser controls, gameplay commands, save/load behavior, mission outcomes, or audio settings.

## Cue coverage

The versioned catalog at `assets/audio/ui/manifest.json` declares 17 one-shot cues covering:

- unit selection and acknowledgement;
- command confirmation and production queueing;
- production and research completion;
- unit/interface errors and urgent alerts;
- objective updates, victory, and defeat;
- menu navigation, confirmation, and cancellation;
- save and load completion.

Every entry records a stable cue and asset ID, UFR-125 event ID, family, synthesized bank slice, PCM format, canonical SHA-256, peak, one-shot policy, and complete provenance.

## Original synthesis

`src/audio/ui-sfx-synthesis.js` contains repository-owned tonal and filtered-noise recipes. No recording, sample library, generated-model output, package, or network input is used. The recipes produce three mono 16-bit PCM WAV banks at 16 kHz with an 0.86 peak ceiling.

Render review WAVs into `artifacts/ui-sfx/`:

```bash
node scripts/build-ui-sfx.mjs
```

Verify canonical metadata and generated banks:

```bash
node scripts/build-ui-sfx.mjs --check
node scripts/verify-ui-sfx.mjs
```

## Policy and runtime boundary

`src/audio/ui-sfx.js` validates the catalog and creates one exact-asset UFR-125 policy map per cue. Selection, acknowledgement, queue, completion, error, alert, objective, outcome, confirmation, and cancellation groups receive explicit priorities, fixed-tick cooldowns, and concurrency limits. UI cues use the `sfx` bus and no battlefield distance attenuation.

The same module provides a presentation runtime that:

1. synthesizes each bank locally;
2. validates declared byte length and optionally SHA-256;
3. decodes each bank once through UFR-124;
4. resolves and admits requests through UFR-125;
5. plays the declared bank slice;
6. records preload failures and permits retry.

`installUiSfxDomainAdapter()` consumes only `audio.request` payloads shaped as `{ cue, gain?, variantKey? }`. Tick and sequence come from the immutable domain event. Malformed requests return `invalid-request`, and injected presentation errors never escape through the event stream.

UFR-127 does not add UI event producers or install an assembled browser lifecycle. UI owners may request these cues after their authoritative navigation, command, queue, save/load, or mission-result action succeeds. A later composition task must own the shared mixer, unlock lifecycle, event stream, and exact teardown.

## Failure behavior

Unavailable, malformed, hash-mismatched under strict checking, undecodable, locked, paused, cooldown-limited, concurrency-limited, or voice-limited UI audio fails closed. Audio absence never changes focus, screen-stack state, commands, save/load state, mission outcomes, or gameplay.
