# Voice pipeline

UFR-130 defines a provenance-safe, presentation-only voice-hook pipeline for Fields of Resolve. The pipeline consumes UFR-125 audio-event policy, uses the UFR-124 `voice` bus when a binary asset is available, and coordinates with the UFR-092 narrative model without importing UI code or taking ownership of dialogue text.

## Hook-first delivery

The initial catalog is deliberately hook-first. It includes no recorded or generated speech binaries. Every entry still defines the complete contract required by a later production recording or synthetic-voice pass:

- stable hook, variant, speaker, language, event, and concurrency identities;
- English and Ukrainian subtitle variants;
- deterministic fixed-tick repetition policy;
- voice/subtitle/speaker-label preferences;
- optional binary path, duration, SHA-256, and mixer routing fields;
- creator, source, license, redistribution, tool, external-input, correction, and public-figure metadata.

Hook-only entries remain useful now: unit acknowledgements and under-attack alerts produce localized accessible subtitles, while campaign dialogue preserves the authored UFR-092 text and speaker label. A composition owner may attach reviewed binary assets later without changing gameplay or narrative authority.

## Ownership boundaries

`src/audio/voice-pipeline.js` owns:

- catalog, speaker, language, source, and provenance validation;
- exact/regional/declared/default language fallback;
- deterministic variant selection and recent-variant avoidance;
- fixed-tick repetition windows and retry ticks;
- voice opt-out independent from subtitle opt-out;
- optional speaker labels;
- future binary preload/decode/playback through the shared mixer;
- fail-closed domain-event subscription and exact teardown.

It does not own:

- mission dialogue text, timing, interruption, queueing, skipping, or logs — UFR-092 remains authoritative;
- simulation alerts, orders, objectives, or campaign results;
- Web Audio context creation, unlock, pause, volume, or global disposal — UFR-124 remains authoritative;
- UI settings controls or persistence — UFR-131 owns those surfaces;
- broad localization or player-facing string externalization — UFR-143 owns that work.

## Language fallback

Language tags are normalized to lower-case BCP-47-like identifiers. Resolution is deterministic:

1. exact requested tag;
2. base language for a regional request;
3. declared fallbacks for a known catalog language;
4. catalog default language.

The shipped catalog declares `en` and `uk`; Ukrainian falls back to English. Each hook must include both languages, and the validator rejects cycles, unknown fallback references, duplicate language IDs, or missing default-language coverage.

## Repetition policy

Repetition uses authoritative fixed ticks rather than wall-clock time. Each hook declares a window, maximum play count, recent-variant avoidance depth, and whether history is keyed by the hook or by a request identity.

- Unit acknowledgements permit two deliveries per 120 ticks and avoid the immediately previous variant.
- Under-attack alerts permit one delivery per 180 ticks.
- Campaign dialogue is keyed by narrative cue ID, so distinct lines never suppress each other while duplicate delivery of the same cue is rejected.

The resolver is pure and receives history explicitly. The runtime records history only when a subtitle is visible or a voice actually plays.

## Subtitles, labels, and opt-out

Voice, subtitles, and speaker labels are independent preferences:

- disabling voice never disables subtitles;
- disabling subtitles never prevents an available voice asset from playing;
- disabling labels removes only the displayed speaker label;
- disabling both voice and subtitles produces no delivery and does not consume repetition history.

Unknown dynamic campaign speakers are subtitle-only until a reviewed speaker profile explicitly permits voice. Public-figure speaker profiles must be voice-disabled, and binary variants for public figures are rejected. Every source additionally forbids public-figure impersonation in provenance metadata.

## Binary asset extension

A future `synthetic` or `recorded` variant must declare a safe relative `.wav`, `.ogg`, or `.mp3` path, lowercase SHA-256, positive duration, and complete provenance. `createVoicePipeline()` accepts injected asset loading and digest functions, decodes through the shared mixer, resolves the request through the exact UFR-125 event ID, and plays through the `voice` bus with the declared concurrency tag.

Missing loaders, digest mismatch, decode failure, unavailable assets, mixer inspection failure, voice limits, malformed requests, and playback exceptions remain presentation failures. They do not escape into gameplay; an enabled subtitle may still deliver the request.

## Domain and narrative adapters

`installVoiceDomainAdapter()` listens only to `audio.request` payloads carrying `voiceHookId`. Tick and sequence come from the immutable domain event. Malformed payloads and runtime exceptions are contained, and the returned disposer removes exactly that subscription.

`createNarrativeVoiceRequest()` converts a generic UFR-092-compatible dialogue cue into the dynamic `campaign.dialogue` hook. It copies stable cue identity, tick, sequence, speaker, label, and authored text without mutating or importing the narrative model.

## Evidence level

UFR-130 reaches `CONTRACT_COMPLETE`. The hook catalog, language/repetition/accessibility policy, optional mixer boundary, provenance checks, tests, verifier, and documentation are complete. The assembled application does not yet install the pipeline or include audible speech assets, so this task does not claim `RUNTIME_INTEGRATED` or `PLAYER_VERIFIED`.

## Verification

```bash
node --check src/audio/voice-pipeline.js
node --check scripts/verify-voice-hooks.mjs
node --test tests/audio/voice-pipeline.test.mjs
node scripts/verify-voice-hooks.mjs
bash verify.sh
```
