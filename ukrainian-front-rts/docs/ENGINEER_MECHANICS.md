# Engineer mines, obstacles, and breaching

`src/combat/engineer-mechanics-system.js` owns deterministic engineer policy for mines, mine detection and clearance, field obstacles, breaching, demolition charges, and renderer/UI-neutral clearance feedback.

The module is browser-independent and immutable. It does not mutate `Game`, navigation grids, entities, renderer objects, UI state, mission scripts, or resource balances. Callers apply returned state and event records at the authoritative integration boundary.

## Ability targeting contract

`ENGINEER_ABILITY_PROFILES` composes the UFR-041 targeting contract:

- mine deployment and obstacle construction use passability-checked point targeting;
- mine detection uses area targeting;
- obstacle breaching and demolition charges use hostile unit/structure targeting;
- all profiles expose stable IDs and presentation telegraph kinds.

The ability system remains responsible for range, target allegiance/domain, passability, line-of-sight, cooldown, cancellation, and channel lifecycle. This module begins after targeting confirmation and owns the resulting engineer state transition.

## Mines

`deployMine` creates a concealed mine with a stable monotonic ID, owner, placement point, arming delay, trigger radius, damage class, domain policy, detection difficulty, clearance difficulty, and trigger probability.

`tickEngineerMechanics` advances arming time deterministically. Mines cannot trigger before arming completes.

`scanForMines` requires an injected random source and processes enemy mines in stable ID order. Detection probability combines the scanner's detection rating, configured base chance, distance inside the scan radius, and each mine's detection difficulty. Successful scans record which side knows the mine; they do not reveal it globally.

`resolveMineTriggers` checks armed hostile mines by distance, target domain, trigger probability, and target mine-avoidance rating. Triggered mines are removed and emit damage events for the combat owner to resolve.

`clearMine` requires side-specific detection knowledge. Successful clearance removes the mine. Failed clearance may detonate it according to the configured policy and emits an explicit engineer-targeted damage event.

## Obstacles and breaching

`beginObstacleConstruction` creates wire, barricade, or tank-trap state. Profiles define hit points, required build work, required clearance work, and blocked movement domains.

`workObstacleConstruction` advances work using the engineer's build rate. Incomplete obstacles are non-blocking; completion makes them blocking and restores full configured hit points.

`breachObstacle` advances hostile clearance using the engineer's clearance rate. Completion marks the obstacle breached, sets hit points to zero, and removes its blocking flag. The navigation owner consumes that transition to invalidate or rebuild passability; this module never writes navigation cells directly.

## Demolition charges

`placeDemolitionCharge` creates an unarmed charge with a stable ID, owner, target reference, point, damage, radius, damage class, and defusal difficulty.

`armDemolitionCharge` starts a deterministic fuse. `tickEngineerMechanics` removes expired charges and emits `demolition-detonated` events. UFR-042's area-damage policy remains responsible for splash falloff, friendly fire, building damage, and minimum-damage rules.

`defuseDemolitionCharge` uses injected randomness plus engineer defusal skill and charge difficulty. Success removes the charge; failure leaves state unchanged.

## Clearance feedback

`engineerClearanceSnapshot` returns immutable presentation-owned records for known mines, visible obstacles, and demolition charges. Enemy mines remain absent until detected by the viewing side. Records expose status, progress, risk, fuse state, and recommended action without exposing simulation references.

Renderer and UI consumers may display mine markers, construction/breach progress, fuse warnings, and valid actions. They must not change detection, trigger, clearance, construction, breach, or detonation outcomes.

## Ownership boundaries

- UFR-041 owns targeting, range, passability, cooldown, cancellation, and telegraphs.
- UFR-042 owns area-damage resolution for mine and demolition events.
- Navigation tasks own path blockers, grid invalidation, obstacle footprints, and cursor routing.
- Faction/content tasks own engineer availability, costs, limits, ratings, and obstacle/mine balance data.
- Economy tasks own resource payment and refunds.
- Renderer, UI, audio, and effects tasks consume events and snapshots only.
- Mission scripting may deploy or query engineer objects through this public contract but does not duplicate its rules.
