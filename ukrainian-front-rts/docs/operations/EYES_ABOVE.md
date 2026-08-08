# Eyes Above — UFR-095 authored operation

## Scope

`src/content/campaign/zaporizhzhia-recon-strike-operation.js` rebuilds the legacy `zaporizhzhia` campaign slot as a deterministic reconnaissance-strike operation. It composes existing authored-map, mission-script, objective-library, briefing, and checkpoint contracts without adding replacement reconnaissance, EW, artillery, or AI simulation systems.

## Operation design

**Operation ID:** `operation-eyes-above`  
**Map ID:** `map-orikhiv-recon-strike`

The authored 32 × 24 steppe map exposes two materially different routes into the hostile firing belt:

- the northern shelterbelt route favors concealment and triggers a dismounted screen;
- the southern farm track is more direct and triggers a mobile infantry/IFV screen.

The approaches are independent rather than a fragile single-choice branch: using either route is recorded, and using both remains deterministic.

## Reconnaissance-strike chain

`ZAPORIZHZHIA_STRIKE_CHAIN` defines four explicit stages:

1. **Find** — establish drone reconnaissance over the artillery belt;
2. **Blind** — disable the forward EW node through the objective-library `disable` contract;
3. **Suppress** — destroy both tagged artillery sections;
4. **Exploit** — use either or both authored approaches as tactical conditions allow.

The operation also preserves the legacy 250-intelligence objective and starting economy of 320 metal, 190 fuel, and 70 intel.

## EW counterplay

The EW node is an ordinary canonical building with a stable script identity. Its objective completes when it is disabled to 35% health or worse, including destruction. This uses existing objective semantics; no bespoke jamming health model is introduced by the mission content.

## Optional target intelligence

A separate relay pocket beyond the main artillery belt is an optional drone-recon objective. Reaching it records the optional target package and grants a scripted 80-intelligence bonus. It is deliberately positioned beyond the primary targets so the player trades time and exposure for a richer debrief outcome.

## Checkpoints

Stable handoff boundaries are published for:

- artillery belt located;
- EW node suppressed;
- artillery belt suppressed.

## Verification

Focused coverage in `tests/campaign/zaporizhzhia-recon-strike-operation.test.mjs` validates public contracts, legacy economy fidelity, steppe topology, distinct routes, canonical identifiers, independent route reactions, objective-library EW disable semantics, strike-chain composition, optional intelligence, checkpoints, and immutability.

Repository-wide verification remains `bash ./verify.sh`.

## Evidence boundary

A passing UFR-095 implementation justifies `CONTRACT_COMPLETE`. Browser campaign mounting and playable runtime validation remain downstream work and are not claimed here.
