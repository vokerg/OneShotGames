# Terrain movement and cursor feedback

## Purpose

UFR-025 completes the navigation terrain vocabulary used by authored map data, applies terrain pace to
runtime unit displacement, and exposes the same passability/cost result to the battlefield cursor. The
authoritative rule remains the navigation grid: simulation and presentation consume one terrain profile
rather than maintaining parallel policies.

This task does not change path caching, waypoint ownership, collision, formations, stuck recovery, combat
cover, concealment, or unit balance statistics.

## Terrain policy

`src/navigation/navigation-grid.js` defines movement costs by movement layer. A lower cost makes a cell
more attractive to deterministic A* search and increases physical traversal pace; a `null` cost is
impassable.

| Terrain | Ground | Amphibious | Air | Runtime/cursor meaning |
| --- | ---: | ---: | ---: | --- |
| Open ground | 1.00 | 1.00 | 1.00 | Standard movement |
| Road | 0.75 | 0.75 | 1.00 | 133% relative pace |
| Mud | 1.60 | 1.25 | 1.00 | 63% ground pace |
| Rubble | 1.35 | 1.35 | 1.00 | 74% relative pace |
| Water | impassable | 1.20 | 1.00 | Blocked or 83% amphibious pace |
| Bridge | 1.00 | 1.00 | 1.00 | Standard ground crossing |
| Shelterbelt | 1.15 | 1.15 | 1.00 | 87% relative pace |
| Blocked | impassable | impassable | 1.00 | Blocked |

The exported movement profile includes the terrain ID, movement layer, cost, passability, reciprocal
speed multiplier, movement band, label, and player-facing detail.

## Runtime movement application

`src/systems/terrain-movement-system.js` owns the runtime mapping and displacement policy:

- runtime terrain value `1` maps to mud;
- runtime terrain value `2` maps to shelterbelt, matching the tree-covered renderer tile;
- reserved values `3` and `4` map to rubble and water for authored-map expansion;
- the current visual road polyline is rasterized into deterministic row-major road cells;
- optional runtime shelterbelt and bridge cell arrays overlay the base terrain;
- the navigation movement system queries the unit's current cell before the ordinary fixed-step update;
- after `Game.updateUnit()` advances simulation time and performs its normal order/combat work, only the
  physical displacement is scaled by the terrain multiplier.

Scaling displacement rather than the full step duration is important: weapon reload, ability cooldown,
buff duration, healing, gathering, and construction time continue to advance by the real fixed step.
Road acceleration is capped at the current movement target and final positions remain within world bounds.
Air units resolve to a multiplier of `1`.

The applied multiplier is mirrored on `unit.terrainMovementMultiplier` for read-only presentation and
diagnostics. It is not a second authoritative stat and is refreshed by the movement phase.

## Authored map overlays

`createNavigationGridFromMapData()` accepts these deterministic arrays:

```js
{
  terrain: [{ x: 4, y: 6, type: 'water' }],
  shelterbelts: [{ x: 8, y: 4 }],
  roads: [{ x: 8, y: 4 }],
  bridges: [{ x: 4, y: 6 }],
  blockers: [],
}
```

Overlay precedence is:

1. base `terrain`;
2. `shelterbelts`;
3. `roads`;
4. `bridges`;
5. dynamic `blockers`.

A road therefore cuts through a shelterbelt, and a bridge intentionally restores passage over water.
Every coordinate is still validated by the grid; malformed authored data fails rather than being
silently clipped.

## Cursor feedback

`src/input/terrain-cursor-feedback.js` queries the active navigation grid for the first selected unit's
movement layer. It combines terrain passability with dynamic blockers and returns an immutable feedback
record.

The battlefield input adapter presents that record in two synchronized ways:

- the canvas receives a semantic data attribute for fast, normal, slow, very slow, amphibious, or blocked terrain;
- a small pointer-following label shows terrain name and movement consequence.

The presenter installs scoped cursor rules rather than writing an inline cursor. Construction placement
therefore takes priority immediately, and its CSS rule also hides a previously visible terrain badge
without waiting for the next pointer event. Existing inline canvas styles remain untouched.

The presenter is browser-owned and injectable. In Node or another environment without a DOM it becomes
a no-op, so importing or testing battlefield input does not create a browser dependency.

Feedback state is cleared during construction placement, drag selection, game-over state, pointer leave,
blur, and adapter disposal. CSS independently guarantees the same placement priority during transitions.

## Ownership and parallel coordination

- `navigation-grid.js` owns terrain IDs, per-layer costs, profiles, overlay precedence, and passability.
- `terrain-movement-system.js` owns runtime map conversion, road rasterization, and displacement scaling.
- `navigation-movement-system.js` invokes the terrain wrapper at the existing unit-update boundary.
- `terrain-cursor-feedback.js` owns translation from a grid profile to pointer presentation.
- `battlefield-input.js` owns pointer lifecycle and presenter disposal.
- Path search consumes movement costs.
- Renderer/UI consumers may display profiles but must not alter them.

PR #47 remains owner of path caching, grid revision invalidation, repath throttling, request lifecycle, and
performance counters. UFR-025 keeps those concerns out of the terrain policy module; the shared movement
file changes are limited to runtime terrain inputs and wrapping existing `game.updateUnit` calls.

New terrain types require:

1. a stable ID;
2. movement costs for every supported layer;
3. presentation metadata;
4. deterministic map-data precedence;
5. profile, runtime displacement, passability, and cursor fixtures.

Combat concealment or cover values must be added by their combat task rather than inferred from
shelterbelt movement cost.

## Verification

Focused commands:

```bash
node --check src/navigation/navigation-grid.js
node --check src/input/terrain-cursor-feedback.js
node --check src/input/battlefield-input.js
node --check src/systems/terrain-movement-system.js
node --check src/systems/navigation-movement-system.js
node --check tests/navigation/terrain-movement-feedback.test.mjs
node --check tests/navigation/terrain-movement-system.test.mjs
node --test tests/navigation/navigation-grid.test.mjs \
  tests/navigation/terrain-movement-feedback.test.mjs \
  tests/navigation/terrain-movement-system.test.mjs
```

Focused result: 19 tests passed, 0 failed. The current six-point road rasterized across the 80×52 runtime
grid in approximately 0.24 ms per rebuild over 200 repeated runs in the Node mirror. Grid creation is
revision-driven, not a per-frame operation.

Browser checks for the integrated adapter:

1. Start a mission and select a ground unit.
2. Move the pointer across open, road, mud, and shelterbelt cells and confirm cursor/label changes.
3. Issue equal-distance movement across road and mud and confirm visibly different traversal pace.
4. Hover an impassable or dynamically blocked cell and confirm blocked feedback.
5. Select an air unit and confirm ground terrain reports unaffected air movement.
6. Begin construction placement and confirm the copy cursor replaces terrain feedback immediately.
7. Drag-select, leave the canvas, and refocus the window; confirm the label never remains stranded.
