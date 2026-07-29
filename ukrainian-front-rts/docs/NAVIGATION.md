# Navigation contracts

`src/navigation/navigation-grid.js` owns deterministic, browser-independent passability data. `src/navigation/pathfinder.js` owns pure path search over that data. Neither module moves entities; runtime order integration begins with UFR-020.

## Coordinate model

A navigation grid has positive integer `width`, `height`, and `tileSize` values. Cells use zero-based integer coordinates. `worldToCell()` maps world positions by flooring against `tileSize`, and `cellToWorldCenter()` returns the center of a cell.

Out-of-bounds coordinates and footprints are rejected rather than silently clamped. This keeps authored map errors and invalid path requests observable.

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

## Determinism and ownership

- Terrain storage is row-major.
- Blocker queries and snapshots sort IDs.
- Snapshot arrays, path results, and path cells are frozen.
- Navigation modules import no game, renderer, UI, DOM, or browser service.
- Map loading and simulation systems may populate the grid; pathfinding may only query it.
- UFR-020 may translate returned cells into waypoints, but movement must not duplicate passability or path-cost rules.
- Renderer feedback may mirror passability and route results but must not become authoritative.
