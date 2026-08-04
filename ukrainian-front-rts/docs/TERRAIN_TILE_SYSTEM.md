# Authored terrain tile system

Task: UFR-116  
Evidence level: `CONTRACT_COMPLETE`  
Schema: `TERRAIN_TILE_SCHEMA_VERSION = 1`

## Purpose

UFR-116 defines the original, reproducible terrain-art foundation consumed by later renderer and
map-integration work. It provides deterministic autotiling, biome palettes, legacy and authored-map
presentation projection, vector source generation, a UFR-107-compatible atlas manifest, provenance,
and focused verification without changing simulation semantics.

The task consumes these merged contracts:

- UFR-088 owns authored-map terrain, elevation, passability, roads, water, bridges, and metadata.
- UFR-106 owns the 32 × 32 logical tile basis, palette hierarchy, readability, and required terrain families.
- UFR-107 owns generic sprite-atlas schema version 1, validation, loading, nearest-neighbor drawing, and fallback behavior.

UFR-116 does not redefine any of those contracts.

## Semantic boundary

The authoritative UFR-088 terrain IDs remain unchanged:

- `open`
- `road`
- `mud`
- `rubble`
- `water`
- `bridge`
- `shelterbelt`
- `blocked`

Rendering derives an immutable presentation projection from semantic terrain, explicit visual
metadata, biome, map identity, coordinates, and neighboring visual families. It never infers or
changes movement cost, passability, cover, concealment, elevation, line of sight, bridge state, or
water depth.

Explicit presentation metadata may map `open` cells to `ground`, `field`, `settlement`,
`industrial`, or `bank`, and may map `blocked` cells to `blocked` or `cliff`. These are visual
families only.

## Delivered contract

`src/render/terrain-tile-system.js` provides:

- an immutable versioned contract with a 32-pixel logical tile size;
- Donbas, Zaporizhzhia, and Kherson biome palettes;
- thirteen visual families: ground, road, mud, rubble, water, bridge, shelterbelt, blocked,
  settlement, industrial, field, bank, and cliff;
- stable cardinal-mask bit order: north, east, south, west;
- deterministic diagonal and valid inner-corner masks;
- all sixteen isolated/end/straight/corner/T/cross cardinal topologies;
- explicit map-edge connection rules;
- two visible deterministic texture variants per family and topology;
- stable FNV-style variation hashing that does not consume simulation randomness;
- immutable projection of the current numeric terrain and road-polyline runtime;
- immutable projection of normalized UFR-088 authored maps and explicit presentation surfaces;
- strict row-major, tile-size, semantic, family, coordinate, and variant validation;
- single-pass whole-grid frame resolution.

Frame IDs are stable and data-derived:

```text
terrain.<biome>.<family>.v<variant>.m<cardinal-mask>
terrain.<biome>.inner.m<inner-corner-mask>
```

## Original vector source and atlas generation

`scripts/lib/terrain-atlas-generator.mjs` generates an original crisp-edge SVG atlas and generic
UFR-107 manifest entirely from repository data. It uses no external image, font, commercial-game
asset, or generative-image system.

The generated atlas contains:

- 3 biome profiles;
- 13 visual families;
- 16 cardinal topologies;
- 2 visibly different deterministic variants;
- 15 inner-corner overlays per biome;
- 1 conspicuous diagnostic fallback frame;
- 1,294 total frames in a 512 × 2,592 vector sheet.

The manifest is validated against `fields-of-resolve.sprite-atlas` version 1. Every frame has
integer 32 × 32 geometry, top-left tile anchoring, a center attachment, a tile mask, semantic tags,
and bounded atlas coordinates.

The build command is:

```bash
node scripts/build-terrain-atlas.mjs
node scripts/build-terrain-atlas.mjs --check
```

The committed source of truth is the generator plus the immutable terrain contract. The build
command emits `assets/atlases/terrain.svg` and `assets/atlases/terrain.atlas.json` for review or
runtime integration. Focused tests independently generate and validate the same outputs in memory,
so stale or missing checked-in generated files cannot masquerade as completed source work.

Provenance is recorded in `art-src/terrain/README.md` and embedded in generated SVG metadata:
Fields of Resolve contributors, created August 4, 2026, CC0-1.0, redistribution allowed.

## Determinism and compatibility

The presentation projection is reference-free and deeply immutable. Identical map, biome, cell,
and family inputs resolve to identical frame IDs regardless of object insertion order, locale,
canvas state, elapsed time, or simulation seed.

The legacy adapter consumes the current numeric `0/1/2` terrain array and world-space road
polyline without mutating either. The authored adapter consumes normalized terrain cells and
explicit `metadata.presentation.surfaces` without mutating terrain, passability, bridge, water,
elevation, or metadata inputs.

Unknown biome, semantic ID, surface, numeric legacy value, malformed coordinate, invalid variant,
or unsupported schema version fails with an actionable error. Missing future runtime frames remain
owned by the generic UFR-107 diagnostic fallback policy.

## Verification

`tests/art/terrain-tile-system.test.mjs` proves:

- versioning, immutability, family completeness, and original-art provenance;
- all cardinal topology, variant, and inner-corner frame IDs;
- deterministic edge and diagonal behavior;
- legacy runtime projection and authored-map semantic preservation;
- explicit field, settlement, industrial, bank, and cliff presentation surfaces;
- whole-grid deterministic resolution using each cell's selected variant;
- no calls to `Math.random` or other simulation randomness;
- actionable rejection of malformed profiles, cells, coordinates, and variants;
- deterministic 1,294-frame generation;
- visible SVG differences between variant 0 and variant 1;
- complete frame bounds and UFR-107 manifest-schema compatibility;
- visible diagnostic fallback and embedded provenance.

The authoritative repository workflow remains the final merge gate and includes the assembled
verifier, active-claim diagnostics, browser startup/first-mission smoke, and completion audit.
Browser smoke protects existing runtime behavior; it is not evidence that the new atlas is loaded
by the current renderer.

## Evidence limit and downstream ownership

Evidence is `CONTRACT_COMPLETE`, not `RUNTIME_INTEGRATED` or `PLAYER_VERIFIED`.

The current `Renderer.terrain()` still draws procedural terrain. UFR-116 intentionally does not
modify `Game.terrain`, navigation, authored-map loading, application composition, or renderer-wide
batching. A downstream integration task must load the generated atlas through the UFR-107 runtime,
replace only terrain presentation, retain explicit degraded fallback behavior, and review all
supported zoom and grayscale modes before claiming player-visible integration.

UFR-117 owns props and destruction variants above this terrain foundation. UFR-122 owns complete
visual-regression scenes. UFR-123 owns final renderer performance and memory budgets.
