# AI architecture

## Scope

UFR-079 establishes the deterministic planning boundary used by later economy, tactical, difficulty, and skirmish AI tasks. It defines state and scheduling contracts only. It does not allocate workers, build structures, choose combat routes, issue live commands, or read hidden enemy state.

UFR-081 now adds the tactical planner and runtime adapter described below. Economy planning remains owned by UFR-080, difficulty profiles by UFR-082, and skirmish composition by UFR-083.

## Ownership and dependency direction

`src/ai/` owns browser-independent planning contracts:

- doctrine profiles and deterministic decision cadence;
- an authoritative AI blackboard;
- observed scouting knowledge and contact aging;
- ordered planning goals;
- exact multi-resource budget envelopes;
- immutable debug and replay-relevant snapshots;
- pure tactical posture and command-plan selection.

AI modules may import `src/core/`, `src/content-schema.js`, `src/config.js`, focused declarative modules under `src/content/`, and sibling `src/ai/` modules. They must not import `Game`, simulation systems, input, UI, rendering, app/runtime, or audio. A focused system or `Game` adapter may consume AI outputs and remains responsible for validating and executing public gameplay commands.

`src/systems/tactical-ai-system.js` owns live tactical observations, lifecycle, entity resolution, and command projection. It is installed through `src/main.js` as an ordered `TACTICAL_PREPARE` delegate and never replaces `game.update`.

## Doctrine profile

A doctrine profile provides stable planning policy rather than live mutable state. It contains:

- stable doctrine and faction IDs;
- strategy label;
- decision interval and offset in fixed simulation ticks;
- contact stale and forget thresholds;
- risk tolerance and retreat threshold;
- normalized goal and budget weights;
- an enforced `observed-only` information policy.

The profile is deeply frozen. Later difficulty profiles may alter reaction delay, planning quality, risk tolerance, or economy efficiency, but must not silently replace `observed-only` with omniscient information.

## Blackboard state

`createAiBlackboard()` creates the mutable authoritative planning state for one AI controller. It owns:

- current processed tick and monotonic revision;
- doctrine identity and cadence state;
- contact knowledge keyed by stable contact ID;
- ordered current goals;
- current budget plan;
- bounded decision history.

The mutable blackboard is private to its owner. Other systems consume `inspectAiBlackboard()` snapshots rather than retaining the Maps, arrays, or objects used internally.

## Scouting knowledge

Knowledge enters only through explicit observations from line of sight, a domain event, or authored mission intelligence. Each contact records stable IDs, first/last observed tick, source, position, classification, strength, observation count, and reference-free details.

Contacts age deterministically:

1. confirmed after observation;
2. stale when the doctrine threshold is reached;
3. forgotten and removed when the forget threshold is reached.

No API derives contacts by reading every authoritative enemy entity. This preserves fog-of-war fairness and gives UFR-081 a clear input boundary for scouting, threat response, and target selection.

The UFR-081 runtime adapter first bounds and sorts own observers and hostile candidates. It records a hostile only when at least one observer is within that observer's sight radius and any assembled authoritative visibility query approves the line of sight. Disappearing live entities are not immediately removed from knowledge; stale/forget policy remains authoritative so hidden destruction state is not leaked.

## Goals

Goals are immutable records with a stable ID, supported goal kind, numeric priority, creation tick, optional reference-free target, and reason. Ordering is deterministic:

1. higher priority first;
2. earlier creation tick first;
3. lexicographically smaller stable ID first.

The blackboard replaces goal sets atomically and rejects duplicate IDs. Later planners may own goal creation and transitions, while this layer owns their shared shape and ordering.

## Budgets

Budget plans operate on explicit resource maps rather than one aggregate score. They record:

- available resources by resource ID;
- allocations by known category;
- exact unallocated remainder;
- the tick of the plan.

Allocations cannot overspend any resource. Categories cover economy, construction, production, research, repair, reserves, and operations. UFR-080 may add policy for producing allocations; authoritative resource charging remains in economy and production systems.

## Deterministic decision cadence

`runAiDecisionCadence()` evaluates every due decision tick in order. If a caller advances from tick 10 to tick 40, all cadence points in that interval are processed exactly as if the caller advanced one tick at a time. The callback receives a frozen debug snapshot at the exact decision tick and returns a JSON-compatible decision descriptor.

This contract makes AI decisions independent of render-frame chunking. Any replay-relevant randomness added by later AI tasks must use the seeded random service and document draw order.

The tactical runtime initializes its blackboard at the first valid simulation decision tick, records observations for the same fixed tick, and invokes `planTacticalAi()` only through this cadence. The planner uses no randomness, wall clock, live references, or iteration order from unsorted runtime collections.

## Tactical planning

`src/ai/tactical-ai.js` consumes doctrine, ordered goals, remembered contacts, own-unit snapshots, own-structure snapshots, a decision tick, and a bounded policy. It returns one deeply frozen plan with:

- one explicit posture;
- one selected observed target or `null`;
- reference-free force diagnostics;
- bounded command groups;
- considered-unit/contact and assigned-unit metrics.

The supported postures are:

- `scouting`;
- `assembling`;
- `defending`;
- `attacking`;
- `flanking`;
- `retreating`;
- `reinforcing`.

Safety and urgency precede aggression. The planner evaluates retreat readiness and observed force ratio first, then defensive threats, missing knowledge, separated forces, concentration and strength, and finally attack/flank eligibility. Equal choices use stable IDs and deterministic geometry.

The default planner bounds work to 96 own units, 64 remembered contacts, and 12 command groups. Runtime observation separately caps observers and hostile candidates. These limits are policy inputs and appear in diagnostics; they do not change combat stats.

## Runtime command projection

Tactical plans use the existing authoritative order vocabulary:

- `move` for scouting, reserve, assembly, reinforcement, support, and retreat;
- `attackMove` for routed defense, screens, main attacks, and flanks;
- `attack` for a currently live explicitly observed target.

`src/systems/tactical-ai-system.js` validates each unit and target before assignment, clears incompatible tactical-command projection state, and assigns each unit at most once per plan. A vanished direct target degrades safely to `attackMove` toward its last observed point.

Ground movement therefore remains owned by the UFR-030 navigation system. Combat acquisition, range, cooldown, projectile, and damage behavior remain owned by existing combat/runtime systems. The AI does not bypass passability, path recovery, target validity, or combat rules.

## Debug inspection

`inspectAiBlackboard()` returns a deeply frozen, reference-free snapshot containing doctrine/cadence state, budget, ordered goals, sorted contacts, summary counts, and bounded decision history. It is safe for debug UI, telemetry, replay diagnostics, and tests. It does not expose mutable Maps or live entity references.

The installed tactical controller additionally exposes `game.tacticalAiSnapshot()`, which includes the blackboard snapshot, last plan, observation work, and command-assignment metrics. `game.setTacticalAiEnabled()` pauses and resumes planning without changing simulation ownership.

## Integration recipe

Later tasks should integrate through a narrow adapter:

1. A fixed simulation phase or focused system gathers permitted observations and authoritative own-side state.
2. It updates the AI blackboard using stable IDs and reference-free values.
3. On a due cadence tick, an economy or tactical planner reads the frozen snapshot and returns proposals or command descriptors.
4. `Game` or a focused system validates those descriptors through the same public rules used by the player.
5. Successful state changes emit normal domain events after mutation.
6. UI and debug tools read snapshots only; they never become an AI command path.

UFR-080 owns economy planning. UFR-081 owns tactical planning and its `TACTICAL_PREPARE` runtime adapter. UFR-082 owns difficulty profiles. UFR-083 owns skirmish integration.

## Serialization and replay

The schema version, doctrine IDs, fixed cadence, observations, goals, budgets, decision results, tactical posture, selected contact, and command descriptors are replay-relevant. Save/replay owners should serialize reference-free snapshots and reject unknown versions rather than storing mutable runtime objects. Exact persistence wiring remains outside UFR-081.

## Verification

Focused checks:

```bash
node --check src/ai/ai-contracts.js
node --check src/ai/ai-blackboard.js
node --check src/ai/tactical-ai.js
node --check src/systems/tactical-ai-system.js
node --test tests/ai/ai-blackboard.test.mjs
node --test tests/ai/tactical-ai.test.mjs tests/ai/tactical-ai-runtime.test.mjs
node --test tests/tooling/architecture-verifier.test.mjs
bash verify.sh
npm run smoke:team
```

See `docs/TACTICAL_AI.md` for the posture, fairness, command, lifecycle, and bounded-work contracts.
