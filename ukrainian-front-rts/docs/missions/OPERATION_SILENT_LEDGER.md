# Operation Silent Ledger — authored deep-strike logistics operation

## Scope

UFR-099 defines a deterministic fictional campaign operation using the public authored-map, mission-script, objective, briefing, checkpoint, drone/EW, artillery, and air-defense contracts. The scenario contains military combatants and fictional military infrastructure only. It does not introduce documentary claims, real public figures, civilian targets, copied commercial-game material, or new gameplay mechanics.

The implementation is immutable declarative content in `src/content/campaign/deep-strike-logistics-operation.js`. It does not change navigation, combat resolution, logistics rules, balance numbers, AI planning, renderer behavior, or campaign-framework ownership.

## Player intent

The operation has five phases:

1. **Reconnaissance:** move the tagged reconnaissance drone through the central corridor and identify the target network.
2. **Branch choice:** neutralize either the northern air-defense command node or the southern fuel depot first.
3. **Support consequence:** the air-defense route admits one drone-strike reinforcement; the fuel route admits one counter-battery artillery reinforcement.
4. **Deep strike:** destroy the forward logistics hub after a branch has been committed.
5. **Extraction:** withdraw both tagged strike elements to the western extraction zone before ten minutes elapse.

Destroying both enabling targets remains optional. If both are destroyed during the same fixed step, declaration order produces a stable fuel-depot tie-break before support is committed on the following tick. This avoids timing-dependent or random branch selection.

## Authored map

`operation-silent-ledger.map` uses authored-map format version 1:

- 48 × 28 cells at 32 world pixels per cell;
- a primary east–west logistics road and non-overlapping north–south feeder road;
- shelterbelts, mud, and rubble separating the two branch approaches;
- stable player insertion, reconnaissance, artillery, and extraction starts;
- stable enemy air-defense, fuel, artillery, and logistics-hub starts;
- cell-space regions for reconnaissance, both branch targets, enemy artillery, the main hub, and extraction;
- military target props carrying script IDs, tags, mechanic ownership, and prerequisite contract IDs;
- one optional intelligence cache and one drone-relay prop.

The authored props describe composition boundaries only. A later runtime owner must materialize them through the existing UFR-037, UFR-038, UFR-039, UFR-054, and UFR-065 mechanics rather than treating map metadata as an alternate simulation.

## Objectives

The UFR-087 objective library owns seven stable objectives. Branch selection remains script-authoritative because the objective library intentionally has no OR-combinator; the mission is marked `objectiveMode: scripted` so no alternate victory path bypasses the chosen route:

| ID | Type | Required behavior |
| --- | --- | --- |
| `recon-logistics-corridor` | recon | The tagged friendly reconnaissance drone enters the corridor. |
| `neutralize-air-defense-node` | optional destroy | The northern air-defense node is neutralized. |
| `destroy-fuel-depot` | optional destroy | The southern fuel depot is destroyed. |
| `destroy-logistics-hub` | destroy | The tagged main logistics target is destroyed. |
| `extract-strike-package` | extract/timed | Both strike elements enter extraction within 600 seconds. |
| `neutralize-artillery-battery` | optional destroy | The enemy artillery battery is silenced. |
| `preserve-fire-support` | optional defend | The initial supporting artillery section survives the operation window. |

Objective IDs are shared by the briefing model and deterministic tests. The script requires one of the two optional enabling-target objectives to be realized before the hub/extraction victory path can execute. This preserves independent objective progress while keeping the branch OR-condition deterministic and explicit.

## Scripted branch and phase order

Mission-script version 1 supplies world-space regions and declaration-ordered one-shot triggers:

- reconnaissance advances phase 1, grants a bounded intelligence reward, and presents both choices;
- target destruction is ignored for branch commitment until reconnaissance has occurred;
- each destroyed enabling target records a candidate and increments the optional two-target count;
- support is committed on the following fixed tick, preserving the UFR-086 no-same-tick-cascade rule;
- air-defense-first grants a tagged `uaDrone` reinforcement through the northern support entry;
- fuel-first grants a tagged `uaArtillery` reinforcement through the southern support entry;
- the main logistics target cannot advance the phase until a branch is committed;
- extraction requires a committed branch, a destroyed hub, and both strike elements inside the extraction region;
- an eight-minute warning precedes a fail-closed ten-minute deadline.

## Existing mechanic composition

Focused tests exercise the exact public contracts referenced by the authored operation:

- **UFR-038 drone/EW:** docked-to-airborne launch, connected spotted-target strike, payload consumption, and counterplay signature;
- **UFR-037 artillery:** setup-to-ready transition, minimum-range and spotting validation, and bounded salvo sizing;
- **UFR-039 air defense:** optical/radar detection and an engagement-envelope threat adapter for an airborne strike drone;
- **UFR-054/UFR-065 logistics:** authored fuel-depot and logistics-hub identities remain data targets; no new extraction, depletion, capture, or resupply rule is added.

The operation also references only existing runtime unit IDs: `uaDrone`, `uaInfantry`, `uaIfv`, and `uaArtillery`.

## Checkpoint handoff

The mission descriptor publishes three stable UFR-090 checkpoint boundaries:

- after corridor reconnaissance (`phase 1`);
- after support-route commitment (`phase 2`);
- after logistics-hub destruction (`phase 3`).

A later runtime composition owner may materialize these checkpoints but must preserve mission-script state, trigger activation counts, branch choice, spawned support identities, objective state, and the ten-minute deadline. No checkpoint may be authored after the deadline.

## Verification

Focused verification:

```bash
node --check src/content/campaign/deep-strike-logistics-operation.js
node --check tests/campaign/deep-strike-logistics-operation.test.mjs
node --test tests/campaign/deep-strike-logistics-operation.test.mjs
bash verify.sh
```

The focused suite validates:

- authored-map loading, immutability, dimensions, and non-overlapping road features;
- objective, mission-script, and briefing schemas;
- map, mission, objective, target, checkpoint, and runtime-unit cross-references;
- deterministic air-defense-first and fuel-first support consequences;
- deterministic simultaneous-target tie-breaking;
- required objective progression and optional-objective independence;
- ten-minute fail-closed extraction behavior;
- composition through the existing drone, artillery, and air-defense public APIs.

Until a live campaign loader materializes this operation in the assembled browser campaign, the highest justified evidence is `CONTRACT_COMPLETE`. The repository browser startup smoke remains mandatory to prove the isolated content does not regress the assembled application.
