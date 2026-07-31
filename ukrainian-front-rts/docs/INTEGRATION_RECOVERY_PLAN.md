# Fields of Resolve — integration recovery plan

## Status

Approved recovery override for the implementation conveyor.

This plan responds to the July 31, 2026 progress review. The project direction and foundational architecture remain valid, but nominal task completion has advanced faster than assembled-runtime verification and playable gate closure.

Until the exit criteria below are satisfied, this document takes priority over ordinary lowest-ID task selection in `TASKS.md`.

## Recovery objective

Return the project to a state where:

- `main` has authoritative repository-wide and browser-startup verification;
- DONE evidence distinguishes isolated contracts from runtime and player verification;
- stale critical-path work is rebuilt from current `main` rather than merged blindly;
- the complete authoritative simulation order is explicit and testable;
- application composition and teardown are deterministic and failure-safe;
- active runtime content follows canonical faction contracts and fictional framing;
- new breadth resumes only after the blocked playable loop is again the dominant critical path.

## Recovery issues

### P0 — authoritative verification and honest completion

Issue #109: **Establish authoritative CI, integrated verification, and honest DONE semantics**.

This issue owns:

- required CI for `bash verify.sh`;
- dependency-free browser startup smoke coverage;
- execution of integration suites against a native assembled checkout;
- completion evidence levels;
- the merged-task runtime-composition audit;
- duplicate/stale claim diagnostics.

No additional integration-gate task may be closed before #109 provides passing evidence on the relevant head.

### P0 — stale critical-path recovery

Issue #110: **Rebuild stale critical-path work and restore Gate A/B dependencies**.

This issue coordinates two replacement work streams from current `main`:

- UFR-022 navigation path caching/repath recovery, followed by UFR-029 and UFR-030 gate closure;
- UFR-071 Ukrainian infantry recovery against current faction, combat, economy, production, and ownership contracts.

Old PRs are reference material. They must not be merged through blind conflict resolution.

### P0 — runtime architecture and composition recovery

Issue #111: **Restore explicit simulation ownership and deterministic application composition**.

This issue owns:

- inventory and removal of hidden simulation phases created through `Game.update` wrapping;
- explicit named phase/delegate ownership;
- deterministic installer/disposer registry;
- startup rollback and teardown verification;
- safe browser-capability acquisition;
- architecture guards for authoritative lifecycle methods.

### P1 — runtime content and product-framing reconciliation

Issue #112: **Reconcile active runtime content with product framing and merged contracts**.

This issue owns:

- replacement of real public-figure combat heroes with fictional characters;
- canonical runtime roster/configuration reconciliation;
- dependency-contract testing for content families;
- duplicate stable-ID ownership validation;
- a matrix of merged-but-unwired maps, AI, campaign, audio, and UI contracts.

Issue #112 blocks new campaign character writing, final character art or voice, localization, and promotional captures.

## Work ordering

The recovery program should use no more than three simultaneous implementation PRs:

1. #109 verification/CI is the first merge target.
2. #110 may run navigation and infantry recovery as two coordinated PRs with non-overlapping ownership.
3. #111 starts after its lifecycle-wrapper inventory is reviewed and coordinates all edits to `src/main.js` and simulation phases.
4. #112 begins after the recovered UFR-071 ownership shape is agreed.

Final merge of #110, #111, or #112 work requires the checks established by #109.

## Temporary queue override

While any open P0 recovery issue exists:

- choose a claimable P0 recovery issue before an ordinary `TASKS.md` task;
- do not start later art, audio, campaign-content, UI-polish, roster-breadth, or release work unless the maintainer explicitly authorizes it;
- do not start another `Parallel: NO` integration gate;
- ordinary work may proceed only when it directly unblocks #109, #110, or #111 and its ownership is recorded in the recovery issue;
- existing safe, current, isolated PRs may be reviewed, but stale branches must be rebuilt from current `main`.

After all P0 recovery issues close, resume the primary critical path:

```text
UFR-022 → UFR-029 → UFR-030 → UFR-081
UFR-066 → UFR-068 → UFR-080
UFR-071 + UFR-080 + UFR-081 → UFR-082 → UFR-083
UFR-083 → tutorial and authored campaign operations
```

## Completion evidence levels

A completion record must state the highest evidence level actually achieved:

- `CONTRACT_COMPLETE` — isolated data/policy/API and focused tests are complete.
- `RUNTIME_INTEGRATED` — the assembled application consumes the contract through its intended owner and integration tests pass.
- `PLAYER_VERIFIED` — required browser/manual flows and affected missions were exercised successfully.
- `RELEASE_VERIFIED` — required compatibility, performance, accessibility, provenance, migration, and release checks pass.

These levels are cumulative. A task must not imply a higher level than its evidence supports.

A completion marker may still record unavailable checks, but an integration gate cannot be considered closed at `CONTRACT_COMPLETE` alone.

## Recovery exit criteria

The temporary override ends only when all of the following are true:

1. #109, #110, and #111 are closed with passing required CI on their merged commits.
2. Latest `main` passes `bash verify.sh` and the browser startup smoke.
3. UFR-022 and UFR-071 have current-main authoritative implementations and stale claims are closed or superseded.
4. Navigation Gate A integration work can proceed without stale dependencies.
5. The complete simulation order is visible in declared phase ownership; no gameplay controller creates hidden before/after update phases.
6. Application installation and disposal are deterministic and integration-tested.
7. The completion audit identifies every merged-but-unwired high-impact contract and names an owner.
8. No unresolved P0 defect was found by the assembled verification baseline.

Issue #112 may continue as the first P1 after the P0 override ends, but its public-figure and canonical-content work remains a prerequisite for campaign character production.

## Scope discipline

The recovery program is not a rewrite and must not become a feature omnibus.

Preserve:

- the dependency-free browser baseline;
- fixed-step deterministic simulation;
- public subsystem contracts that remain valid;
- original work and provenance rules;
- stable task IDs and completion history.

Correct integration, verification, ownership, and active-content drift before adding more breadth.
