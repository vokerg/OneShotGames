# Release performance budgets

UFR-151 turns the existing profiler and subsystem limits into one versioned release gate. The machine-readable contract is `src/app/release-performance-budget.js`; it does not own simulation timing, rendering, pathfinding, AI, audio, saves, or atlas caches.

## RC1 budgets

| Surface | Budget | Measurement source |
| --- | ---: | --- |
| Mission selector interactive | <= 8,000 ms | browser/startup timing |
| First mission ready | <= 12,000 ms | browser/startup timing |
| Frame p95 | <= 25 ms | `createPerformanceProfiler()` / renderer warning budget |
| Simulation phase p95 | <= 10 ms | frame profiler |
| Render phase p95 | <= 20 ms | frame profiler |
| UI phase p95 | <= 5 ms | frame profiler |
| AI decision interval | <= 180 ticks | profiler tactical-AI diagnostics |
| Tracked path requests | <= 512 | path-service diagnostics |
| Path cache entries | <= 512 | path-service diagnostics |
| Path failures | 0 | path-service diagnostics |
| Decoded support frames | <= 192 | support atlas LRU budget |
| Mixer voice ceiling | <= 32 | mixer diagnostics |
| Serialized save | <= 2 MiB | save payload byte length |
| Save round trip | <= 250 ms | capture + serialize + parse + restore measurement |
| Stress workload | >= 200 live units | profiler entity count |
| Stress frame p95 | <= 25 ms | profiler under stress workload |
| Stress memory proxy | <= 96 MiB | profiler deterministic memory proxy |

The 25 ms renderer warning and 192-frame support cache are pre-existing production limits from UFR-123. The 32-voice ceiling matches the composed mixer default. The remaining RC1 limits are intentionally generous enough for GitHub CI/browser variance while still catching order-of-magnitude regressions and unbounded caches.

## Gate semantics

`createReleasePerformanceMeasurement()` consumes the existing read-only profiler snapshot plus startup, atlas, and save measurements. It fails closed if pathfinding, AI, or audio diagnostics are unavailable. `evaluateReleasePerformanceMeasurement()` returns every check and concrete failures; `assertReleasePerformanceMeasurement()` is the CI-facing hard gate.

The 200-unit requirement is a minimum workload, not a cap. A report with excellent frame time but only 199 units fails. Likewise, unavailable path/AI/audio diagnostics do not silently pass.

## Current deterministic evidence

`tests/app/release-performance-budget.test.mjs` exercises the real profiler aggregation path with 120 frames and 200 live unit records. The fixture feeds path-service, tactical-AI, and audio diagnostics through the same adapters used by the runtime profiler, then verifies the complete RC1 report. Separate regression cases breach frame, path failure, atlas cache, save-size, and stress-unit thresholds and assert that each subsystem is named in the failure report.

The full repository verifier discovers this test automatically, alongside existing visual-performance, save, audio, pathfinding, AI, browser-startup, and assembled-runtime checks. The release budget does not replace those focused tests; it composes their limits into a release decision contract.

## Profiling and optimization decisions

The current code already contains the major concrete performance mitigations required by the release candidate:

- viewport culling for units/buildings/nodes/projectiles/effects;
- a bounded 192-frame support-atlas LRU;
- a bounded 120-frame profiler history with 4 Hz expensive diagnostic sampling;
- bounded path-service caches/request tracking exposed through diagnostics;
- a 32-voice audio mixer ceiling;
- deterministic, versioned save envelopes rather than unconstrained object-graph serialization.

UFR-151 therefore does not add speculative gameplay or renderer rewrites. A future failure must first identify the breached check and profiler evidence, then optimize the owning subsystem without changing gameplay semantics.

## Hardware and evidence limits

Wall-clock numbers vary by runner and browser. RC1 startup/save limits are release ceilings, not claims about typical latency. The deterministic CI test validates the budget contract and integrated profiler paths; existing browser smoke validates that the composed application starts and deploys a mission. UFR-154 remains the dedicated headed-browser QA pass for human-visible pacing, interaction latency, and full release-candidate soak evidence.

When UFR-154 or later release work records browser performance, use the same budget IDs and attach the measurement artifact to the PR rather than inventing a second threshold set.
