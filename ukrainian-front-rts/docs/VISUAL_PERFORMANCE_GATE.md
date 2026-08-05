# Visual performance and memory gate

UFR-123 owns the release-time visual integration gate. It measures the assembled renderer without moving simulation logic into rendering code.

## Runtime ownership

- `src/render/visual-performance-gate.js` owns deterministic culling plans, stable atlas grouping, memory estimates, frame summaries, budget evaluation, and release-scene coverage.
- `src/render/visual-performance-runtime.js` executes an atlas plan through existing `sprite-atlas-runtime.js` instances and records frame telemetry.
- Existing atlas manifests and visual-regression scene catalogs remain the source of truth for assets and coverage.

## Default budgets

The version-1 budget targets 60 FPS and enforces:

- p95 frame time at or below 16.67 ms;
- p99 frame time at or below 25 ms;
- no more than 1,400 draw calls, 96 atlas batches, or 1,200 visible sprites in a measured frame;
- no more than 128 MiB decoded texture memory and 256 MiB total decoded visual-asset memory;
- zero procedural fallback draws, zero degraded atlas runtimes, and zero frames rendered with image smoothing enabled.

Budgets are explicit data and may be overridden by a target-browser profile. Overrides are validated and included in the resulting report.

## Batching and culling

`createAtlasRenderPlan()` rejects malformed drawables, culls world-space bounds outside the viewport, and sorts visible entries by layer, atlas, and stable ID. Consecutive entries on the same layer and atlas form a batch. The plan records submitted, visible, culled, draw-call, batch, and procedural-fallback counts.

`executeAtlasRenderPlan()` runs only visible batches, requires every atlas runtime, rejects degraded runtimes, and applies the existing nearest-neighbor context configuration before drawing.

## Memory accounting

`estimateAtlasMemory()` validates every sprite-atlas manifest, deduplicates shared texture images, accounts for RGBA decoded texture bytes, and adds a fixed frame-metadata estimate. This is a deterministic release gate, not a browser heap profiler.

## Release-scene policy

`validateReleaseSceneCoverage()` requires a result for every scene in `visual-regression-scenes.js`. A release scene is invalid when it uses a procedural fallback, a degraded atlas, or image smoothing. Performance samples are aggregated with deterministic nearest-rank p95 and p99 calculations.

Measured browser runs should feed their frame samples into `createVisualPerformanceProbe()` and archive the resulting report with the release evidence.
