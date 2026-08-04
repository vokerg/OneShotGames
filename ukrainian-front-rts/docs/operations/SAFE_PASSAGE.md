# Safe Passage — UFR-097 authored operation

## Scope

`src/content/campaign/urban-defense-operation.js` defines one deterministic fictional urban-defense and evacuation operation using the public contracts delivered by UFR-087 through UFR-092.

The module owns declarative operation data only:

- a version 1 authored map;
- objective-library definitions;
- mission-script triggers and presentation requests;
- briefing/debrief metadata;
- checkpoint placement metadata;
- fictional-framing and civilian-representation notes.

It does not install the operation into the active three-mission browser menu, change navigation algorithms, add combat or garrison mechanics, modify economy/balance values, or create a second campaign runtime. The future campaign mission integration owner should load this operation through the existing authored-map, mission-script, objective, campaign-flow, checkpoint, and narrative adapters.

## Operation outline

**Operation ID:** `operation-safe-passage`  
**Map ID:** `map-safe-passage`

The player holds an evacuation hub on the western side of a fictional urban district while a protected transport manifest moves from east to west. Two timed hostile assault groups pressure the marked route. Existing garrison-capable urban props identify defensive positions without redefining the UFR-047 occupancy rules.

Required objectives:

1. Hold the evacuation hub for 420 simulation seconds.
2. Escort the protected transport column into the western exit region.

Optional objectives:

- recover an isolated aid team;
- preserve the field clinic;
- preserve the waterworks site.

The map, script, objectives, briefing, and operation envelope are deeply immutable and use stable identifiers.

## Civilian and collateral model

No individual civilian entity is spawned, selected, ordered, targeted, or scored. Civilian movement is represented by:

- a protected transport **manifest** attached to an ordinary escort target;
- non-targetable district metadata;
- two protected civic sites;
- fictional command and dispatcher dialogue.

This keeps civilians safely abstracted while still creating operational constraints.

The mission script tracks protected-site losses through `collateralIncidents`:

```text
0 losses → full optional protection remains possible
1 loss   → operation continues with a warning
2 losses → deterministic defeat in the same mission-script update
```

The defeat trigger checks both protected-site destruction states directly. Its finish action executes after trigger evaluation but before the objective phase, preserving UFR-086's no-same-tick-cascade contract while preventing required objectives from resolving a victory on the second-loss tick.

## Contract integration

| Concern | Existing owner used by this operation |
| --- | --- |
| Authored terrain, starts, regions, props, route metadata | `src/core/authored-map.js` |
| Timed assaults, dialogue, weather, protected-site accounting | `src/systems/mission-script-system.js` |
| Defend, escort, rescue, optional-objective semantics | `src/systems/objective-library.js` |
| Briefing normalization and presentation data | `src/ui/campaign-flow.js` |
| Trigger-safe checkpoint compatibility | `src/core/mission-checkpoint-service.js` and the mission checkpoint runtime |
| Dialogue/subtitle presentation | `src/ui/narrative-presentation.js` |
| Unit/building identifiers and team vocabulary | `src/config.js` |

The operation intentionally consumes these APIs without modifying their ownership or lifecycle.

## Verification

Focused tests are in `tests/campaign/urban-defense-operation.test.mjs`. They verify:

- authored-map, mission-script, objective-library, and briefing validation;
- canonical current unit, building, and team identifiers;
- abstracted civilian representation with no civilian entity type;
- one-loss tolerance and deterministic two-loss defeat before objective victory can resolve;
- complete required escort/defense flow with independent optional objectives;
- deep immutability and stable operation identifiers.

Repository-wide verification remains `bash verify.sh`. Browser startup smoke proves the assembled application still starts, but this operation remains declarative until a later campaign integration task mounts authored operations in the active runtime.