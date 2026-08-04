# Operation Ember Line — authored defensive-withdrawal operation

## Scope

UFR-100 defines a deterministic fictional campaign operation using the existing authored-map, mission-script, objective, briefing/debrief, checkpoint, destruction/salvage, resource, and progression contracts. It adds declarative campaign content and a mission-specific scoring adapter only. It does not alter navigation, combat, salvage, resource collection, campaign persistence, balance, AI planning, renderer behavior, audio, or sibling games.

The implementation lives in `src/content/campaign/defensive-withdrawal-operation.js` and is intentionally browser independent. Military combatants and fictional military equipment are the only represented subjects.

## Player intent

Operation Ember Line is an east-to-west fighting withdrawal with five phases:

1. Hold the forward delaying line until 120 seconds.
2. Choose whether to recover salvage from a disabled recovery vehicle or scuttle it.
3. Re-establish the rear guard at the second delaying line until 240 seconds.
4. Move the main body through the withdrawal checkpoint and release the rear guard.
5. Extract the command IFV and at least four original force elements before 600 seconds.

The mission requires preservation of the command element but permits one original-force loss. Rear-guard extraction, salvage recovery, and disabling the pursuit command vehicle are optional results that affect presentation or score without creating alternate victory authority.

## Authored map

`operation-ember-line.map` uses authored-map format version 1:

- 48 × 30 cells at 32 world pixels per cell;
- two non-overlapping east–west withdrawal roads and one checkpoint feeder road;
- shelterbelts, mud, and rubble that distinguish the delay lines and salvage approach;
- stable starts for the command element, main body, artillery, rear guard, disabled recovery vehicle, and pursuing force;
- world-space and cell-space regions for both delay lines, salvage site, checkpoint, rear-guard release, pursuit axis, and extraction;
- authored military props carrying stable mechanic and contract metadata;
- one optional 100-metal salvage resource tied to the disabled vehicle.

A later runtime composition owner must materialize these descriptors through existing systems. Map metadata is not an alternate combat, salvage, checkpoint, or resource simulation.

## Delaying positions and phase ownership

Mission-script version 1 owns ordered, one-shot phase transitions:

- the forward line releases only after 120 seconds while the rear guard is present;
- the second line releases only after 240 seconds while the rear guard is present;
- at least three original withdrawal-force elements must enter the checkpoint before phase 3;
- the rear guard receives a separate release cue after the main body crosses;
- victory requires four original withdrawal-force elements in extraction and the command IFV present;
- a warning occurs at 480 seconds and the mission fails closed at 600 seconds.

The objective library provides stable objective identities and progress presentation. `objectiveMode: scripted` keeps mission-script phase order and final outcome authoritative.

## Salvage decision

The disabled recovery vehicle composes two existing contracts:

- UFR-044 owns destruction, wreck materialization, scuttling consequences, salvage work, recovered values, and obstruction cleanup.
- UFR-054 owns resource collection and the 100-metal authored salvage node.

The mission script observes only public outcomes:

- reaching 180 player metal records a `recovered` candidate;
- destruction of stable asset `disabled-recovery-vehicle` records a `scuttled` candidate;
- branch commitment occurs on the following fixed tick, preserving UFR-086 no-same-tick-cascade semantics;
- if both signals occur during the same fixed tick, declaration order deterministically selects `scuttled` as the fail-safe result.

No new salvage rate, wreck rule, resource transfer, scuttle action, or obstruction behavior is introduced.

## Force-preservation scoring

`operation-ember-line.force-preservation` is a mission-specific deterministic debrief adapter. It counts only five authored identities:

- `command-ifv-1`;
- `mechanized-infantry-1`;
- `mechanized-infantry-2`;
- `support-artillery-1`;
- `rear-guard-1`.

Unknown IDs and duplicates cannot increase score. Inputs are bounded before calculation.

The 100-point policy consists of:

- 30 points for victory;
- 8 points for each surviving original force element;
- 10 points if the original rear guard survives;
- 5 points for each completed delaying position, capped at two;
- 10 points for recovered salvage, 5 for scuttled salvage, and 0 for abandonment.

Scores of 90 or more award `disciplined-withdrawal`; scores of 75–89 award `line-preserved`. The adapter emits a UFR-089-compatible debrief source and JSON-compatible campaign consequences. It does not mutate a campaign profile, apply modernization choices, or replace UFR-091 point policy.

## Checkpoint handoff

The mission publishes three UFR-090 checkpoint boundaries:

- `forward-delay-released` after phase 1;
- `second-delay-released` after phase 2;
- `main-body-through-checkpoint` after phase 3.

A runtime owner may materialize these checkpoints only after the corresponding phase transition. Restore must preserve mission-script variables, trigger activation counts, authored force identities, salvage decision, objective state, resource totals, deadline, and rear-guard status. No checkpoint may be authored at or after 600 seconds.

## Verification

Focused verification commands:

```bash
node --check src/content/campaign/defensive-withdrawal-operation.js
node --check tests/campaign/defensive-withdrawal-operation.test.mjs
node --test tests/campaign/defensive-withdrawal-operation.test.mjs
bash verify.sh
```

The focused suite validates map, objective, mission-script, briefing, and debrief schemas; stable cross references; unit IDs; deterministic recovery and scuttle branches; simultaneous-signal tie-breaking; both delay lines; checkpoint ordering; rear-guard extraction; deadline failure; optional-objective independence; bounded identity-safe scoring; reproducible debrief consequences; and composition through the existing UFR-044 wreck/salvage lifecycle.

## Evidence ceiling

`CONTRACT_COMPLETE` is the highest justified evidence level until a live campaign loader materializes this operation in the assembled game. Repository browser smoke remains required to prove regression safety, but startup of another mission does not demonstrate runtime integration or player verification of Operation Ember Line.
