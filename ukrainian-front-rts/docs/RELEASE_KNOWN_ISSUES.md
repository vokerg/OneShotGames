# Fields of Resolve — release known issues

Status: **release candidate blocked**

This register is the player/release-facing issue summary for the UFR-160 single-player gate. It distinguishes defects that must be closed before promotion from lower-severity known issues that may remain documented.

## Release blockers

- **#183 — P1 UI composition:** compact icon command cards, building command readability, and top-HUD hierarchy require corrected runtime composition plus the issue's manual Windows Chrome player review and visual evidence. UFR-160 contains the deterministic composition correction; the manual acceptance evidence is still required before closure.
- **#249 — P1 browser evidence:** headed Edge, Firefox, and Safari release-matrix rows remain required. Automated Chromium smoke does not satisfy this blocker.

Neither blocker may be reclassified as a releasable known issue by the UFR-160 promotion record. The single-player release gate requires P0/P1 defects to be `fixed` with evidence against the exact candidate commit.

## Non-blocking known issues under evaluation

- **#247 — P2 CI/tooling intermittency:** retained as a tooling-quality follow-up unless new evidence shows player-facing or release-integrity impact.
- **#248 — P2 CI/tooling intermittency:** retained as a tooling-quality follow-up unless new evidence shows player-facing or release-integrity impact.

These P2 entries may be carried into final release notes only if their severity remains accurate and their impact is described without implying missing gameplay/browser verification has passed.

## Publication rule

The final candidate's machine-readable UFR-160 evidence is authoritative for promotion. If this register and the gate disagree, promotion stops until they are reconciled. Any newly discovered P0/P1 defect returns the candidate to `BLOCKED` regardless of an earlier sign-off or lower-severity label.
