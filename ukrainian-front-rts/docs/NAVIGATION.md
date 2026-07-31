# Navigation contracts

`src/navigation/navigation-grid.js` owns deterministic, browser-independent passability data. `src/navigation/pathfinder.js` owns pure path search over that data. `src/navigation/waypoint-route.js` translates path results into runtime-ready world-space waypoints. `src/navigation/path-service.js` owns bounded route-template caching, revision invalidation, repath cadence, and deterministic path-search counters. `src/navigation/movement-recovery.js` owns deterministic stuck detection and bounded local-detour selection. `src/systems/navigation-movement-system.js` synchronizes runtime map/building state, delegates fixed-step unit movement through those routes, applies the recovery policy, and invokes `src/systems/unit-collision-system.js` after all units have advanced for the step.

## Coordinate model

A navigation grid has positive integer `width`, `height`, and `tileSize` values. Cells use zero-based integer coordinates. `worldToCell()` maps world positions by flooring against `tileSize`, and `cellToWorldCenter()` returns the center of a cell.

Out-of-bounds coordinates and footprints are rejected rather than silently clamped. This keeps authored map errors and invalid path requests observable. The waypoint-request boundary clamps player-facing formation destinations to the valid world extent before converting them to a goal cell.

## Movement layers and terrain

The initial movement layers are:

- `ground` for ordinary infantry and vehicles;
- `amphibious` for units that can cross both land and water;
- `air` for units unaffected by ground obstruction.

Terrain types provide a movement cost per layer. A `null` cost means impassable. Roads reduce cost, mud and rubble increase cost, water blocks ground movement, bridge cells restore ground passage across water, and blocked cells obstruct ground and amphibious movement.

Consumers may supply an alternate `terrainRules` table when constructing a grid, but every terrain identifier used by map data must exist in that table.

## Map-data input

`createNavigationGridFromMapData()` accepts a navigation-focused map-data object:

```js
{
  width: 80,
  height: 52,
  tileSize: 32,
  defaultTerrain: 'open',
  terrain: [{ x: 10, y: 4, type: 'water' }],
  bridges: [{ x: 11, y: 4 }],
  blockers: [{
    id: 'building-hq-1',
    origin: { x: 20, y: 12 },
    footprint: { width: 4, height: 3 },
    layers: ['ground', 'amphibious'],
  }],
}
```

Terrain entries are applied first, bridge entries second, and blockers last. That ordering lets a bridge cell intentionally override underlying water while preserving deterministic results.

## Footprints and blockers

Footprints are axis-aligned positive-integer rectangles anchored at an origin cell. `cellsForFootprint()` expands them deterministically in row-major order.

Dynamic blockers represent structures or other runtime obstructions. IDs must be unique and stable. Each blocker declares the movement layers it obstructs. `ignoreBlockerIds` allows the owner of a footprint to query passage without colliding with itself.

`removeDynamicBlocker()` is the low-level obstruction mutation boundary. Runtime synchronization derives a new navigation revision after construction, destruction, cancellation, or relocation; the path service clears cached route templates when the synchronized grid or revision changes.

## A* pathfinding

`findPath(grid, start, goal, options)` performs deterministic bounded A* search and returns a frozen result with `status`, `path`, `cost`, and `visited` fields. Paths include both the start and goal cells.

The status contract distinguishes successful paths, blocked starts, blocked goals, unreachable goals, and explicit search-limit exhaustion. Callers must handle these results rather than assuming every request produces a route.

Search options include:

- movement `layer` and unit `footprint`;
- blocker IDs to ignore for self-occupancy queries;
- `maxVisited`, which bounds expanded cells and defaults to the grid area;
- diagonal policy: `never`, `allow`, or `no-corner-cut`.

The default `no-corner-cut` policy permits diagonals only when both adjacent cardinal placements are passable for the same layer and footprint. Step cost is destination terrain cost multiplied by cardinal or diagonal distance. The heuristic uses the cheapest passable terrain cost for the requested layer, preserving admissibility when roads cost less than open ground.

Equal-cost candidates are ordered by total cost, heuristic, row, column, and insertion sequence. The open set uses a deterministic binary min-heap; repeated searches over identical snapshots and options return identical paths and visit counts.

## Waypoint routes

`requestWaypointRoute(grid, start, destination, options)` converts world-space positions to cells, runs the authoritative pathfinder, and converts the resulting cells back to frozen world-space waypoints. The exact clamped destination is appended after cell centers so formations retain their requested endpoint rather than stopping at the goal-cell center.

A route preserves the path status, goal cell, cost, and visited-cell count for runtime feedback and telemetry. Failed requests contain no waypoints. `nextIndex` is the only mutable route field; replacing an order creates a new route and does not mutate the previous order.

`followWaypointRoute(route, unit, dt, moveToward)` delegates physical movement to the simulation-owned callback and advances at most one waypoint per call. This keeps speed, facing, buffs, and fixed-step movement inside `Game` or a focused movement system while preventing those layers from duplicating path search.

## Path service

`NavigationPathService` wraps waypoint requests without changing pathfinding authority. Call `setGrid(grid, revision)` before requesting routes. Replacing either the grid object or revision clears cached templates and increments the invalidation counter; repeated calls with the same grid and revision are no-ops.

Cache identity includes:

- navigation revision;
- start and goal cells;
- exact clamped destination;
- movement layer and footprint;
- sorted ignored blocker IDs;
- diagonal policy;
- bounded-search `maxVisited` value.

Successful and failed bounded searches are both reusable. Cache entries contain immutable route templates. Every caller receives an independent route object with `nextIndex: 0`, so units may share immutable waypoint arrays without sharing mutable traversal progress.

The cache holds at most 256 templates by default. When full, it evicts the oldest inserted entry deterministically. Cache hits do not reorder entries.

Runtime requests use stable unit request IDs and fixed-step tick numbers. A new order forces an immediate plan. When a structure revision invalidates an existing route, repeated replans for the same unit are limited to one every six simulation ticks by default. A throttled request returns a deterministic `retryTick` and no route; the movement owner pauses the order rather than following stale waypoints. `releaseRequest()` removes cadence state when an order completes, fails, or changes to a non-navigation action.

`metrics()` returns a frozen deterministic snapshot containing request, search, cache hit/miss, throttle, invalidation, eviction, visited-cell, cache-entry, tracked-request, and active-revision values. The metrics intentionally exclude wall-clock timing so diagnostics cannot create platform-dependent replay behavior or test assertions.

## Runtime integration

The fixed-step `units` phase calls `updateUnitsWithNavigation()`. The movement system lazily creates an 80×52 grid from `WORLD`, maps the current runtime terrain values to open/mud/rubble costs, and registers every live building as a ground/amphibious dynamic blocker using its authored width and height.

A stable building signature controls invalidation. Construction, destruction, or relocation increments the navigation revision, installs the replacement grid in the persistent path service, and invalidates cached templates. Existing move/attack-move orders retain their original destination but stop using the stale route. They resume after the bounded cadence permits a new request from the unit's current position. New order objects force immediate planning and are not delayed by cadence state from a replaced order.

Formation orders request one anchor route and resolve each unit's slot or compressed slot at the movement boundary. Units that begin in the same cell with identical route contracts may reuse one immutable anchor-route template while keeping separate route progress and formation state.

Ground `move` and `attackMove` orders expose the current route waypoint through the existing `Game.updateUnit()` contract. When that method reaches a waypoint and clears the order, the movement system advances one route step and restores the same order until the final destination is reached. Air units preserve their previous direct-movement behavior.

Blocked, unreachable, and search-limited player orders are cancelled safely. Ukrainian units receive actionable `lastError` feedback; simulation state never retains an order with an unusable route.

## Unit collision and soft separation

`resolveUnitOverlaps(units, getStats, options)` operates after every ground unit has completed its movement update for the fixed step. It derives a circular collision radius from the existing unit `size` value, ignores air and destroyed units, and clamps the full footprint inside world bounds.

Pairs are evaluated in stable unit-ID order. Exact coordinate overlaps use an ID-derived direction rather than randomness. Separation is accumulated per pass and applied simultaneously, so input-array order does not affect the result. Three bounded soft-separation passes run by default; subsequent fixed steps continue convergence without an unbounded solver loop.

Displacement is mass weighted using radius squared. Larger vehicles therefore move less than lighter infantry when they overlap. The collision system changes positions only: it does not rewrite orders, paths, facing, combat targets, or authored unit statistics.

The resolver requires unique stable unit IDs and returns frozen diagnostics containing considered-unit count, resolved-pair count, and maximum observed overlap. Collision diagnostics remain separate from path-service metrics because collision and route search have distinct policy owners.

## Stuck recovery and local detours

Each active ground waypoint keeps fixed-step recovery state on its order. Progress is measured against the best distance reached toward the current movement target, not raw displacement. Side-to-side oscillation therefore continues accumulating stalled time unless the unit establishes a new best distance.

After 0.75 seconds without at least one world-unit of progress, the recovery policy selects one adjacent passable cell as a temporary detour. Candidates use the unit movement layer, reject diagonal corner cutting, exclude cells already attempted for the current waypoint, prefer lateral forward progress, and use row/column ordering to break ties deterministically.

Reaching a detour does not advance the route. The movement system restores the original formation-aware waypoint and resumes normal following. Recovery state resets when the waypoint advances, the route is invalidated, or the order changes.

A waypoint permits at most three distinct local detours. If no valid candidate exists or all attempts are exhausted, the movement order and target are cleared safely. Player-owned Ukrainian units receive `Unit is blocked and cannot reach the destination.` feedback instead of remaining indefinitely stalled or oscillating.

The recovery policy uses no wall clock, randomness, path-cache mutation, collision rewrite, or command-type expansion. It is a bounded local fallback above the existing path and collision contracts.

## Determinism and ownership

- Terrain storage is row-major.
- Blocker queries and snapshots sort IDs.
- Snapshot arrays, path results, path cells, waypoint arrays, cache templates, and metrics snapshots are frozen.
- Cache eviction follows insertion order; cache hits do not reorder entries.
- Repath cadence uses fixed-step ticks, never animation time or wall-clock time.
- Navigation modules import only core or sibling navigation modules; they do not import game, system, renderer, UI, DOM, or browser services.
- `src/navigation/path-service.js` owns cache identity, cache invalidation, cadence state, and path-search counters only.
- `src/navigation/movement-recovery.js` owns pure progress tracking and local-detour candidate ordering.
- `src/systems/navigation-movement-system.js` owns runtime synchronization, fixed-step movement sequencing, recovery-state application, and safe order cancellation.
- `src/systems/unit-collision-system.js` owns unit-to-unit footprint separation only.
- `Game` remains authoritative for speed, facing, buffs, combat acquisition, and physical movement before separation.
- Transports and additional command types remain separate queue tasks.
- Renderer feedback may mirror passability, route, cache, collision, and recovery results but must not become authoritative.
