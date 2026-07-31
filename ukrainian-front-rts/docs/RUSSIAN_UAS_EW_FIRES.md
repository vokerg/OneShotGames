# Russian UAS, electronic warfare, fires, and air-defense branch

## Purpose

UFR-077 defines the declarative Russian reconnaissance-strike, electronic-warfare, artillery, and air-defense content contract used by later runtime, AI, art, balance, and campaign work. It completes the Echeloned Pressure support branch without changing the current browser roster or duplicating authoritative drone, artillery, air-defense, production, or technology-tree rules.

The executable contract is `src/content/russian-uas-ew-fires.js`. Focused coverage is in `tests/content/russian-uas-ew-fires.test.mjs`.

## Ownership and boundaries

This module owns Russian profile identities, stable roster-node mapping, variant gates, capacity and resource costs, deployment posture, resupply priority, capability descriptors, counters, vulnerabilities, support links, and player-use guidance.

It does not own:

- UFR-037 artillery state transitions, ammunition consumption, salvo cadence, scatter, spotting enforcement, or counter-battery signature decay;
- UFR-038 drone launch, recovery, loiter, link-loss, strike, or interception resolution;
- UFR-039 detection, engagement envelopes, target scoring, missile travel, ammunition reservation, or overkill prevention;
- UFR-070 technology-tree structure, producer ownership, tiers, or prerequisite ordering;
- live production, command-capacity, logistics, renderer, AI, input, UI, mission, or balance integration.

Consumers should use the exported runtime adapters instead of copying profile fields into parallel configuration objects.

## Stable UFR-070 mapping

| Stable roster node | Profiles | Producer | Required UFR-070 nodes |
| --- | --- | --- | --- |
| `ru.recon-uav` | broad-area reconnaissance UAV; one-way reconnaissance-strike UAV | `ru.uas-ew-battalion` | `ru.uas-ew-battalion`; strike variant also requires `ru.spectrum-denial` |
| `ru.jammer` | persistent spectrum-denial company | `ru.uas-ew-battalion` | `ru.uas-ew-battalion`, `ru.spectrum-denial` |
| `ru.self-propelled-gun` | prepared self-propelled gun; saturation rocket artillery | `ru.fires-regiment` | `ru.fires-regiment`, `ru.prepared-fires`; rocket variant also requires `ru.operational-mass` |
| `ru.sam-battery` | short-range point defense; prepared medium-range battery | `ru.air-defense-battalion` | `ru.air-defense-battalion`, `ru.layered-air-defense` |

Variants remain beneath stable roster namespaces. The shared UFR-070 schema is not modified.

## Doctrine design

### Reconnaissance-strike chain

The reusable reconnaissance UAV has longer endurance, range, and link hardening. It generates broad contacts and artillery-quality tracks but carries no strike payload. The one-way variant trades endurance and hardening for a single shaped strike, requires a spotted target, and becomes effective only when reconnaissance and spectrum denial create a launch window.

This keeps reconnaissance and strike mechanically distinct. A player cannot obtain cheap persistent vision and a high-damage disposable strike from the same profile.

### Persistent spectrum denial

The jammer projects strong link and radar degradation from a prepared emission site. Its effect decreases deterministically with distance and drops outside the declared range. High emission signature, setup time, and vulnerability to anti-radiation fire, counter-battery action, and ground assault prevent it from becoming an unanswerable global debuff.

`getRussianJammerRuntimeContext()` produces the bounded `jammerStrength` input consumed by UFR-038 and UFR-039 contexts.

### Prepared artillery

The self-propelled gun carries deeper ammunition, moderate scatter, and sustained salvo capacity. It performs best from registered sectors with reconnaissance support and supply continuity. Repeated fire raises a normalized UFR-037 signature and creates counter-battery risk.

The rocket variant adds deep saturation and interdiction but has slower deployment, higher resource and capacity costs, larger scatter, greater per-shot signature, and a severe resupply burden. It is inefficient against dispersed low-value targets.

`getRussianArtilleryRuntimeConfig()` returns the exact UFR-037 configuration fields plus a distance-sensitive `requiresSpotter` result.

### Layered air defense

The short-range profile prioritizes loitering munitions and strike drones, carries more missiles, and protects artillery and EW assets at close range. The medium-range battery has the larger radar and engagement envelope, harder radar, higher missile damage, and missile-first target priority.

`getRussianAirDefenseRuntimeConfig()` returns canonical UFR-039 fields and target classes. The profile data does not bypass detection, missile travel, target reservation, or overkill prevention.

## Counterplay

The branch is intentionally vulnerable at several seams:

- reconnaissance and strike UAVs can be jammed, intercepted, dispersed against, or denied by layered air defense;
- jammer emissions expose a high-value static target to anti-radiation fire, artillery, and ground raids;
- prepared batteries depend on supply routes, spotting quality, and time to set up or displace;
- saturation rockets create a large counter-battery signature and expensive ammunition demand;
- air-defense batteries can be saturated, flanked, or suppressed by anti-radiation and ground action;
- destroying reconnaissance, EW, or supply nodes degrades the complex without requiring hidden faction-wide penalties.

## Public API

- `validateRussianUasEwFiresBranch()` validates ownership, UFR-070 mapping, variants, costs, family-specific runtime data, canonical combat classes, support links, and required role coverage.
- `getRussianUasEwFiresProfile()` resolves a stable profile identity.
- `getRussianUasEwFiresVariants()` resolves all profiles beneath a stable roster node.
- `availableRussianUasEwFiresProfiles()` applies ordered UFR-070 and variant prerequisites.
- `getRussianDroneRuntimeConfig()` exposes UFR-038-compatible drone configuration.
- `getRussianJammerRuntimeContext()` derives bounded distance-sensitive EW context.
- `getRussianArtilleryRuntimeConfig()` exposes UFR-037-compatible artillery configuration.
- `getRussianAirDefenseRuntimeConfig()` exposes UFR-039-compatible air-defense configuration.
- `composeRussianReconStrikeGroup()` returns immutable selected/rejected evidence, resource and capacity totals, ammunition totals, capability coverage, and doctrine-readiness flags.

## Verification expectations

Focused tests verify exact UFR-070 mapping, immutability, reconnaissance/strike separation, deterministic jammer falloff, UFR-037 spotting and signature fields, canonical UFR-039 target classes, layered air-defense distinctions, unlock rejection, complete task-group summaries, malformed-profile rejection, and public API input failures.

Later runtime integration must additionally run full repository verification and browser playtesting for production, launch/recovery, artillery setup and fire, resupply, target selection, missile travel, EW interaction, counter-battery behavior, minimap, zoom, selection, commands, and WASD camera control.
