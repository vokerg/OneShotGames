# Hold the Crossing — UFR-094 authored operation

## Scope

`src/content/campaign/donbas-crossing-operation.js` rebuilds the legacy `donbas` campaign slot as a versioned, immutable authored operation using the public map, mission-script, objective-library, briefing, and checkpoint contracts delivered by UFR-086 through UFR-090.

The task is deliberately declarative. It does not mount the operation into the active browser campaign, replace the economy runtime, or add a competing AI system.

## Authored operation

**Operation ID:** `operation-hold-the-crossing`  
**Map ID:** `map-siverskyi-donets-crossing`

The 32 × 24 map is organized around a two-cell-wide river barrier and a defended bridge crossing. The west bank contains the support area and crossing command post; the eastern bank contains the hostile forward command and deterministic reinforcement staging. An isolated repair team in the northern shelterbelt creates an optional rescue excursion that competes with bridgehead security.

Required objectives preserve the legacy mission goals while making the crossing fight explicit:

1. recover 500 materiel;
2. establish an infantry assembly area;
3. establish a repair and recovery point;
4. hold the crossing command post through 360 seconds of escalation;
5. destroy the hostile forward command post.

The isolated repair-team recovery is optional.

## Economy onboarding

The opening script establishes the legacy starting economy exactly: 240 metal, 110 fuel, and 25 intel. Two authored materiel caches support the 500-metal onboarding target, while the briefing and scripted threshold cue direct the player toward the required barracks and workshop contracts. No new resource semantics are introduced.

## Escalation and authored AI

Enemy behavior is represented as deterministic authored pressure phases for downstream runtime composition:

- 70 seconds — reconnaissance-in-force;
- 160 seconds — mechanized crossing pressure;
- 250 seconds — combined crossing assault with armor and artillery.

`DONBAS_AUTHORED_AI` records the phase entries, pressure regions, compositions, target priorities, and retreat policy. Mission-script reinforcement actions realize the deterministic force packages without redefining movement, targeting, combat, or general AI ownership.

## Checkpoints

The operation publishes three stable checkpoint boundaries:

- support area established;
- mechanized pressure begins;
- main crossing assault begins.

Checkpoint persistence and browser campaign mounting remain downstream integration responsibilities.

## Verification

Focused coverage lives in `tests/campaign/donbas-crossing-operation.test.mjs` and validates authored-map, mission-script, objective-library, and briefing contracts; legacy economy fidelity; canonical identifiers; river/bridge topology; deterministic escalation; optional rescue; checkpoint metadata; and deep immutability.

Repository-wide verification remains `bash ./verify.sh`.

## Evidence boundary

UFR-094 can claim `CONTRACT_COMPLETE` once the repository verifier passes. It must not claim `RUNTIME_INTEGRATED` or `PLAYER_VERIFIED` because this task does not mount the operation into the active campaign runtime.
