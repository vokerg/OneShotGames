# Operation Iron Horizon — UFR-101 combined-arms offensive

## Scope

`src/content/campaign/combined-arms-offensive-operation.js` defines one deterministic fictional combined-arms campaign operation through the public authored-map, mission-script, objective-library, briefing/debrief, checkpoint, and progression handoff contracts delivered by UFR-087 through UFR-092.

The module owns declarative operation content and one pure persistent-force summary adapter. It does not add a new allied-AI planner, combat rule, navigation rule, campaign runtime, balance layer, renderer feature, or production asset.

## Operation structure

**Operation ID:** `operation-iron-horizon`  
**Map ID:** `map-iron-horizon`

The player attacks a fictional three-sector front:

1. reconnoitre the central axis;
2. neutralize the northern fire-control node;
3. reduce the central strongpoint;
4. destroy the southern logistics node;
5. break the eastern command post after the sector network is opened.

The 40 × 24 authored map provides separate northern, central, and southern axes, an allied northern entry, player reserve staging, three enemy reserve entries, and an eastern consolidation area.

## Allied-force handoff

The opening mission-script trigger deploys a tagged Ukrainian infantry/IFV spearhead through the existing team-unit reinforcement contract. The operation records:

- force tag `allied-ai-spearhead`;
- control mode `existing-team-ai-handoff`;
- stable route regions from the allied entry through the northern sector to consolidation;
- optional force-preservation objective and persistent-force modifier IDs.

A future assembled campaign owner may connect this authored group to the existing allied/team AI composition. This task does not create a separate AI scheduler or hidden simulation phase.

## Reserve commitment

The first sector destroyed records a reserve-axis candidate. Because mission-script actions execute after trigger evaluation, the matching reserve package is committed on the following fixed tick:

| First breach | Player reserve | Enemy response |
| --- | --- | --- |
| North | tank + IFV | southern tank/infantry counterattack |
| Center | artillery + IFV | northern IFV/infantry counterattack |
| South | tank + infantry | northern tank/IFV/infantry counterattack |

If multiple sectors fall in the same fixed step, declaration order is deterministic: north, center, then south. The last candidate therefore makes south the documented simultaneous-breach tie-break.

After any second sector falls, a separate four-unit armored counterattack deploys through the central entry on the next fixed tick. This preserves the UFR-086 no-same-tick-cascade contract.

## Objectives and checkpoints

Required objectives use only UFR-087 objective types:

- recon the central axis;
- destroy the three sector targets;
- destroy the eastern command post.

Optional objectives preserve the allied spearhead, escort at least one committed reserve unit into the eastern consolidation zone, and destroy four tagged enemy operational-reserve units. The reserve objective uses escort semantics so it cannot complete before the delayed reserve package exists.

Checkpoint metadata exposes stable boundaries after central reconnaissance, reserve commitment, two sectors secured, and all three sectors secured. A runtime checkpoint owner must preserve mission-script variables, trigger activation state, spawned force identities, objective state, and persistent tags.

## Persistent-force consequences

`COMBINED_ARMS_PERSISTENCE` defines three tagged force groups:

- allied spearhead;
- committed player reserve;
- player command cadre.

`evaluateCombinedArmsPersistence()` validates the reserve axis, normalizes non-finite or negative survivor counts to zero, and returns a deeply immutable summary containing preserved/lost states and stable campaign modifier IDs. It does not mutate campaign rosters. The existing campaign progression/runtime owner remains responsible for applying health, veterancy, unlock, and next-operation composition rules.

## Verification

Focused tests in `tests/campaign/combined-arms-offensive-operation.test.mjs` verify:

- authored-map, mission-script, objective-library, and briefing validation, including non-empty objective descriptions;
- canonical unit, building, team, region, objective, checkpoint, and tag references;
- northern reserve commitment and opposite-axis response;
- deterministic simultaneous-breach tie-breaking;
- next-tick final counterattack deployment;
- delayed reserve objectives remaining active until a reserve exists and reaches consolidation;
- required multi-sector completion independent of optional preservation;
- deterministic, immutable, finite persistent-force summaries and invalid-axis rejection.

Repository-wide verification remains `bash verify.sh`. Browser startup smoke proves the operation does not regress the assembled application, but the operation remains declarative until a later campaign loader mounts authored operations. The highest justified evidence for this task is therefore `CONTRACT_COMPLETE`.
