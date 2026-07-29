# Navigation contracts

`src/navigation/navigation-grid.js` owns deterministic, browser-independent passability data. `src/navigation/pathfinder.js` owns pure path search over that data. `src/navigation/waypoint-route.js` translates path results into runtime-ready world-space waypoints. `src/systems/navigation-movement-system.js` synchronizes runtime map/building state, delegates fixed-step unit movement through those routes, and invokes `src/systems/unit-collision-system.js` after all units have advanced for the step.

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

`removeDynamicBlocker()` is the invalidation boundary for destruction, cancellation, or relocation. UFR-022 will build caching and invalidation policy above this API.

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

## Runtime integration

The fixed-step `units` phase calls `updateUnitsWithNavigation()`. The movement system lazily creates an 80×52 grid from `WORLD`, maps the current runtime terrain values to open/mud/rubble costs, and registers every live building as a ground/amphibious dynamic blocker using its authored width and height.

A stable building signature controls invalidation. Construction, destruction, or relocation increments the navigation revision and causes existing move/attack-move orders to request a fresh route from their current position. New order objects naturally replace old route state.

Ground `move` and `attackMove` orders expose the current route waypoint through the existing `Game.updateUnit()` contract. When that method reaches a waypoint and clears the order, the movement system advances one route step and restores the same order until the final destination is reached. Air units preserve their previous direct-movement behavior.

Blocked, unreachable, and search-limited player orders are cancelled safely. Ukrainian units receive actionable `lastError` feedback; simulation state never retains an order with an unusable route.

## Unit collision and soft separation

`resolveUnitOverlaps(units, getStats, options)` operates after every ground unit has completed its movement update for the fixed step. It derives a circular collision radius from the existing unit `size` value, ignores air and destroyed units, and clamps the full footprint inside world bounds.

Pairs are evaluated in stable unit-ID order. Exact coordinate overlaps use an ID-derived direction rather than randomness. Separation is accumulated per pass and applied simultaneously, so input-array order does not affect the result. Three bounded soft-separation passes run by default; subsequent fixed steps continue convergence without an unbounded solver loop.

Displacement is mass weighted using radius squared. Larger vehicles therefore move less than lighter infantry when they overlap. The collision system changes positions only: it does not rewrite orders, paths, facing, combat targets, or authored unit statistics.

The resolver requires unique stable unit IDs and returns frozen diagnostics containing considered-unit count, resolved-pair count, and maximum observed overlap. UFR-022 may expose those counters through the path service; formation preservation and stuck recovery remain UFR-023 and UFR-024.

## Determinism and ownership

- Terrain storage is row-major.
- Blocker queries and snapshots sort IDs.
- Snapshot arrays, path results, path cells, and waypoint arrays are frozen.
- Navigation modules import no game, renderer, UI, DOM, or browser service.
- `src/systems/navigation-movement-system.js` owns runtime synchronization and fixed-step movement sequencing.
- `src/systems/unit-collision-system.js` owns unit-to-unit footprint separation only.
- `Game` remains authoritative for speed, facing, buffs, combat acquisition, and physical movement before separation.
- Path caching, formations, stuck recovery, transports, and additional command types remain later queue tasks.
- Renderer feedback may mirror passability, route, and collision results but must not become authoritative.
