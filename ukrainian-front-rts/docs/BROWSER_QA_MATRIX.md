# Browser QA matrix

UFR-154 defines the release browser-compatibility evidence boundary for Fields of Resolve. The machine-readable source of truth is `release/browser-qa-matrix.json`.

## Supported desktop browsers

| Browser | Release status | Automated evidence | Required headed release pass |
| --- | --- | --- | --- |
| Chrome / Chromium | Supported | Yes, authoritative Ubuntu CI | Recommended final soak |
| Microsoft Edge | Supported | Shared Chromium-engine contract only | Required on Windows |
| Mozilla Firefox | Supported | No dependency-free cross-browser driver is installed | Required on current stable Firefox |
| Safari | Supported where feasible | Not available on Ubuntu CI | Required on current stable Safari/macOS |

A browser is not marked verified merely because it shares web-platform APIs with Chrome. Rows without executed browser evidence remain `manual-release` in the machine-readable matrix and therefore cannot be mistaken for automated passes.

## Required surfaces

Every headed release pass must exercise all seven surfaces below.

1. **Keyboard:** selection, right-click orders, attack-move, minimap navigation, WASD, configurable bindings, editable-field exclusion, and focus-loss behavior.
2. **Audio:** first-interaction unlock, mute and per-bus volume, pause/resume, background-tab behavior, repeated-event throttling, and absence of autoplay-policy errors.
3. **Canvas:** mission startup, terrain/unit/effect rendering, resizing, supported zoom levels, fullscreen transitions, and no smoothing or blank-frame regressions.
4. **Storage:** campaign/profile save-load, settings persistence, migration/unsupported-version messaging, recovery export/reset boundaries, and no silent destructive overwrite.
5. **Fullscreen:** enter/exit from the runtime control, keyboard escape behavior, resize propagation, camera-center preservation, and input recovery after transition.
6. **DPI:** normal and high-DPI backing-store sizing, browser zoom changes, UI readability, cursor/input alignment, and state preservation through resize.
7. **Performance:** mission-selector and first-mission startup, visible frame pacing, input latency under normal play, and the UFR-151 RC1 budget identifiers where measurable.

## Current automated Chrome/Chromium evidence

The repository workflow currently executes the assembled verifier plus dedicated Chrome/Chromium browser checks. `browser-startup-smoke.mjs` covers startup, mission deployment, runtime interaction, canvas/storage behavior, and diagnostics. `browser-audio-release-smoke.mjs` covers autoplay/unlock and mixer behavior. `browser-accessibility-settings-smoke.mjs` covers key rebinding, focus pause, and accessibility settings. `browser-localization-smoke.mjs` covers persisted locale behavior. Viewport/runtime tests cover fullscreen and device-pixel-ratio state preservation, visual regression smoke exercises rendered output, and UFR-151 supplies the release performance budget contract.

These checks establish the automated Chromium baseline; they do not constitute Firefox, Edge, or Safari execution evidence.

## Manual release worksheet

For each non-automated browser, record browser name/version, operating system/version, display scale/DPI, viewport, test build/commit, and tester. Mark each required surface PASS, FAIL, or N/A with an explanation. Any browser-specific exception must name the affected surface, reproduction steps, severity, workaround if any, and owning defect before release sign-off.

Edge should be exercised on Windows because OS/browser integration and fullscreen/audio behavior can differ from generic Chromium CI. Firefox must receive a headed pass because the current dependency-free smoke harness is CDP-specific. Safari must receive a macOS pass because it is unavailable on the authoritative Ubuntu runner and has browser-specific media/fullscreen/storage behavior.

## Release boundary

`bash verify.sh` validates that the matrix remains complete and fail-closed through `tests/release/browser-qa-matrix.test.mjs`. GitHub CI provides automated Chromium evidence. UFR-154 does not claim headed Firefox, Edge, or Safari execution until those runs are actually recorded; later release-candidate QA may attach those results without changing the matrix schema.
