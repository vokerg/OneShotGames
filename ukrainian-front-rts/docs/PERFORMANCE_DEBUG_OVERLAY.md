# Performance profiler and debug overlay

UFR-150 adds a read-only profiler at the browser runtime boundary. It measures the assembled frame without changing fixed-step scheduling, simulation order, renderer ownership, UI refresh behavior, pathfinding, AI decisions, audio routing, commands, or save data.

## Access

- Press **F3** to show or hide the overlay.
- F3 is ignored while focus is in an input, textarea, select, or editable element.
- The close button hides the overlay without disposing the profiler.
- Visibility is intentionally transient: it is not persisted and F3 is not routed through the player action-map or remapping settings.
- The overlay starts hidden and injects its own diagnostic-only markup and styles. No production HUD region or shared UI stylesheet is required.
- `window.__fieldsOfResolvePerformance` exposes read-only `snapshot()`, `visible()`, `setVisible()`, and `toggle()` diagnostics while the runtime is installed. Runtime teardown restores any previous value exactly.

## Measurements

The runtime records request-animation-frame delta plus the measured time spent in:

1. fixed-step simulation advancement;
2. battlefield rendering;
3. UI refresh.

The profiler retains 120 frame timing samples and reports latest, average, maximum, and p95 values. Detailed subsystem snapshots are produced at most every 250 ms so entity inspection and percentile calculation do not become per-frame overhead.

The immutable snapshot also includes:

- fixed-step tick, steps executed, interpolation alpha, accepted time, and discarded catch-up time;
- unit, building, resource-node, projectile, effect, living-entity, selected-entity, and total counts;
- UFR-022 path-service requests, searches, tracked requests, cache entries, hits, misses, throttles, failures, invalidations, and evictions;
- UFR-079 tactical-AI tick, cadence, next decision, retained contact count, active goals, and assigned commands;
- UFR-124 mixer state, active/max voice counts, pause state, and master mute state when the assembled composition exposes an audio mixer snapshot;
- an explicitly approximate memory proxy based on bounded entity/path record weights, plus Chromium heap counters when `performance.memory` is available;
- active simulation seed;
- active order counts, selected-entity orders and targets, build targeting, pressed keys, attack-move targeting, and the current command error.

## Unavailable capabilities

Optional browser and subsystem diagnostics fail closed:

- before a mission creates navigation state, path metrics display `unavailable`;
- before tactical AI is installed, AI metrics display `unavailable`;
- when no runtime mixer is composed, audio metrics display `unavailable`;
- browsers without `performance.memory` continue to show the deterministic memory proxy;
- exceptions from optional path, AI, audio, or heap inspection are converted into unavailable diagnostics and never mutate authoritative state.

The default audio bridge reads `window.__fieldsOfResolveComposition.audio().mixer` when that contract exists. This keeps UFR-150 independent of audio installation order while automatically consuming the UFR-131 composition diagnostic after it is merged.

## Ownership and evidence boundary

- `src/app/runtime.js` owns frame timing, overlay DOM lifecycle, keyboard registration, and teardown because frame scheduling and lifecycle belong to the application layer.
- `src/app/performance-profiler.js` owns immutable aggregation, bounded history, subsystem projections, formatting, and memory proxies.
- Source systems remain authoritative. The profiler only consumes public `metrics()`/snapshot APIs and ordinary presentation state.
- The overlay is debug-only and is not serialized, replayed, localized as player-facing production UI, or used to make gameplay decisions.

Automated tests verify timing aggregation, bounded history, sampling cadence, path/AI/audio projections, restricted-API failure, F3 behavior, editable-target exclusion, DOM/global restoration, runtime restart, and mission reset. Browser startup smoke verifies that the assembled runtime can install the hidden overlay without startup warnings. Human performance diagnosis and release budget closure remain with UFR-151.
