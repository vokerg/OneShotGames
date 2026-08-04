# Tactical AI runtime

## Scope

UFR-081 turns the UFR-079 observed-only AI contracts into a deterministic tactical opponent. It owns scouting, threat response, force concentration, target selection, attack routes, retreat, reinforcement, flanking, and defensive posture. Economy planning, difficulty profiles, skirmish setup, campaign scripting, roster expansion, and balance tuning remain owned by UFR-080, UFR-082, UFR-083, and their respective content tasks.

## Ownership

The implementation is split across two explicit owners:

- `src/ai/tactical-ai.js` is a browser-independent pure planner. It consumes frozen doctrine, goal, knowledge, own-force, and own-structure snapshots and returns a frozen command plan.
- `src/systems/tactical-ai-system.js` is the runtime adapter. It gathers permitted observations, advances the UFR-079 blackboard, invokes the planner on deterministic cadence ticks, resolves live entities, and projects descriptors into existing unit-order contracts.

The planner does not import `Game`, simulation systems, navigation, rendering, UI, browser APIs, or live entity objects. The system does not replace `game.update`. `src/main.js` installs it as an ordered `TACTICAL_PREPARE` simulation delegate before tactical-command projection and unit movement.

## Information fairness

Enemy knowledge enters the blackboard only through explicit line-of-sight observations. The runtime first enforces each observer's sight radius and then uses `game.visibilityQuery.canSee()` or `game.canUnitSee()` when the assembled runtime exposes either authoritative query. The dependency-free prototype fallback remains radius-limited; it never enumerates hostile state directly into planner input.

Observed contacts retain their last confirmed position and strength, become stale according to doctrine thresholds, and are forgotten on the UFR-079 schedule. A hostile disappearing from the authoritative arrays is not immediately removed from AI knowledge. This prevents hidden destruction state from leaking into tactical decisions.

Observation work is bounded by stable, configurable observer and hostile caps. Both collections are sorted by stable entity ID before truncation and comparison.

## Force snapshots and strength

The runtime converts controllable units into reference-free snapshots containing stable ID, position, health, speed, sight, combat/support/scout classification, and a deterministic strength estimate. Structures contribute stable defensive anchors and strength. Units explicitly marked `aiControl: false`, embarked units, and garrisoned units are not assigned tactical orders.

The strength estimate combines current health ratio, durability, damage, range, and rate. It is a planning heuristic only. It does not alter combat statistics or authorize damage.

## Postures

The pure planner emits one of seven explicit postures:

- `scouting` — fastest or reconnaissance-capable units move through deterministic world waypoints while a reserve remains near the home anchor;
- `assembling` — dispersed or under-strength forces move to a staging point before commitment;
- `defending` — combat units engage or route toward the highest-priority observed threat inside the defensive radius, while support remains behind the anchor;
- `attacking` — concentrated forces advance on the selected observed target;
- `flanking` — a stable subset approaches a deterministic perpendicular offset while the main force advances directly;
- `retreating` — readiness or observed force ratio falls below doctrine policy, so the force withdraws to the home anchor;
- `reinforcing` — separated units rejoin while the main body screens the selected target.

Decision precedence is deterministic: retreat safety, defensive urgency, scouting knowledge, reinforcement/assembly, then attack or flank. Equal candidates use stable IDs and fixed formulae; the planner uses no wall clock or unseeded randomness.

## Commands and authoritative execution

Plans contain bounded command groups with stable unit IDs, role, reason, order kind, target point, and optional observed contact ID. The runtime adapter validates every unit and target against current live state before assignment.

The adapter projects only existing authoritative order shapes:

- `move` for scouting, assembly, retreat, reserve, support, and reinforcement;
- `attackMove` for routed threat response, screens, main attacks, and flanks;
- `attack` when an explicitly observed live target can be resolved.

If an `attack` target is no longer live, the adapter safely degrades that descriptor to `attackMove` toward the last observed position. Ground `move` and `attackMove` orders therefore pass through the UFR-030 navigation owner, including dynamic blockers, path invalidation, collision, formations, and bounded recovery. Direct target combat remains owned by the existing combat update path.

A unit can be assigned at most once per plan application. Existing tactical-command metadata and queued projections are cleared before AI assignment so player tactical runtime state cannot leak between order owners.

## Cadence, lifecycle, and diagnostics

The controller owns one UFR-079 blackboard per installed game instance. Mission start resets tick, contacts, history, plans, and metrics while preserving configured doctrine/policy. Disposal restores `game.start`, removes diagnostic methods, clears AI-only roles, and deletes private controller state.

`game.tacticalAiSnapshot()` returns a deeply frozen, reference-free diagnostic containing:

- enabled state, team, tick, and doctrine;
- the UFR-079 blackboard snapshot;
- the last tactical plan;
- observation counts and comparison work;
- assigned and skipped command counts.

`game.setTacticalAiEnabled(boolean)` pauses or resumes planning without changing simulation phase ownership.

## Bounded-work contract

The default planner caps are:

- 96 own units;
- 64 remembered contacts;
- 12 command groups;
- 96 observers and 128 live hostile candidates in the runtime observation adapter.

Plans expose their considered unit/contact counts, command-group count, assigned-unit count, and a `bounded` result. Runtime observation diagnostics expose observer, hostile, comparison, and successful-observation counts.

## Verification

Focused and assembled coverage lives in:

```text
tests/ai/tactical-ai.test.mjs
tests/ai/tactical-ai-runtime.test.mjs
```

The suites cover observed-only scouting, threat prioritization, defense, retreat, reinforcement, assembly/attack thresholds, deterministic flanking, bounded work, repeated-input equality, contact aging after losses, controller reset/disposal, and projection into the authoritative navigation system around a live structure blocker.

Required completion verification:

```bash
node --test tests/ai/tactical-ai.test.mjs tests/ai/tactical-ai-runtime.test.mjs
bash verify.sh
npm run smoke:team
```
