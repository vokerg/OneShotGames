# RECOVERY-109 — Authoritative verification baseline

- Owning issue: #109
- Pull request: #117
- Evidence level: `RUNTIME_INTEGRATED`
- Base used for implementation: `65f8d244f6dea897f6822c5a30cd8f2db48a2583`
- Current merge target tested by the pull-request workflow: `main` including `45538c3b94e7cb01574c0318b579b2494995f6ab`
- Passing implementation head: `f0dc21d391cb770825be9192781d7ee12628359c`
- Passing workflow run: `30712082848`
- Passing workflow job: `91401182175`
- Diagnostics artifact: `8822191291` (`ukrainian-front-rts-verification-30712082848`)

## Delivered

- One authoritative GitHub workflow invokes `bash verify.sh` with `pipefail` and retains the complete combined log.
- The active-claim diagnostic rejects duplicate task claims and inaccurate branch-state assertions.
- Headless Chromium loads the actual application, waits for mission selection, starts the first mission, validates the canvas and mission state, rejects fatal browser/runtime/application-resource failures, and preserves failure diagnostics.
- The browser server treats only Chrome's implicit `/favicon.ico` probe as optional and retries transient profile cleanup locks.
- The completion-evidence audit remains diagnostic for historical records while preserving current evidence visibility.
- Baseline contract drift was repaired without adding gameplay scope: research resource projection, target-line normalization, canonical fixtures, simulation-phase fixtures, polymorphic technology references, seeded-damage verification, and architecture-layer registration.
- `docs/ARCHITECTURE.md` now matches the executable layer registry and shared-contract exceptions.

## Verification evidence

Workflow run `30712082848` passed every mandatory step:

- full assembled verifier: passed;
- active-claim diagnostics: passed;
- browser startup and first-mission smoke: passed;
- completion-evidence audit: passed;
- diagnostic artifact upload: passed.

The retained assembled-verifier log records:

- 754 tests passed, 0 failed;
- task-queue fixtures passed;
- 168 task records validated;
- content schema, validator fixtures, production content, and the 10-node technology graph passed;
- seeded placements, waves, combat, resets, and snapshots passed;
- architecture verification passed for 125 JavaScript modules.

The browser artifact records:

- status `passed`;
- mission title `1. Siverskyi Donets: Hold the Crossing`;
- mission selection hidden after start;
- valid game canvas;
- three mission cards discovered;
- zero browser warnings.

This evidence proves the authoritative runtime and automated player-entry smoke. It does not claim broad manual campaign playtesting, visual-quality approval, or completion of unrelated recovery issues.
