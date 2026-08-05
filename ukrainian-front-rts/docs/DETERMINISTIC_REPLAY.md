# Deterministic replay recording and playback

UFR-147 owns replay serialization and playback diagnostics. Replays use the existing deterministic simulation harness; they do not create a second simulation clock or persistence path.

## Format

`src/core/replay.js` defines `fields-of-resolve.replay` version 1. A replay contains:

- compatibility metadata: game version, build commit, content version, mission index, fixed tick duration, viewport, and seed;
- a stable event stream ordered by tick and sequence;
- command events with the public command payload and recorded result;
- authored choice events for campaign, doctrine, or other non-command decisions;
- periodic deterministic state checksums;
- final tick and outcome metadata.

Replay JSON is canonicalized by recursively sorting object keys and rejecting non-finite or non-JSON values. The checksum is a stable 32-bit FNV-1a digest of that canonical JSON representation.

## Recording

`createReplaySimulationRuntime()` wraps the public `simulation-harness.js` boundary. It records the initial checksum, every issued command, explicit choices, periodic checksums, and a final checksum/outcome. The seed passed to `startScenario()` is preserved in the header; the derived runtime seed is included in metadata for diagnostics.

The replay layer does not call `game.update()` directly. Tick advancement remains owned by the simulation harness, which delegates to the sole simulation clock.

## Playback and divergence

`playReplay()` creates a fresh harness, starts the recorded mission and seed, applies events in stable sequence order, and compares:

- recorded command results with playback command results;
- recorded state checksums with canonical playback snapshots.

Playback can stop at the first divergence or collect multiple divergences. A divergence records the tick, subsystem label, expected checksum, and actual checksum.

Compatibility checks fail closed when the requested game or content version does not match the replay header.

## Timeline scrubbing

`createReplayPlaybackSession()` supports absolute seek, normalized scrub, and relative step. Seeking reconstructs state from tick zero through the requested tick. This is intentionally deterministic and simple; checkpoint acceleration may be added later without changing the replay format.

## Defect reports

On divergence, playback emits a `fields-of-resolve.replay-defect` version-1 report containing:

- the complete validated replay;
- replay and actual-state checksums;
- compatibility metadata;
- the first divergence record;
- optional diagnostic notes.

This report is self-contained and suitable for attaching to a bug without serializing live game objects or bypassing existing save services.
