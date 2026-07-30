# Authored map format v1

## Purpose and ownership

`src/core/authored-map.js` defines the dependency-free contract for authored battlefields. It validates JSON-compatible source data and returns one immutable, reference-free snapshot for campaign, navigation, rendering, tests, and future editor tooling.

UFR-088 defines and loads data only. It does not replace the current hard-coded battlefield, fetch files, construct `Game`, render terrain, execute triggers, or alter navigation policy. UFR-086 owns trigger semantics, authored mission tasks own mission migration, and UFR-116 owns terrain rendering.

## Version and compatibility

Every map requires `formatVersion: 1`. Additive optional fields are compatible when their defaults preserve existing meaning. Renames, coordinate changes, overlay-order changes, or normalized-output changes require a new format version and migration plan.

The generic `maps` family in `src/content-schema.js` remains the repository envelope. This contract concretizes its previously opaque terrain and spawn payloads. Source may use legacy `spawns` and `decorations`; the loader normalizes them to `starts` and `props`. Defining both names for one family is rejected.

## Coordinates

- `width` and `height` are positive integer world-pixel dimensions.
- `tileSize` is a positive integer world-pixel cell size.
- Both dimensions must be exact multiples of `tileSize`.
- Cells are zero-based integer `{ x, y }` coordinates.
- The loader derives `grid.width = width / tileSize` and `grid.height = height / tileSize`.
- Cells, footprints, starts, resources, props, and regions must remain inside the grid.

## Root contract

Required fields:

| Field | Contract |
| --- | --- |
| `formatVersion` | Exactly `1`. |
| `id` | Non-empty stable map ID. |
| `name` | Non-empty player-facing name. |
| `width`, `height` | World dimensions in pixels. |
| `tileSize` | Cell size in pixels. |
| `terrain` | Row-encoded base terrain. |
| `starts` or `spawns` | Non-empty start-group record. |

Optional fields are `heights`, `passability`, `roads`, `water`, `bridges`, `props`/`decorations`, `resources`, `regions`, `triggers`, and `metadata`.

## Terrain and elevation

Terrain uses a compact row encoding:

```js
terrain: {
  encoding: 'rows',
  default: 'open',
  legend: { '.': 'open', m: 'mud', s: 'shelterbelt', '#': 'blocked' },
  rows: ['....', '.ms.', '..#.'],
}
```

Each legend key is one Unicode character. Row count and row width must exactly match the grid. Supported terrain values match UFR-018: `open`, `road`, `mud`, `rubble`, `water`, `bridge`, `shelterbelt`, and `blocked`. Movement costs remain navigation-owned.

`heights` is optional; omission creates elevation `0` for every cell. Supplied heights use integer row arrays:

```js
heights: {
  encoding: 'rows',
  rows: [[0, 0, 1, 1], [0, 1, 2, 1], [0, 0, 1, 0]],
}
```

Version 1 elevations are relative levels, not meters or line-of-sight rules.

## Passability

`passability` overrides explicit movement layers without changing visible terrain:

```js
passability: [
  { cell: { x: 1, y: 1 }, layers: { ground: false, amphibious: true } },
]
```

Known layers are `ground`, `amphibious`, and `air`. Only listed layers are overridden.

## Roads, water, and bridges

Each family is an array of stable IDs and non-empty cell arrays:

```js
roads: [{ id: 'supply-road', cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }] }],
water: [{ id: 'river', cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }] }],
bridges: [{ id: 'north-bridge', cells: [{ x: 2, y: 1 }] }],
```

Cells cannot repeat within a feature or overlap another feature in the same family. Every bridge cell must overlap authored water. Cross-family overlap is resolved deterministically:

```text
base terrain → roads → water → bridges
```

The later family wins, so bridge crossings remain `bridge`.

## Props and resources

Props describe environment objects; `decorations` is the legacy alias:

```js
props: [{
  id: 'warehouse-a',
  type: 'industrial-building',
  cell: { x: 4, y: 3 },
  footprint: { width: 2, height: 2 },
  blockingLayers: ['ground', 'amphibious'],
  metadata: { destructible: true },
}]
```

`footprint` defaults to `1 × 1`; `blockingLayers` defaults to none. Cover, sight, destruction, and rendering behavior stay with their focused owners.

Resources require unique IDs, a non-empty type, an in-bounds cell, and a non-negative finite amount:

```js
resources: [{ id: 'metal-yard', type: 'metal', cell: { x: 8, y: 5 }, amount: 500 }]
```

Extraction and depletion policy remain economy-owned.

## Starts and regions

Starts are grouped by semantic key; `spawns` is the legacy alias:

```js
starts: {
  player: [{ id: 'player-main', cell: { x: 1, y: 1 }, facing: 90 }],
  enemy: [{ id: 'enemy-main', cell: { x: 30, y: 18 }, facing: 270 }],
}
```

Start IDs are unique across groups. Optional facing is a finite angle in `[0, 360)`.

Regions are keyed records used by scripts and objectives:

```js
regions: {
  extraction: { shape: 'rect', origin: { x: 0, y: 0 }, width: 4, height: 3 },
  bridgehead: { shape: 'circle', center: { x: 12, y: 8 }, radius: 3 },
  industrialZone: {
    shape: 'polygon',
    points: [{ x: 4, y: 3 }, { x: 10, y: 3 }, { x: 8, y: 9 }],
  },
}
```

Rectangles and circles must remain inside the map. Polygons require at least three distinct in-bounds cells. Geometry interpretation remains outside the loader.

## Triggers and metadata

Triggers are unique IDs plus JSON-compatible UFR-086 data:

```js
triggers: [{
  id: 'reinforce-player',
  when: { timer: 20 },
  actions: [{ type: 'reinforcement', group: 'reserve-1' }],
}]
```

The loader guarantees deterministic, reference-free trigger data; UFR-086 remains authoritative for condition/action vocabulary and runtime validation.

Root and feature metadata may contain JSON-compatible values. Object keys are normalized lexicographically, so equivalent content serializes identically regardless of insertion order. Functions, symbols, bigints, non-finite numbers, and circular references are rejected.

## Loader API and output

```js
import {
  loadAuthoredMap,
  validateAuthoredMap,
  AuthoredMapValidationError,
} from './core/authored-map.js';
```

- `validateAuthoredMap(source)` returns a frozen array of actionable errors and never mutates source data.
- `loadAuthoredMap(source)` returns a deeply frozen normalized snapshot or throws `AuthoredMapValidationError` exposing the same `errors` array.

The normalized snapshot contains derived grid dimensions, row-major final terrain, zero-defaulted heights, all normalized feature families, and a `navigation` projection compatible with the UFR-018 map-data boundary: terrain cells, shelterbelts, roads, bridges, prop blockers, and passability overrides. UFR-088 does not instantiate or mutate a navigation grid.

## Complete example

```js
{
  formatVersion: 1,
  id: 'crossing-test',
  name: 'Crossing Test',
  width: 128,
  height: 96,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', m: 'mud', s: 'shelterbelt' },
    rows: ['....', '.m..', '.s..'],
  },
  heights: {
    encoding: 'rows',
    rows: [[0, 0, 1, 1], [0, 1, 2, 1], [0, 0, 1, 0]],
  },
  roads: [{ id: 'supply-road', cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }] }],
  water: [{ id: 'river', cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
  bridges: [{ id: 'bridge', cells: [{ x: 2, y: 1 }] }],
  resources: [{ id: 'metal-yard', type: 'metal', cell: { x: 3, y: 0 }, amount: 500 }],
  starts: {
    player: [{ id: 'player-main', cell: { x: 0, y: 0 }, facing: 90 }],
    enemy: [{ id: 'enemy-main', cell: { x: 3, y: 2 }, facing: 270 }],
  },
  regions: {
    extraction: { shape: 'rect', origin: { x: 0, y: 0 }, width: 2, height: 1 },
  },
  triggers: [],
  metadata: { biome: 'floodplain' },
}
```

Focused coverage in `tests/campaign/authored-map.test.mjs` verifies defaults, every authored family, navigation projection, aliases, ambiguity rejection, bounds, bridge/water consistency, IDs, JSON compatibility, immutability, and canonical serialization.
