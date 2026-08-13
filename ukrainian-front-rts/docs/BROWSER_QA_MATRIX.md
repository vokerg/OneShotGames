# Browser QA matrix

UFR-154 defines the release browser-compatibility evidence boundary for Fields of Resolve. The machine-readable source of truth is `release/browser-qa-matrix.json`.

## Current UFR-154 status

UFR-154 is **incomplete**. PR #241 established a Chromium-oriented QA contract and documentation, but it was merged before the task had the completion evidence required by `docs/FEATURE_CONVEYOR.md`. The corrective work is tracked by #245.

The highest defensible evidence level is currently `CONTRACT_COMPLETE`. Edge, Firefox, and Safari remain blocking headed-release evidence because no executed browser pass has been recorded for those rows. Do not create `tasks/completed/UFR-154.md`, mark the corrective PR ready, or describe UFR-154 as `PLAYER_VERIFIED`/`RELEASE_VERIFIED` until those passes are recorded or an explicit maintainer waiver names the unavailable checks and blocking follow-up.

The real-screen review that exposed this evidence gap also found known visual defects #242, #243, and #244. Those defects remain separate UI work; a green synthetic/Art-Lab capture is not evidence that the affected operation selector, Skirmish setup, or live HUD layout is release-clean.

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

`bash verify.sh` validates that the matrix remains structurally complete and fail-closed through `tests/release/browser-qa-matrix.test.mjs`. GitHub CI provides automated Chromium evidence. That automation is a baseline, not a substitute for the missing headed Edge, Firefox, and Safari release passes and not a substitute for real-screen visual QA of shipped UI flows.

Until the blocking browser evidence is recorded or explicitly waived under the conveyor rules, `release/browser-qa-matrix.json` must keep `taskState: "incomplete"` and `highestEvidenceLevel: "CONTRACT_COMPLETE"`.
