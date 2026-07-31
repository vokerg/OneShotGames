# Narrative presentation

UFR-092 defines the browser-independent presentation contract for mission dialogue, subtitles, portraits, speaker metadata, camera requests, skipping, interruption, and a retrievable dialogue log. The owner is `src/ui/narrative-presentation.js`.

## Relationship to mission scripting

UFR-086 remains the authoritative trigger/action owner. Its dialogue queue contains:

```text
tick, triggerId, speaker, text, portrait, durationSeconds, metadata
```

Its camera queue contains:

```text
tick, triggerId, x, y, zoom, durationSeconds, label
```

`ingestMissionNarrativeQueues()` consumes snapshots of those arrays without mutating them. It normalizes and freezes the cues, preserves authored order, and returns consumed counts so a runtime adapter can safely drain the authoritative queues after successful ingestion. The presentation reducer never evaluates triggers, changes objectives, moves the camera directly, or controls simulation time.

## Dialogue state

The immutable state contains:

- one active dialogue cue;
- an ordered pending queue;
- an ordered camera-cue queue;
- a bounded, retrievable dialogue log;
- a speaker registry and presentation settings;
- deterministic sequence and revision numbers.

When scripts omit a duration, reading time is derived from text length and clamped between configured minimum and maximum durations. No wall-clock API is used; callers advance the reducer with explicit elapsed seconds.

## Interruption policy

Each cue may use one explicit policy in `metadata.interruptionPolicy`:

- `queue` — preserve authored arrival order;
- `replace` — interrupt the active cue immediately;
- `priority` — interrupt only when the incoming numeric priority is higher, otherwise enter a stable priority queue;
- `drop` — discard the incoming cue while another cue is active.

Completed, skipped, interrupted, and dropped cues are recorded in the bounded log. Stable ordering uses priority, authored tick, and ingestion sequence.

## Skip and subtitle policy

Skipping requires both global skipping to be enabled and the active cue to be marked skippable. A rejected skip does not mutate state. Disabling subtitle visibility hides the active subtitle from the presentation snapshot but does not discard, pause, or alter the underlying cue. Audio ownership and subtitle accessibility settings remain with UFR-130/UFR-131.

## Speakers, portraits, and fictional framing

Speaker records contain stable IDs, labels, roles, optional faction and portrait IDs, and JSON-compatible metadata. A cue-level portrait overrides the speaker fallback.

A speaker marked as a public figure must also be explicitly marked fictionalized and include a non-empty content note. This is a presentation guard, not a claim that all authored text has passed the final UFR-104 content review. Mission copy must remain clearly dramatized fiction and must not present invented dialogue as factual reporting.

## Camera cues

Camera cues are ordered presentation requests. The snapshot exposes the next request, and an adapter acknowledges it only after applying or deliberately declining it. Camera input, interpolation, motion reduction, and gameplay interruption remain owned by later runtime/accessibility adapters.

## UI boundary

`narrativePresentationSnapshot()` targets the UFR-133 `notifications` HUD region. It exposes resolved speaker/portrait data, subtitle text and timing, queue/log counts, the next camera cue, and whether skip/log controls are available. It does not access the DOM, renderer, audio API, mission state, or input listeners.

## Verification

Run:

```bash
node --check src/ui/narrative-presentation.js
node --check tests/ui/narrative-presentation.test.mjs
node --test tests/ui/narrative-presentation.test.mjs
bash verify.sh
```

Browser verification becomes applicable when a later adapter mounts the model, drains UFR-086 queues, applies camera requests, and connects subtitle/audio settings. This task deliberately adds no DOM adapter or authored campaign dialogue.
