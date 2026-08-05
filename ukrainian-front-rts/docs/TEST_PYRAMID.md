# Test pyramid

`./verify.sh` is the authoritative local gate. It performs syntax checks, runs every `tests/**/*.test.mjs` file, and executes the specialized content, architecture, determinism, art, audio, accessibility, and runtime-composition verifiers. GitHub Actions then adds browser smoke and diagnostic artifact capture.

The executable layer contract lives in `scripts/lib/test-pyramid.mjs`. `scripts/verify-test-pyramid.mjs` and `tests/tooling/test-pyramid.test.mjs` fail when a required layer loses its representative tests, production boundary, CI invocation, or diagnostics path.

## Layers

| Layer | Ownership and expectation | Focused command |
| --- | --- | --- |
| Pure logic | Fast deterministic functions and public state transitions. No DOM, canvas, network, wall clock, or shared mutable fixture state. | `node scripts/run-tests.mjs unit` |
| Systems | Subsystem behavior across combat, economy, navigation, AI, input, campaign, and application adapters. Include success, rejection, and no-mutation-on-failure cases. | `node scripts/run-tests.mjs combat economy navigation ai campaign` |
| Headless scenarios | Whole scenarios driven through `src/app/simulation-harness.js` with explicit seeds, public commands, fixed ticks, and reference-free snapshots. | `node scripts/run-tests.mjs sim` |
| Save round trips | Versioned campaign envelopes and browser-storage adapters. Assert serialization, restore transactions, corruption handling, storage failures, and deterministic manual/autosave slots. | `node scripts/run-tests.mjs campaign-save` |
| Content validation | Schema, reference, technology graph, production content, and runtime reconciliation. Failures must identify the owning file and invalid field/reference. | `node scripts/verify-content.mjs` (also included in `./verify.sh`) |
| Browser smoke | Real Chromium startup, mission selection/start, modal menu isolation, settings persistence, focus restoration, and browser/runtime error capture. | `node scripts/browser-startup-smoke.mjs` |

## Determinism policy

Pure, system, and headless scenario tests must not consume ambient randomness. Tests that touch simulation randomness set or derive an explicit seed and restore global deterministic services before completion. Scenario assertions use fixed tick counts rather than elapsed wall-clock time. Save tests compare reference-free serialized state rather than object identity.

## Browser diagnostics

The GitHub Actions workflow executes the browser smoke after the assembled verifier. A passing run writes `artifacts/browser-startup-smoke.json`. A browser failure attempts `artifacts/browser-startup-failure.png` and always writes `artifacts/browser-startup.log`. The workflow uploads the entire `ukrainian-front-rts/artifacts/` directory for review.

Browser smoke is intentionally outside `./verify.sh` because it requires a Chrome/Chromium executable. The test-pyramid audit verifies that the workflow still invokes it and uploads diagnostics, preventing silent loss of this layer.

## Adding coverage

Place the test at the lowest layer that can prove the behavior. Prefer pure logic over a system fixture, a system fixture over a full scenario, and a headless scenario over a browser flow. Use browser coverage only for composition, storage, focus, accessibility, rendering, or interaction behavior that cannot be proven below the DOM boundary.

When introducing a new release-critical subsystem, add representative evidence to `TEST_PYRAMID` only when the existing layer roots cannot discover it. Do not duplicate the full test inventory in the manifest; it is a contract for layer presence and critical boundaries, not a manually maintained test list.
