# RECOVERY-111 — Runtime composition and simulation ownership

- Base commit: `7a695040e7b6ced8874cc91b0711361820fae774`
- Owning issue: #111
- Pull request: #118
- Intended files:
  - `src/main.js`
  - `src/app/`
  - `src/core/simulation-delegates.js`
  - `src/systems/simulation-phases.js`
  - lifecycle-wrapper owners required for exact restoration
  - runtime-composition verification, tests, and documentation
- Parallel boundary: no runtime-content files owned by PR #120 and no new navigation integration gate while this P0 recovery is active.

## Plan

1. Preserve existing gameplay behavior through named simulation delegates and deterministic application composition.
2. Guarantee atomic installation rollback, reverse-order teardown, exact lifecycle-method restoration, and safe browser capability acquisition.
3. Verify the current-main assembled suite, deterministic phase order, repeated mission startup, and browser smoke.
4. Replace this claim with exact completion evidence before squash merge.
