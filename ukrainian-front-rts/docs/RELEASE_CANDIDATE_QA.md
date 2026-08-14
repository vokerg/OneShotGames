# Release-candidate QA gate

UFR-159 is the full-product QA gate between release automation (UFR-158) and the single-player release freeze (UFR-160). It does not replace the authoritative verifier or browser smoke scripts. It collects their results, headed/manual evidence, and defect disposition into one commit-bound verdict.

## Required matrix

Every candidate must cover these product surfaces:

- campaign progression and mission completion;
- skirmish setup, play, victory, and defeat;
- save/load/migration/export/reset safety;
- replay capture/playback/determinism/compatibility;
- settings persistence, controls, reset, and fullscreen;
- English/Ukrainian localization and layout;
- audio playback, mute/volume/resume, and provenance;
- keyboard/focus/scaling/reduced-motion/contrast accessibility;
- performance, long-session, large-battle, and deterministic stress.

The browser matrix requires Chrome, Edge, Firefox, and Safari records. `na` is permitted only with an explicit rationale; it does not silently stand in for evidence that is expected on another runner or manual platform. Pass evidence is always bound to the exact candidate commit so an older successful workflow cannot certify a newer head.

## Existing automation to reuse

Run `bash verify.sh` for the assembled unit/simulation, content, deterministic randomness, visual, audio, accessibility, localization, release-package, runtime-composition, and architecture gates. The repository workflow additionally runs browser startup/mission smoke, Ukrainian infantry and paired-vehicle readability checks, visual-regression capture, browser audio release smoke, browser accessibility/settings smoke, and browser localization smoke.

Do not duplicate those checks inside the RC evidence evaluator. Record their workflow/run or manual report references against the exact candidate SHA.

## Evidence file and verdict

Create a fail-closed template for the candidate head:

```bash
node scripts/release-candidate-qa.mjs --init <candidate-sha> --output artifacts/rc-evidence.json
```

Fill each surface/browser entry with `pass`, `fail`, `blocked`, `not-run`, or `na`. A `pass` requires at least one evidence object:

```json
{
  "kind": "workflow",
  "ref": "workflow 123456 / browser startup and mission smoke",
  "commit": "0123456789abcdef0123456789abcdef01234567"
}
```

Record every release-relevant defect with its issue reference, severity (`P0`–`P3`), and disposition (`blocker`, `fixed`, `waived`, or `known-issue`). A waiver requires an explicit rationale. Open P0/P1 work cannot be hidden as a known issue; it blocks the gate unless the maintainer explicitly waives it.

Evaluate the candidate and persist a machine-readable report:

```bash
node scripts/release-candidate-qa.mjs \
  --input artifacts/rc-evidence.json \
  --output artifacts/rc-report.json
```

Exit codes are `0` for `PASS`, `1` for `FAIL` or malformed evidence, and `2` for `BLOCKED`. Missing required runs, stale evidence, and untriaged P0/P1 release defects therefore cannot produce a release-ready verdict.

## Current known follow-ups

The gate owner must explicitly disposition the current headed-browser evidence follow-up (#249) and any open P0/P1 player-visible release defect, including #183 while it remains open. Tooling intermittency tracked by #247 and #248 must be recorded when it affects candidate evidence; retrying a flaky exact head is useful diagnostic evidence but does not erase a reproducible release-gate defect.

UFR-159 should remain a draft claim until the exact candidate head has the required automated and headed/manual evidence. Only then should the claim file be replaced by `tasks/completed/UFR-159.md` at the highest evidence level actually demonstrated.
