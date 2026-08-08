# The Long Night — UFR-096 authored operation

## Scope

`src/content/campaign/lower-dnipro-bridgehead-operation.js` rebuilds the legacy `kherson` campaign slot as an authored Lower Dnipro bridgehead operation using the existing map, mission-script, objective-library, briefing, and checkpoint contracts.

The mission owns composition and deterministic sequencing only. It does not add a new logistics, visibility, combat, or AI subsystem and does not mount itself into the active browser campaign.

## Operation design

**Operation ID:** `operation-long-night`  
**Map ID:** `map-lower-dnipro-bridgehead`

The authored 32 × 24 floodplain map separates a rear logistics area from the forward bridgehead with a six-cell-wide river band and two crossing corridors. A command bunker beyond the bridgehead becomes the counterattack target after the six-wave defense window.

Required objectives are:

1. deliver the river logistics team into the bridgehead;
2. raise the fuel reserve to 320;
3. hold the bridgehead command post through 300 seconds;
4. survive through the six authored assault windows;
5. destroy the hostile command bunker during the counterattack.

## River logistics

The legacy starting economy is preserved at 430 metal, 260 fuel, and 230 intel. A canonical engineer unit represents the river logistics package. Reaching the bridgehead triggers an existing mission-script resource action that grants 80 fuel, taking the unspent starting reserve above the 320 sustainment threshold without inventing a separate transport economy.

## Night visibility

The opening script applies `river-night` weather at 0.85 intensity. At 240 seconds it transitions to `predawn-river-mist` at 0.45 intensity. These are authored presentation states and do not redefine line-of-sight simulation ownership.

## Command decision and wave choices

A single unit with script ID `command-liaison` is the decision selector. Moving it into the north or south command sector records `reserveAxis` exactly once under ordinary play. Later wave-three and wave-five compositions react deterministically to that decision.

The six assault windows are authored at 45, 90, 135, 180, 225, and 270 seconds. At 300 seconds the counterattack is explicitly released and the command bunker is highlighted.

Using one dedicated selector rather than any friendly unit avoids ambiguous north/south command activation when the rest of the force occupies both sectors.

## Checkpoints

The operation publishes stable boundaries for:

- river logistics delivered;
- reserve axis committed;
- counterattack released.

## Verification

Focused coverage in `tests/campaign/lower-dnipro-bridgehead-operation.test.mjs` validates public contracts, legacy economy and six-wave identity, river topology, canonical identifiers, resource delivery, north and south command choices, deterministic branch-specific wave three behavior, visibility transition, counterattack release, checkpoints, and immutability.

Repository-wide verification remains `bash ./verify.sh`.

## Evidence boundary

A passing UFR-096 implementation justifies `CONTRACT_COMPLETE`. Runtime campaign mounting and player verification are downstream responsibilities and are not claimed by this task.
