# Fields of Resolve — single-player release gate

## Purpose

UFR-160 is the final promotion gate for the single-player release path. It does not create another gameplay system. It binds the existing Gates A–E, release-candidate QA, release freeze, defect disposition, known issues, candidate tag, and maintainer sign-off to one exact Git commit.

The gate is deliberately fail-closed. Missing, stale, deferred, or unavailable required evidence blocks promotion.

## Promotion command

Create a fresh evidence template for the exact candidate commit:

```bash
node scripts/single-player-release-gate.mjs --init <40-character-candidate-sha> --output release/single-player-release-gate.json
```

Populate the generated file only with evidence produced against that same commit, then evaluate it:

```bash
node scripts/single-player-release-gate.mjs --input release/single-player-release-gate.json
```

Exit codes:

- `0` — `PASS`; the candidate satisfies UFR-160's machine-readable promotion contract.
- `1` — `FAIL` or malformed evidence; a completed check failed or the record is invalid.
- `2` — `BLOCKED`; required evidence, closure, freeze, tag, or sign-off is still missing.

The evidence file is a release record, not a mutable project status board. Reinitialize it when the candidate commit changes.

## Required evidence

A promotable record requires all of the following against the exact candidate commit:

1. Gates A, B, C, D, and E each have `status: "pass"` and at least one evidence reference.
2. `schemas`, `assets`, and `content` each have `status: "frozen"` and commit-bound evidence.
3. UFR-159 release-candidate QA has `verdict: "PASS"` with evidence against the candidate.
4. A release-candidate tag is recorded with commit-bound evidence.
5. Every P0/P1 release defect is `fixed` with commit-bound evidence. A waiver or known-issue disposition is not sufficient at UFR-160.
6. Published known issues contain only P2/P3 items.
7. Release sign-off is approved by a named signer, timestamped, and backed by commit-bound evidence.

A Git commit already gives the freeze an immutable technical boundary. The freeze evidence should point to verification proving that the schemas, runtime content, and packaged asset/provenance inventories correspond to that exact commit and did not drift after the candidate was cut.

## Gates A–E

The permanent gate definitions remain authoritative in `docs/RTS_PARITY_AUDIT.md`:

- Gate A — stable RTS foundation (`UFR-001`–`UFR-030`).
- Gate B — complete core match loop (`UFR-031`–`UFR-083`).
- Gate C — campaign-complete alpha (`UFR-084`–`UFR-105`).
- Gate D — production audiovisual beta (`UFR-106`–`UFR-145`).
- Gate E — release candidate (`UFR-146`–`UFR-160`).

UFR-160 does not reinterpret earlier completion markers upward. The release owner must use assembled runtime/player/release evidence appropriate to each gate rather than treating contract-only markers as proof of release readiness.

## Current UFR-160 blockers

At the start of UFR-160, UFR-159 handed off two open P1 release blockers:

- `#183` — compact icon command-card, building panel, and top-HUD composition. This branch corrects the deterministic runtime composition and adds regression coverage, but the issue's required manual Windows Chrome player review still has to pass before the defect can be closed.
- `#249` — headed Edge, Firefox, and Safari browser-matrix evidence. Automated Chromium startup is not a substitute; the required headed rows must be recorded before release promotion.

P2 tooling issues `#247` and `#248` may be published as known issues if they remain non-release-blocking and are described accurately. They do not relax any P0/P1 requirement.

Until the P1 blockers are fixed and the required evidence exists, do not create a passing sign-off record, mark UFR-160 complete, claim `RELEASE_VERIFIED`, or promote a single-player release tag.

## UI release correction

The UFR-160 UI correction keeps the existing production command-card owner and tactical-card composition seam. It adds catalog-backed inline command glyphs, compact 4×3 action faces, full descriptions/reasons through accessible labels and tooltips, bounded worker-overview geometry, and an explicit notification offset from the top HUD.

The diagnostic icon fallback is used only when the UFR-119 catalog cannot resolve the requested command asset. Generic order/targeting/stance/construction icons are catalog entries, not fallback errors.

Required player checks for `#183` remain:

- 1280×720, 1920×1080, and ultrawide layouts;
- unit and building selections with enough actions to page the card;
- no unexpected top-bar wrapping, command-card overflow, minimap collision, or Messages overlap;
- readable production/research costs and states;
- keyboard command-card navigation and visible disabled/targeting states;
- manual Windows Chrome review plus visual-regression captures required by the defect.

## Sign-off discipline

Do not merge UFR-160 merely because repository CI passes. CI proves the deterministic portions of the gate. The draft PR remains blocked while required headed/manual release evidence is unavailable. A maintainer may decide how and where to collect that evidence, but the machine-readable gate will continue to report `BLOCKED` until it is present.
