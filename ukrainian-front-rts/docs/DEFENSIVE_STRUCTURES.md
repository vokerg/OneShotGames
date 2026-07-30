# Defensive structure contract

`src/systems/defensive-structure-system.js` defines the deterministic, browser-independent contract for buildable battlefield defenses. It consumes placement results from UFR-055 and construction work from the UFR-056 owner. It does not mutate the navigation grid, worker orders, live combat entities, renderer, UI, or economy resources.

## Catalog

The versioned immutable catalog includes:

- **Field trench** — infantry occupancy, strong cover, concealment, and damage reduction without hard movement blocking.
- **Sandbag wall** — lighter cover that blocks vehicles and requires path-sever validation.
- **Checkpoint** — a durable blocking fortification with limited observation value.
- **Anti-vehicle obstacles** — vehicle-only blocking compatible with infantry passage and later breaching integration.
- **Defensive minefield** — a buildable footprint that emits an UFR-048-compatible mine deployment descriptor after construction.
- **Observation post** — sight and detection bonuses with no weapon behavior.
- **Remote sentry gun** — the initial active defense, with deterministic target selection and fixed-step firing cadence.

Each definition owns stable footprint, rotation, resource-cost, work, hit-point, terrain, flattening, blocking, cover, observation, mine, and weapon descriptors. Shared `src/config.js` content remains unchanged so active content and balance branches do not collide.

## Placement boundary

`createDefensePlacementRequest()` produces the exact footprint, terrain policy, blockers, cost, and work required by the placement owner. `evaluateDefensePlacement()` consumes an external placement evaluation and fails closed when bounds, terrain, overlap, or construction access are unavailable. Defenses that block required routes reject a path-sever result unless the definition explicitly permits it.

The caller remains responsible for tile snapping, authoritative terrain lookup, footprint collision, access-cell search, path-sever preview, resource payment, and navigation-grid revision commits.

## Construction and lifecycle

`createDefenseState()` starts a placed defense in `building`. `applyDefenseConstructionWork()` accepts deterministic work supplied by the construction owner, clamps exact completion, and emits reference-free start/completion events. It deliberately does not assign builders or calculate diminishing returns.

Operational defenses expose a presentation/effect snapshot containing cover, concealment, occupancy, observation, blocking, enabled state, and active-defense state. Damage is deterministic and emits a destruction handoff for UFR-044 rather than creating wrecks or rubble locally. Destroyed defenses retain their blocker state until `clearDestroyedDefense()` records cleanup.

## Active defense

The remote sentry gun selects only living, detected, hostile targets in its supported domain and range. Ordering is deterministic:

1. authored target-tag priority;
2. higher threat;
3. shorter distance;
4. stable target ID.

`tickActiveDefense()` preserves fixed-step cooldown, supports deterministic overflow across long ticks, caps shots per tick, and emits damage intent events. Projectile creation, accuracy, armor resolution, ammunition, audio, and effects remain with their existing owners.

## Integration ownership

- UFR-034 owns cover/concealment interpretation.
- UFR-048 owns mine arming, detection, triggering, clearance, obstacles, and breaching.
- UFR-055 owns placement validation and preview.
- UFR-056 owns builder assignment, construction rate, pause/resume, cancellation, and refunds.
- UFR-044 owns destroyed structure lifecycle, wreck/rubble, salvage, and obstruction cleanup policy.
- Navigation owners apply blocker descriptors and revision changes.
- Economy owners commit costs; balance owners tune values.
- UI/render/audio owners consume immutable snapshots and events.

## Verification

```text
node --check src/systems/defensive-structure-system.js
node --test tests/economy/defensive-structure-system.test.mjs
```

The focused suite covers all required defense families, footprint rotation, fail-closed placement, exact construction, cover/blocking/observation snapshots, mine deployment, active target ordering, fixed-step firing, enable/disable behavior, destruction handoff, cleanup, immutability, and invalid inputs.
