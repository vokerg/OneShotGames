# Terrain movement and cursor feedback

## Purpose

UFR-025 completes the navigation terrain vocabulary used by authored map data and exposes the same
passability/cost result to the battlefield cursor. The authoritative rule remains the navigation grid:
presentation reads that result and never invents a second terrain policy.

This task does not change path caching, waypoint ownership, collision, formations, stuck recovery, combat
cover, concealment, or unit balance statistics.

## Terrain policy

`src/navigation/navigation-grid.js` defines movement costs by movement layer. A lower cost makes a cell
more attractive to deterministic A* search; a `null` cost is impassable.

| Terrain | Ground | Amphibious | Air | Cursor meaning |
| --- | ---: | ---: | ---: | --- |
| Open ground | 1.00 | 1.00 | 1.00 | Standard movement |
| Road | 0.75 | 0.75 | 1.00 | Fast/preferred route |
| Mud | 1.60 | 1.25 | 1.00 | Severely reduced |
| Rubble | 1.35 | 1.35 | 1.00 | Reduced |
| Water | impassable | 1.20 | 1.00 | Blocked or amphibious |
| Bridge | 1.00 | 1.00 | 1.00 | Ground crossing |
| Shelterbelt | 1.15 | 1.15 | 1.00 | Slightly reduced |
| Blocked | impassable | impassable | 1.00 | Blocked |

The exported movement profile includes the terrain ID, movement layer, cost, passability, reciprocal
relative pace, movement band, label, and player-facing detail. The reciprocal pace is explanatory
metadata for path cost; physical interpolation remains owned by the simulation movement boundary.

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

## Ownership and extension

- `navigation-grid.js` owns terrain IDs, per-layer costs, profiles, overlay precedence, and passability.
- `terrain-cursor-feedback.js` owns translation from a grid profile to pointer presentation.
- `battlefield-input.js` owns pointer lifecycle and presenter disposal.
- Path search consumes movement costs.
- Simulation movement owns physical position updates.
- Renderer/UI consumers may display profiles but must not alter them.

New terrain types require:

1. a stable ID;
2. movement costs for every supported layer;
3. presentation metadata;
4. deterministic map-data precedence;
5. profile, passability, and cursor fixtures.

Combat concealment or cover values must be added by their combat task rather than inferred from
shelterbelt movement cost.

## Verification

Focused commands:

```bash
node --check src/navigation/navigation-grid.js
node --check src/input/terrain-cursor-feedback.js
node --check src/input/battlefield-input.js
node --check tests/navigation/terrain-movement-feedback.test.mjs
node --test tests/navigation/navigation-grid.test.mjs tests/navigation/terrain-movement-feedback.test.mjs
```

Browser checks for the integrated adapter:

1. Start a mission and select a ground unit.
2. Move the pointer across open, mud, and rubble cells and confirm cursor/label changes.
3. Hover an impassable or dynamically blocked cell and confirm blocked feedback.
4. Select an air unit and confirm ground terrain reports unaffected air movement.
5. Begin construction placement and confirm the copy cursor replaces terrain feedback immediately.
6. Drag-select, leave the canvas, and refocus the window; confirm the label never remains stranded.
