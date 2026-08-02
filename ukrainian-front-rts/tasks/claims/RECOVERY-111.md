# Recovery #111 — Explicit simulation ownership and deterministic application composition

- Base: `65f8d244f6dea897f6822c5a30cd8f2db48a2583`
- Claimed by: ChatGPT coding agent
- Intended files: `src/app/`, `src/systems/simulation-phases.js`, focused lifecycle/controller modules, `src/main.js`, architecture verification, tests, and architecture/change-routing documentation
- Dependencies verified: issue #109 CI scaffolding exists on `main`; issue #111 is open and has no active PR claim
- Parallel boundary: no edits to navigation recovery files owned by PR #115, Ukrainian infantry content owned by PR #116, or browser-smoke script owned by PR #117

## Plan

1. Inventory production wrappers around authoritative `Game` methods and define named ownership for every lifecycle mutation.
2. Introduce deterministic application composition with reverse-order disposal and atomic rollback, then migrate the composition root and hidden update work to declared owners.
3. Add architecture and integration coverage for installer order, restoration, startup failure, fixed-step order, repeated determinism, and restricted browser capabilities.
4. Update architecture and change-routing documentation, run focused tests and `bash verify.sh`, and record only the evidence level actually achieved.
