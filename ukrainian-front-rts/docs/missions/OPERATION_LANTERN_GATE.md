# Operation Lantern Gate — authored breach operation

## Scope

UFR-098 defines a deterministic campaign operation built from the public UFR-048 and UFR-086–092 contracts. The operation is fictionalized and contains military combatants, field obstacles, and military infrastructure only. It does not use real public figures, civilian targets, documentary claims, or copied commercial-game material.

The implementation is declarative content under `src/content/campaign/breach-operation.js`. It does not change navigation algorithms, engineer mechanics, combat resolution, economy balance, AI planning, renderer behavior, or campaign framework ownership.

## Player intent

The operation teaches and tests a four-part breach sequence:

1. **Reconnaissance:** move the reconnaissance element into the overlook to identify the central seam.
2. **Deception:** optionally demonstrate against the western lane, causing the enemy mobile reserve to commit away from the main effort.
3. **Breach:** escort the engineer team into the obstacle belt and clear the authored wire, tank-trap, and minefield objects through UFR-048-owned mechanics.
4. **Exploitation:** move two assault elements into the eastern exploitation zone before the seven-minute deadline.

The optional deception does not delete enemy forces. It deterministically spawns a diverted reserve group on the western side, making the consequence visible and replayable.

## Authored map

`operation-lantern-gate.map` uses authored-map format version 1:

- 40 × 24 cells at 32 world pixels per cell;
- industrial-steppe terrain with roads, mud, rubble, shelterbelts, and a prepared obstacle belt;
- separate player, reconnaissance, engineer, decoy, enemy-line, command, and reserve starts;
- cell-space regions for assembly, reconnaissance, deception, breach, exploitation, and enemy reserve;
- stable props for wire, tank traps, a marked minefield, and the enemy command dugout;
- explicit metadata connecting each engineer object to the UFR-048 contract.

The minefield prop is descriptive authored content, not an alternate mine simulation. A runtime composition owner must instantiate its six mines through `deployMine()` and resolve clearance through `clearMine()`. Wire and tank traps must be composed through the existing obstacle state and `breachObstacle()` boundary. The operation never writes navigation passability directly.

## Objectives

The UFR-087 objective library owns five stable objectives:

| ID | Type | Required behavior |
| --- | --- | --- |
| `recon-breach-corridor` | recon | A tagged friendly reconnaissance element enters the overlook. |
| `commit-breach-engineers` | escort | A tagged engineer element reaches the breach lane; losing it first fails the objective. |
| `clear-breach-lane` | destroy | All three tagged obstacle objects are neutralized. |
| `exploit-before-reserves` | escort/timed | Two tagged assault elements reach the exploitation zone within 420 seconds. |
| `western-deception` | optional recon | A tagged decoy force enters the western axis. |

Objective IDs are shared by the briefing model and deterministic scenario tests. The script does not duplicate objective evaluation.

## Scripted phases

Mission-script version 1 supplies world-space regions and ordered triggers:

- reconnaissance grants a bounded intelligence reward and queues a fictional command cue;
- the optional deception records its commitment and spawns two diverted reserve squads;
- each stable obstacle identity increments the cleared-obstacle variable once;
- all three obstacle records open the breach phase on the following fixed tick;
- two assault elements entering the exploitation zone advance the operation to phase 3;
- a five-minute warning is queued while exploitation remains incomplete;
- at 420 seconds, an incomplete exploitation phase resolves defeat.

All triggers are one-shot and declaration-ordered. The deliberate one-tick transition between the third obstacle record and `breach-opened` preserves the UFR-086 no-same-tick-cascade rule.

## Composition handoff

The operation descriptor includes stable composition records for:

- one Ukrainian engineer element tagged `breach-engineer`;
- one reconnaissance element tagged `recon-team`;
- two assault elements tagged `assault-force`;
- one optional demonstration element tagged `decoy-force`;
- three hostile engineer objects tagged `breach-obstacle`.

A later campaign-runtime composition owner may materialize these records, but must preserve their stable `scriptId`, `tag`, objective IDs, region IDs, trigger order, and seven-minute deadline. Difficulty profiles may alter force composition only after UFR-103; they must not silently rename or reorder the contract.

## Verification

Focused verification:

```bash
node --check src/content/campaign/breach-operation.js
node --check tests/campaign/breach-operation.test.mjs
node --test tests/campaign/breach-operation.test.mjs
bash verify.sh
```

The focused tests validate:

- authored-map loading, immutability, non-overlapping road features, and obstacle metadata;
- objective, mission-script, and briefing schemas;
- references to the public `breachObstacle()` and `clearMine()` operations;
- objective progression from reconnaissance through exploitation;
- deterministic reserve diversion and mission-script record order;
- fail-closed behavior after the seven-minute deadline.

Until a live campaign loader materializes the authored map, engineer objects, forces, briefing, and browser mission flow, the highest justified completion evidence is `CONTRACT_COMPLETE`. Browser startup smoke still remains mandatory to prove this isolated content does not break the assembled application.
