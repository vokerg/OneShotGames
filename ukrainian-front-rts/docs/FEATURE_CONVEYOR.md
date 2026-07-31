# Fields of Resolve — feature conveyor

## Goal

The conveyor lets independent coding agents repeatedly take the next useful task, prevent duplicate work, operate in separate branches, and merge completed features without turning one shared checklist into a conflict hotspot.

The system has five durable artifacts:

- `AGENTS.md` — entry point and non-negotiable rules;
- `docs/INTEGRATION_RECOVERY_PLAN.md` — temporary priority override when integration drift is active;
- `TASKS.md` — stable task definitions, dependencies, parallelization, entry points, and acceptance criteria;
- open draft PRs titled `[TASK-ID] ...` — authoritative active claims;
- `tasks/completed/TASK-ID.md` on `main` — authoritative completion markers with explicit evidence levels.

## Why task status is derived

A markdown status column becomes inaccurate as soon as two agents branch from the same base. Both can write `IN PROGRESS`, both can overwrite each other, and completion changes conflict in one large file.

This conveyor therefore treats task definitions as mostly immutable and derives state:

```text
if tasks/completed/TASK-ID.md exists on main:
    DONE
else if an open PR title starts with [TASK-ID]:
    CLAIMED
else if any dependency lacks a completion marker:
    BLOCKED
else:
    READY
```

A branch-local claim file is useful context, but the open draft PR is the cross-agent lock because it is searchable and visible before implementation is complete.

DONE is the durable conveyor state. It does not erase the distinction between an isolated contract and a player-verified feature. Completion markers must record the evidence level defined below, and integration-gate dependencies must be interpreted using the acceptance criteria rather than marker existence alone.

## Recovery override

`docs/INTEGRATION_RECOVERY_PLAN.md` is active while any P0 recovery issue named there remains open.

The override exists for cases where individually completed tasks outpace assembled verification, critical branches become stale, or runtime ownership diverges from the documented architecture.

While active:

1. Claimable P0 recovery work precedes ordinary queue work.
2. Do not start later art, audio, campaign-content, UI-polish, roster-breadth, release, or another integration-gate task without explicit maintainer approval.
3. Ordinary work may proceed only when it directly unblocks a recovery issue and its owner records the dependency and file boundaries.
4. A stale non-mergeable feature branch is reference material. Rebuild from current `main` unless a current comparison and full verification prove a clean integration path.
5. Required CI from the verification recovery issue must pass before other recovery work is finalized.

The override ends only when the recovery plan’s exit criteria are satisfied and its P0 issues are closed.

## Picking the next task

When the user says “pick up from the queue”:

1. Read `AGENTS.md`, `docs/INTEGRATION_RECOVERY_PLAN.md`, this document, and `TASKS.md`.
2. If the recovery override is active, identify claimable P0 recovery work first.
3. Otherwise filter out tasks whose completion marker exists on `main`.
4. Filter out tasks with an open PR claim.
5. Filter out tasks with incomplete dependencies.
6. Filter out tasks that violate their `Parallel` rule because a conflicting integration task is active.
7. Choose the lowest-priority-number task first: P0 before P1, then P2, then P3.
8. Within the same priority, choose the lowest task ID unless the user requests a lane such as art, audio, campaign, balance, or UI.
9. Claim one task only, except when a maintainer-approved recovery issue explicitly coordinates multiple replacement PRs with separate ownership.

Do not skip a READY P0 task or active P0 recovery issue for a lower-priority feature merely because the latter is more visually interesting.

## Claim lifecycle

### 1. Rebase the decision on current `main`

Resolve the latest `main` commit before creating the branch. A task may have become DONE, BLOCKED, CLAIMED, superseded, or subject to the recovery override since the previous agent looked.

Also compare any existing claim branch with current `main`. A PR description’s historical “zero behind” statement is not current evidence.

### 2. Search for duplicate claims

Search open PR titles and descriptions for the exact task ID. A title beginning `[UFR-042]` is an active claim even if the PR is draft or CI is failing.

If the existing claim appears abandoned or materially stale, do not create an uncoordinated duplicate branch. Comment on that PR or use the owning recovery issue to establish an explicit replacement and supersession path.

### 3. Create the branch

Use:

```text
ufrts/UFR-042-short-kebab-slug
```

Always branch from current `main`, never from another feature branch unless the task explicitly lists that branch as a dependency integration path.

Recovery branches may use a descriptive `ufrts/recovery-*` name when they coordinate planning or multiple replacement tasks, but each implementation PR must still identify the exact task or recovery issue it owns.

### 4. Add a branch-local claim file

Create `tasks/claims/UFR-042.md`:

```markdown
# UFR-042 — Task title

- Base: <main commit SHA>
- Claimed by: <agent/user identity if available>
- Intended files: <paths or modules>
- Dependencies verified: <IDs>

## Plan

1. First implementation step.
2. Verification step.
3. Documentation/update step.
```

The claim file deliberately uses a unique path, so simultaneous claims for different task IDs do not conflict.

### 5. Open a draft PR immediately

Title:

```text
[UFR-042] Task title
```

Recommended body:

```markdown
## Task

UFR-042 from `ukrainian-front-rts/TASKS.md`.

## Claim

- Base commit: ...
- Parallel rule: ...
- Dependencies: ...
- Expected hotspots: ...

## Plan

- [ ] Implementation
- [ ] Automated verification
- [ ] Browser/playtest verification
- [ ] Documentation
- [ ] Completion marker and evidence level

## Scope guard

Unrelated findings will be proposed as follow-up tasks rather than added silently.
```

The draft PR is the lock. Do not wait until implementation is complete to open it.

## Implementation rules

### Keep one task per branch

A branch may include a small prerequisite fix only when all of these are true:

- the prerequisite is required to satisfy the claimed task;
- it is not independently claimable from `TASKS.md`;
- it is described in the PR before implementation;
- it does not create a second user-visible feature.

Otherwise, stop and add a follow-up proposal.

A maintainer-approved recovery issue may coordinate multiple branches, but each branch must retain one clear owner, scope, verification set, and merge order.

### Respect lane ownership

The queue uses these lanes:

- `architecture` — module boundaries, lifecycle, schemas;
- `tooling` — tests, validation, CI, profiling, packaging;
- `input` — selection, commands, hotkeys, camera;
- `navigation` — passability, pathfinding, avoidance, formation movement;
- `combat` — damage, targeting, projectiles, status effects;
- `economy` — resources, workers, construction, production, research;
- `faction` — roster, doctrine, tech tree, counters;
- `ai` — strategic and tactical computer behavior;
- `campaign` — state, scripting, maps, missions, progression;
- `art` — sprites, terrain, effects, portraits, asset pipeline;
- `audio` — mixer, events, SFX, music, voice;
- `ui` — HUD, menus, accessibility, localization;
- `balance` — numbers, telemetry, simulations, difficulty;
- `release` — compatibility, migration, provenance, packaging;
- `multiplayer` — optional post-single-player network work.

Parallel work is encouraged across lanes, but task-specific `Parallel` text and active recovery ownership override general lane separation.

### Hotspot coordination

The following files are conflict-prone:

- `src/game.js`
- `src/config.js`
- `src/main.js`
- `src/systems/simulation-phases.js`
- `src/ui.js`
- `src/render.js`
- `styles.css`
- `index.html`

A task marked `LIMITED` names its hotspot. Only one active task should own a given hotspot unless both PRs explicitly agree on file boundaries. Prefer extracting focused modules before adding more logic to a hotspot.

### Integration gates

Tasks marked `Parallel: NO` are integration or release gates. They may collect work from many completed tasks and should start only when their dependencies are DONE at the evidence level required by the gate.

A `CONTRACT_COMPLETE` dependency is insufficient when the integration gate requires live runtime behavior. The gate owner must confirm runtime composition and execute the assembled integration suite.

Do not use an integration task as a broad branch where unrelated unfinished features accumulate.

### Authoritative simulation ownership

`src/systems/simulation-phases.js` and explicitly documented phase delegates own the complete fixed-step gameplay order.

Controllers and adapters must not create hidden simulation phases by replacing `game.update` with before/after gameplay work. Any lifecycle wrapper must have explicit ownership, deterministic installation order, integration tests, and exact restoration on disposal.

## Verification protocol

Every PR must include:

1. the exact commands run;
2. deterministic scenario or test evidence when available;
3. browser playtest steps for affected flows;
4. before/after captures for visual UI or art work;
5. audio verification notes for audio work;
6. performance measurements for pathfinding, rendering, AI, replay, or large-map work;
7. documentation changes required by architecture or content changes;
8. the highest completion evidence level actually achieved;
9. a link to any blocking follow-up when required verification was unavailable.

Baseline command:

```bash
bash verify.sh
```

A task may add stronger commands. Once a new verification command is merged, later tasks in the relevant lane must run it.

Required repository CI and browser startup smoke are owned by recovery issue #109. Once merged, their checks are mandatory for affected PRs and integration gates.

Reconstructed fixtures are useful focused evidence, but they do not replace a native assembled-checkout run for runtime or integration completion.

## Completion evidence levels

Every completion marker and PR summary must declare one of these highest achieved levels:

- `CONTRACT_COMPLETE` — isolated data, policy, or API behavior and focused tests are complete.
- `RUNTIME_INTEGRATED` — the assembled application consumes the contract through its intended owner and integration tests pass.
- `PLAYER_VERIFIED` — required browser/manual flows and affected missions were exercised successfully.
- `RELEASE_VERIFIED` — release-gate compatibility, performance, accessibility, provenance, migration, packaging, and sign-off checks pass.

The levels are cumulative. Do not imply a higher level than the evidence supports.

A task can have a durable completion marker while its audit identifies additional runtime integration work, but an integration-gate task cannot be finalized at `CONTRACT_COMPLETE` alone.

## Completion protocol

Before marking the PR ready for review:

1. Re-read the task row and confirm every acceptance statement is met.
2. Rebase or merge current `main` and resolve conflicts without dropping other task work.
3. Run the full required verification set in a native checkout or required CI job.
4. Run required browser/manual checks for the affected flow.
5. Delete `tasks/claims/TASK-ID.md` from the branch.
6. Add `tasks/completed/TASK-ID.md`:

```markdown
# TASK-ID — Task title

- PR: #<number>
- Completed commit: <SHA or filled after merge by maintainer>
- Evidence level: CONTRACT_COMPLETE | RUNTIME_INTEGRATED | PLAYER_VERIFIED | RELEASE_VERIFIED
- Verification: <commands, CI links, and manual checks>
- Unavailable checks: <none, or exact blocker and follow-up issue>
- Notes: <schema/version/asset/runtime implications>
```

7. Mark the PR ready for review.
8. After merge, confirm the completion marker exists on `main` and required checks passed on the merged commit.

The completion marker is part of the feature, not clerical follow-up. A task is not DONE without it.

If a required check is unavailable, keep the PR draft or obtain an explicit maintainer waiver that names a blocking follow-up issue. Do not represent unavailable required verification as completed.

## Review and merge rules

Reviewers should verify:

- task acceptance criteria, not only code style;
- dependencies and parallel rule were respected;
- recovery priority and ownership were respected when the override is active;
- no hidden scope expansion;
- simulation ownership and update order remain clear;
- save/replay/content schemas are versioned where affected;
- player feedback and AI support exist for new mechanics;
- documentation, tests, assets, and provenance are complete;
- the completion marker and evidence level are accurate;
- the branch is current enough to integrate safely and its PR description does not present historical synchronization as current state.

Prefer squash merge with a title beginning the task ID. This keeps history searchable:

```text
UFR-042: Add production queue cancellation and refunds
```

Recovery planning PRs may use a clear `ufrts:` or `recovery:` title when they do not complete a permanent UFR task.

## Failure and abandonment handling

### Blocked after claim

If implementation reveals a genuine prerequisite:

1. document the blocker in the PR;
2. keep the PR draft;
3. propose or identify the prerequisite task or recovery issue;
4. do not repurpose the branch into the prerequisite unless the maintainer explicitly changes the claim.

### Abandoned or stale claim

A claim is released by closing the draft PR and deleting the branch. Removing only the claim file is insufficient because other agents search open PRs first.

If a branch has materially diverged from `main`, update its PR with the current behind/mergeability state. When recovery is safer than conflict resolution, create the replacement branch from current `main`, link both PRs, and close the old claim only after the replacement is visible.

### Superseded task

Do not delete the task row. Add a completion marker that records `Superseded by UFR-XYZ` or update the queue in a dedicated queue-maintenance PR. Stable IDs must never be reused.

## Adding new tasks and recovery issues

A new permanent task proposal must include:

- a new monotonically increasing `UFR-###` ID;
- priority and lane;
- specific entry points;
- concrete deliverable and observable acceptance criteria;
- dependencies;
- an explicit parallel rule using `YES`, `LIMITED`, or `NO`;
- the release gate it supports.

Add permanent tasks in a dedicated queue-maintenance PR when possible. Do not renumber existing tasks.

A temporary recovery issue may bundle multiple corrective outcomes when they share one failure mode, sequencing owner, and exit criterion. It must still define:

- P0 or P1 priority;
- affected permanent tasks and PRs;
- file/hotspot ownership;
- acceptance criteria and required evidence;
- sequencing and scope guard;
- how the permanent queue resumes after closure.

Recovery issues do not reuse or silently redefine permanent UFR IDs.

## Recommended work-in-progress limits

To keep the conveyor reviewable:

- one active task per agent;
- at most one active `NO` integration task per release gate;
- at most one active owner per named hotspot;
- no more than three simultaneous recovery implementation PRs;
- no more than three simultaneous mission-content PRs until the campaign scripting contract is stable;
- no more than two simultaneous atlas/source-asset PRs touching the same unit family;
- no multiplayer implementation before UFR-161 approves the architecture and single-player Gate E is complete.

## Maintainer queue sweep

Periodically run a queue sweep that:

- confirms open PR claims map to existing task IDs or an approved recovery issue;
- compares open claim branches with current `main` and records stale/non-mergeable state;
- closes duplicate or abandoned claims;
- verifies merged task PRs contain completion markers and accurate evidence levels;
- identifies merged contracts that are not runtime-integrated;
- identifies newly READY tasks after dependency completion;
- updates the audit only when product state materially changes;
- adds newly discovered work without altering existing IDs;
- confirms the recovery override can end only when its documented exit criteria are met.

This sweep is maintenance, not a substitute for task ownership or task-level completion markers.
