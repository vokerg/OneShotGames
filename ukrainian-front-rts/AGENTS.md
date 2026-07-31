# AGENTS.md — Ukrainian Front RTS

## Scope

These instructions apply only to `ukrainian-front-rts/`. Do not modify sibling games while working under this directory.

## GitHub access: connector first

Use the connected GitHub app/connectors for remote repository operations whenever they support the required action. This includes resolving current `main`, searching branches/PRs/issues, checking task claims, creating branches and commits, reading or updating repository files, and creating/updating/commenting on draft PRs.

The GitHub CLI (`gh`) is not a prerequisite. Do not run `gh --version` or `gh auth status` as a gate, and do not stop merely because `gh` is missing or unauthenticated when the connector can complete the work. Use `gh` only as an optional fallback for an operation the connector does not expose (for example, detailed GitHub Actions log inspection). If that fallback is unavailable, continue all connector-supported work and report only the specific remaining gap.

Use local `git` for checkout/worktree operations and local verification when a checkout is available; keep its branch and commit state aligned with connector-visible GitHub state.

## Start here: feature conveyor

Before changing code, read these files in order:

1. `docs/RTS_PARITY_AUDIT.md` — current-state audit and the quality target.
2. `docs/INTEGRATION_RECOVERY_PLAN.md` — temporary recovery priority and exit criteria; when active, it overrides ordinary queue selection.
3. `TASKS.md` — stable, dependency-aware implementation queue.
4. `docs/FEATURE_CONVEYOR.md` — claim, branch, PR, verification, and completion protocol.
5. The architecture and change-routing documents referenced below.

When told to “pick up from the queue,” do not ask which task to take unless the caller supplied constraints that conflict. Resolve the next claimable work using the algorithm in `docs/FEATURE_CONVEYOR.md`. While the recovery override is active, choose its claimable P0 work before ordinary queue tasks. Otherwise claim exactly one task, create a dedicated branch from current `main`, open a draft PR, and begin implementation.

## Recovery override

`docs/INTEGRATION_RECOVERY_PLAN.md` is active while any P0 recovery issue named there remains open.

During the override:

- P0 recovery work takes priority over ordinary `TASKS.md` rows;
- do not start later art, audio, campaign-content, UI-polish, roster-breadth, or release work without explicit maintainer authorization;
- do not open another integration-gate branch merely because its dependency markers exist;
- work on an ordinary task only when it directly unblocks a recovery issue and the issue records the ownership and sequencing;
- stale feature branches are reference material and must be rebuilt from current `main` unless a current comparison proves a clean integration path.

The override ends only when the exit criteria in the recovery plan are met and the P0 recovery issues are closed.

## Task state is derived, not hand-maintained

A task in `TASKS.md` is:

- **DONE** when `tasks/completed/<TASK-ID>.md` exists on `main`;
- **CLAIMED** when an open PR title starts with `[<TASK-ID>]` or an open work branch clearly claims that ID;
- **BLOCKED** when any listed dependency is not DONE;
- **READY** otherwise.

DONE is a conveyor state, not a claim that every release-level check has passed. Completion records must state their evidence level as defined below. Integration gates require runtime integration and the verification specified by their row; a marker that records only isolated contract evidence must not be used to justify downstream gate closure.

Do not edit a shared status column to claim work. That creates merge conflicts and allows duplicate claims.

## Claim contract

For a task such as `UFR-042`:

1. Confirm all dependencies are DONE.
2. Search open PRs for `[UFR-042]`; stop if one already exists.
3. Create `ufrts/UFR-042-short-slug` from current `main`.
4. Add `tasks/claims/UFR-042.md` containing the task title, base commit, intended files, and a short implementation plan.
5. Open a draft PR titled `[UFR-042] <task title>` immediately. The open draft PR is the authoritative claim visible to other agents.
6. Implement only that task and unavoidable prerequisites explicitly named in the PR.
7. Before marking the PR ready, delete the branch-local claim file and add `tasks/completed/UFR-042.md` with verification evidence, the final PR number, and the highest completion evidence level actually achieved.

If a task is marked `Parallel: NO`, do not claim it while another integration task from the same gate is active. If it is marked `LIMITED`, follow the ownership note and avoid overlapping edits to the named hotspot files.

## Product intent

Fields of Resolve is a dependency-free browser RTS. Preserve fast startup, deterministic data-driven content, strong battlefield readability, and original art. The target is the responsiveness, information density, production completeness, campaign depth, and visual legibility associated with a polished mid-1990s RTS—not copied Warcraft II assets, maps, dialogue, code, or exact rules.

Historical figures and events are stylized fiction. Avoid claims of documentary accuracy, do not introduce copied commercial-game assets, and keep source/licensing records for every external audio or visual input. Real public figures must not be used as directly controllable combat heroes in the active runtime; use original fictional characters and clearly fictionalized scenario framing.

## Architectural rules

1. Keep `src/main.js` as composition only. It may construct objects and wire top-level UI controls, but gameplay rules and complex browser input do not belong there.
2. Keep simulation authoritative in `Game` and `src/systems/`. UI and rendering may read game state; they must invoke public game commands instead of directly implementing simulation rules.
3. Put pure, reusable helpers in `src/core/`. Core modules must not import browser, UI, renderer, or game modules.
4. Put isolated simulation policies in `src/systems/`. Systems receive the game state explicitly and must not import `Game`, `UI`, or `Renderer`.
5. Keep balance and content identifiers in `src/config.js` until the content schema is split by the relevant queue task. Adding a mirrored unit, building, mission, ability, or upgrade should begin as a data change.
6. Keep visual-only changes in `src/render.js`, `src/art-pass.js`, `src/environment-art-pass.js`, or a focused renderer module. Visual work must not change combat statistics or objective state.
7. Browser event registration belongs in `src/input/`; frame scheduling and lifecycle belong in `src/app/`.
8. Prefer small compatibility-preserving extractions over rewrites. Existing public methods such as `spawnWave`, `updateObjectives`, and `updateProjectiles` remain valid delegation points until an assigned task deliberately migrates them.
9. New global mechanics require explicit state ownership, deterministic update order, and tests or a deterministic scenario harness.
10. Do not silently broaden a task. Record discovered follow-up work as a new task proposal in the PR rather than absorbing unrelated scope.
11. `src/systems/simulation-phases.js` and its declared delegates own the complete authoritative fixed-step order. Gameplay controllers must not create hidden before/after phases by replacing `game.update`.
12. Application installers must have deterministic composition and teardown. New wrappers around public `Game` methods require explicit ownership, integration tests, and exact restoration on disposal.

## Change routing

| Change | Start here | Usually avoid |
| --- | --- | --- |
| Balance, roster, mission data | `src/config.js` | `src/render.js` |
| Combat/economy rule | focused file in `src/systems/` plus a `Game` delegate | `src/ui.js` |
| Selection, keyboard, minimap input | `src/input/battlefield-input.js` | `src/main.js` |
| Main loop or lifecycle | `src/app/runtime.js` | `src/game.js` |
| Terrain/unit/portrait visuals | renderer or art module, then `art-lab.html` | simulation systems |
| HUD presentation | `src/ui.js` and `styles.css` | config balance values |
| Campaign scripting | mission data plus the campaign/trigger system introduced by its queue task | renderer branches |
| Audio | dedicated audio service and event mapping | direct `Audio` calls inside simulation |
| Save/replay | serialization boundary and versioned schema | serializing DOM or renderer objects |
| Integration recovery | `docs/INTEGRATION_RECOVERY_PLAN.md` and the owning recovery issue | unrelated feature breadth |

## Completion evidence levels

Every completion marker and PR summary must state the highest level actually achieved:

- **CONTRACT_COMPLETE** — isolated data, policy, or API behavior and focused tests are complete.
- **RUNTIME_INTEGRATED** — the assembled application consumes the contract through its intended owner and integration tests pass.
- **PLAYER_VERIFIED** — required browser/manual flows and affected missions were exercised successfully.
- **RELEASE_VERIFIED** — compatibility, performance, accessibility, provenance, migration, and release checks required by the release gate pass.

The levels are cumulative. Do not imply a higher level than the evidence supports. An integration-gate task cannot be closed at `CONTRACT_COMPLETE` alone.

## Definition of done

Every task must satisfy its row in `TASKS.md` and the following baseline:

- Run `bash verify.sh` in a native repository checkout or required CI job.
- Run all automated tests introduced by completed prerequisite tasks.
- Launch `./run.sh` and start every mission affected by the change.
- Verify selection, right-click orders, attack-move, minimap navigation, mouse zoom, and all four WASD directions unless the task is documentation-only.
- For visual changes, compare normal missions and `art-lab.html` at all supported zoom levels and in grayscale mode; attach before/after captures to the PR.
- For audio changes, verify mute, volume, pause/resume, repeated-event throttling, and no autoplay-policy errors.
- For simulation changes, verify deterministic behavior with the same seed and scenario once the deterministic harness exists.
- For integration gates, execute the assembled integration suite and required browser smoke; syntax-only or reconstructed-fixture evidence is insufficient.
- Update `docs/ARCHITECTURE.md` when ownership or dependency direction changes.
- Update the relevant design, balance, asset, or campaign documentation.
- Keep commits limited to `ukrainian-front-rts/` unless the task explicitly requires repository-wide work such as CI configuration.
- Add `tasks/completed/<TASK-ID>.md` only after all acceptance criteria and verification are satisfied, and record the completion evidence level.

If a required check is temporarily unavailable, keep the PR draft or record an explicit maintainer waiver and a blocking follow-up issue. Do not describe unavailable required verification as completed.
