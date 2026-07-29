# Fields of Resolve — feature conveyor

## Goal

The conveyor lets independent coding agents repeatedly take the next useful task, prevent duplicate work, operate in separate branches, and merge completed features without turning one shared checklist into a conflict hotspot.

The system has four durable artifacts:

- `AGENTS.md` — entry point and non-negotiable rules;
- `TASKS.md` — stable task definitions, dependencies, parallelization, entry points, and acceptance criteria;
- open draft PRs titled `[TASK-ID] ...` — authoritative active claims;
- `tasks/completed/TASK-ID.md` on `main` — authoritative completion markers.

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

## Picking the next task

When the user says “pick up from the queue”:

1. Read `AGENTS.md`, this document, and `TASKS.md`.
2. Filter out tasks whose completion marker exists on `main`.
3. Filter out tasks with an open PR claim.
4. Filter out tasks with incomplete dependencies.
5. Filter out tasks that violate their `Parallel` rule because a conflicting integration task is active.
6. Choose the lowest-priority-number task first: P0 before P1, then P2, then P3.
7. Within the same priority, choose the lowest task ID unless the user requests a lane such as art, audio, campaign, balance, or UI.
8. Claim one task only.

Do not skip a READY P0 task for a lower-priority feature merely because the latter is more visually interesting.

## Claim lifecycle

### 1. Rebase the decision on current `main`

Resolve the latest `main` commit before creating the branch. A task may have become DONE, BLOCKED, or CLAIMED since the previous agent looked.

### 2. Search for duplicate claims

Search open PR titles and descriptions for the exact task ID. A title beginning `[UFR-042]` is an active claim even if the PR is draft or CI is failing.

If the existing claim appears abandoned, do not create a duplicate branch. Comment on that PR or ask the maintainer to release the claim.

### 3. Create the branch

Use:

```text
ufrts/UFR-042-short-kebab-slug
```

Always branch from current `main`, never from another feature branch unless the task explicitly lists that branch as a dependency integration path.

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
- [ ] Completion marker

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

Parallel work is encouraged across lanes, but task-specific `Parallel` text overrides general lane separation.

### Hotspot coordination

The following files are conflict-prone:

- `src/game.js`
- `src/config.js`
- `src/ui.js`
- `src/render.js`
- `styles.css`
- `index.html`

A task marked `LIMITED` names its hotspot. Only one active task should own a given hotspot unless both PRs explicitly agree on file boundaries. Prefer extracting focused modules before adding more logic to a hotspot.

### Integration gates

Tasks marked `Parallel: NO` are integration or release gates. They may collect work from many completed tasks and should start only when their dependencies are DONE. Do not use an integration task as a broad branch where unrelated unfinished features accumulate.

## Verification protocol

Every PR must include:

1. the exact commands run;
2. deterministic scenario or test evidence when available;
3. browser playtest steps for affected flows;
4. before/after captures for visual UI or art work;
5. audio verification notes for audio work;
6. performance measurements for pathfinding, rendering, AI, replay, or large-map work;
7. documentation changes required by architecture or content changes.

Baseline command:

```bash
bash verify.sh
```

A task may add stronger commands. Once a new verification command is merged, later tasks in the relevant lane must run it.

## Completion protocol

Before marking the PR ready for review:

1. Re-read the task row and confirm every acceptance statement is met.
2. Rebase or merge current `main` and resolve conflicts without dropping other task work.
3. Run the full required verification set.
4. Delete `tasks/claims/TASK-ID.md` from the branch.
5. Add `tasks/completed/TASK-ID.md`:

```markdown
# TASK-ID — Task title

- PR: #<number>
- Completed commit: <SHA or filled after merge by maintainer>
- Verification: <commands and manual checks>
- Notes: <schema/version/asset implications>
```

6. Mark the PR ready for review.
7. After merge, confirm the completion marker exists on `main`.

The completion marker is part of the feature, not clerical follow-up. A task is not DONE without it.

## Review and merge rules

Reviewers should verify:

- task acceptance criteria, not only code style;
- dependencies and parallel rule were respected;
- no hidden scope expansion;
- simulation ownership and update order remain clear;
- save/replay/content schemas are versioned where affected;
- player feedback and AI support exist for new mechanics;
- documentation, tests, assets, and provenance are complete;
- the completion marker is accurate.

Prefer squash merge with a title beginning the task ID. This keeps history searchable:

```text
UFR-042: Add production queue cancellation and refunds
```

## Failure and abandonment handling

### Blocked after claim

If implementation reveals a genuine prerequisite:

1. document the blocker in the PR;
2. keep the PR draft;
3. propose or identify the prerequisite task;
4. do not repurpose the branch into the prerequisite unless the maintainer explicitly changes the claim.

### Abandoned claim

A claim is released by closing the draft PR and deleting the branch. Removing only the claim file is insufficient because other agents search open PRs first.

### Superseded task

Do not delete the task row. Add a completion marker that records `Superseded by UFR-XYZ` or update the queue in a dedicated queue-maintenance PR. Stable IDs must never be reused.

## Adding new tasks

A new task proposal must include:

- a new monotonically increasing `UFR-###` ID;
- priority and lane;
- specific entry points;
- concrete deliverable and observable acceptance criteria;
- dependencies;
- an explicit parallel rule using `YES`, `LIMITED`, or `NO`;
- the release gate it supports.

Add tasks in a dedicated queue-maintenance PR when possible. Do not renumber existing tasks.

## Recommended work-in-progress limits

To keep the conveyor reviewable:

- one active task per agent;
- at most one active `NO` integration task per release gate;
- at most one active owner per named hotspot;
- no more than three simultaneous mission-content PRs until the campaign scripting contract is stable;
- no more than two simultaneous atlas/source-asset PRs touching the same unit family;
- no multiplayer implementation before UFR-161 approves the architecture and single-player Gate E is complete.

## Maintainer queue sweep

Periodically run a queue sweep that:

- confirms open PR claims map to existing task IDs;
- closes duplicate or abandoned claims;
- verifies merged task PRs contain completion markers;
- identifies newly READY tasks after dependency completion;
- updates the audit only when product state materially changes;
- adds newly discovered work without altering existing IDs.

This sweep is maintenance, not a substitute for task ownership or task-level completion markers.
