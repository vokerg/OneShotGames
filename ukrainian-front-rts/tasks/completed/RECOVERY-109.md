# RECOVERY-109 — Authoritative verification baseline

- Owning issue: #109
- Pull request: #117
- Evidence level: `RUNTIME_INTEGRATED`
- Original implementation base: `65f8d244f6dea897f6822c5a30cd8f2db48a2583`
- Rebased merge target: `d630a78e643e86375750838596643fa3931c359f`
- Passing implementation head: `d485039acb7aa6b87a06e721856655e207f4257c`
- Passing workflow run: `30712786415`
- Passing workflow job: `91403186958`
- Diagnostics artifact: `8822408639` (`ukrainian-front-rts-verification-30712786415`)

## Delivered

- One authoritative GitHub workflow invokes `bash verify.sh` with `pipefail` and retains the complete combined log.
- The active-claim diagnostic rejects duplicate task claims and inaccurate branch-state assertions.
- Headless Chromium loads the actual application, waits for mission selection, starts the first mission, validates the canvas and mission state, rejects fatal browser/runtime/application-resource failures, and preserves failure diagnostics.
- The browser server treats only Chrome's implicit `/favicon.ico` probe as optional and retries transient profile cleanup locks.
- The completion-evidence audit remains diagnostic for historical records while preserving current evidence visibility.
- Baseline contract drift was repaired without adding gameplay scope: research resource projection, target-line normalization, canonical fixtures, simulation-phase fixtures, polymorphic technology references, seeded-damage verification, and architecture-layer registration.
- The architecture registry preserves the dedicated inward-only navigation layer while declaring the existing combat, status, visibility, and shared-contract boundaries.
- `docs/ARCHITECTURE.md` matches the executable layer registry and shared-contract exceptions.

## Verification evidence

Workflow run `30712786415` passed every mandatory step on the rebased implementation head:

- full assembled verifier: passed;
- active-claim diagnostics: passed;
- browser startup and first-mission smoke: passed;
- completion-evidence audit: passed;
- diagnostic artifact upload: passed.

The retained assembled-verifier log records:

- 767 tests passed, 0 failed, 0 skipped or cancelled;
- task-queue fixtures passed;
- 168 task records validated;
- content schema verification passed for 8 families;
- production content validation passed for 18 units, 4 buildings, 6 upgrades, and 3 missions;
- the 10-node technology graph passed;
- seeded placements, waves, combat, resets, and snapshots passed;
- architecture verification passed for 126 JavaScript modules;
- 263 verification stages passed.

The browser artifact records:

- status `passed`;
- mission title `1. Siverskyi Donets: Hold the Crossing`;
- mission selection hidden after start;
- valid game canvas;
- three mission cards discovered;
- zero browser warnings.

This evidence proves the authoritative runtime and automated player-entry smoke. It does not claim broad manual campaign playtesting, visual-quality approval, or completion of unrelated recovery issues. The completion-marker commit receives its own pull-request workflow before merge; that validation is recorded in the pull-request description to avoid a self-referential evidence update loop.
