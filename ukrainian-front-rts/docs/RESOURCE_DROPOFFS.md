# Resource drop-off capabilities

`src/systems/resource-dropoff-system.js` owns the building capability and deterministic destination-selection policy introduced by UFR-053. Worker assignment, gathering, carrying, delivery, and source retargeting remain owned by `src/systems/worker-gather-system.js`.

## Capability contract

The capability registry is versioned by `RESOURCE_DROPOFF_CAPABILITY_VERSION`.

Version 1 declares:

- `hq` accepts metal, fuel, and intel;
- `depot` accepts metal, fuel, and intel;
- barracks, workshops, and buildings without a declared capability accept nothing by default.

At mission start and whenever `Game.addBuilding` succeeds, the controller materializes the canonical capability onto the building as a frozen `dropOffKinds` array plus `dropOffCapabilityVersion`. This uses the compatibility seam already consumed by UFR-051. Mission or future faction content may provide an explicit `dropOffKinds` array on a building instance; it is validated and canonicalized instead of being overwritten.

A drop-off is operational only when it:

- is present in the authoritative `game.buildings` collection;
- belongs to the worker's team;
- has positive hit points;
- is not under construction;
- explicitly accepts the carried resource kind.

Destroyed, captured, unfinished, removed, or incompatible buildings are never selected.

## Deterministic travel-cost selection

Runtime selection uses the authoritative navigation grid supplied by `synchronizeNavigationGrid(game)`.

For each operational candidate, the system:

1. derives the building footprint from construction placement metadata or the existing building dimensions;
2. enumerates passable perimeter cells within worker delivery range;
3. runs the existing deterministic A* pathfinder from the worker cell to each valid approach cell;
4. retains the lowest terrain-weighted path cost for that building;
5. excludes candidates with no reachable approach;
6. chooses the lowest-cost building, then breaks equal-cost ties by stable building ID and collection order.

The selected approach point is stored on the return order. The controller redirects the existing worker movement call to that perimeter point rather than the blocked building center. Selection is cached against the navigation revision and is recomputed only when the grid revision changes or the selected building becomes invalid.

The exported selector supports an injected travel-cost function for deterministic unit tests and future path-service integration. A Euclidean fallback exists only for isolated fixtures that do not provide a navigation state; browser composition always injects the authoritative navigation synchronizer.

## Lifecycle and failure behavior

The controller wraps four existing public boundaries:

- `Game.start` — materializes capabilities after mission initialization;
- `Game.addBuilding` — materializes capabilities on newly created structures;
- `Game.updateWorker` — validates or selects a return destination before UFR-051 executes the worker step;
- `Game.move` — substitutes the selected reachable approach point for return orders.

If no reachable operational drop-off accepts the carried resource, the return order is cancelled safely, cargo remains on the worker, and Ukrainian players receive a reason-specific error. No resource is deleted and no unreachable building is selected.

Disposal restores all wrapped methods and removes the public `game.selectResourceDropOff` inspection/selection delegate.

## Ownership boundaries

- UFR-051 remains the worker-order and gather-cycle owner.
- UFR-052 owns idle-worker controls and task visibility.
- UFR-054 owns extraction rates, carry capacities, depletion, salvage, regeneration, and mission overrides.
- UFR-057 owns capture and destruction lifecycle effects that may invalidate a drop-off.
- Navigation modules remain the sole owners of terrain costs, passability, blockers, and pathfinding.
- Renderer and UI code may display capabilities or selected destinations but must not choose them independently.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/resource-dropoff-system.js
node --check src/main.js
node --check tests/economy/resource-dropoff-system.test.mjs
node --test tests/economy/resource-dropoff-system.test.mjs
bash verify.sh
```

Focused coverage includes registry validation, capability materialization, operational-state rejection, deterministic perimeter generation, navigation-cost measurement, cost-over-distance selection, unreachable exclusion, stable tie-breaking, compatibility fallback, controller lifecycle, construction/start integration, approach movement, and safe unreachable cancellation.
