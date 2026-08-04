# Environment prop and destruction presentation system

Task: UFR-117  
Status: contract complete  
Evidence: `CONTRACT_COMPLETE`

## Purpose

UFR-117 provides original environment-prop presentation for shelterbelts, trees, walls, fences,
houses, industrial objects, craters, wreckage, destruction variants, seasonal details, and
visibility-safe layering. It consumes authored-map, destruction, terrain, atlas, and source-art
contracts without changing authoritative gameplay semantics.

## Ownership boundary

UFR-088 remains authoritative for prop identity, type, grid cell, footprint, blocking layers, and
metadata. UFR-044 and UFR-057 remain authoritative for damage, disabled, burning, destroyed, wreck,
salvaged, cleared, rubble, salvage, and obstruction state. UFR-116 remains authoritative for terrain
and biome presentation. UFR-107 and UFR-108 remain authoritative for generic atlas/runtime and source
pipeline formats.

The UFR-117 projection is presentation-only. It never derives or mutates passability, line of sight,
cover, damage thresholds, burn timing, salvage, cleanup, selection, objectives, or simulation order.

## Runtime-independent contract

`src/render/environment-prop-system.js` defines schema version 1 and eight stable families:

- `shelterbelt`
- `tree`
- `wall`
- `fence`
- `house`
- `industrial`
- `crater`
- `wreckage`

Each family declares immutable type aliases, default footprint, source canvas, render layer,
supported authoritative presentation states, supported seasons, deterministic variant count, and—
for every tall occluder—a fade or cutaway region.

Three palette-compatible biome profiles are supplied: Donbas, Zaporizhzhia, and Kherson. Vegetation
supports green, dry, autumn, leafless, and snow treatments where applicable. Material families use
dry, wet, and snow treatments. Wreckage additionally supports burned treatment. Season selection is
explicit or comes from a documented biome default; it never consumes simulation time or randomness.

## Authored-map projection

`projectEnvironmentProp()` accepts normalized UFR-088 prop data and returns a deeply immutable,
reference-free presentation descriptor. It preserves the authored cell, footprint, blocking layers,
and metadata. Type aliases select a visual family; authoritative lifecycle inputs select only a
presentation state.

Unknown authored types and unsupported family-season combinations resolve to the visible
`environment.missing` diagnostic frame while retaining authored gameplay geometry. Malformed IDs,
cells, footprints, blocking layers, or metadata fail closed with actionable errors.

`projectEnvironmentProps()` rejects duplicate IDs and sorts by stable layer rank, footprint depth,
cell x, and prop ID. Input order, object insertion order, locale, camera state, and frame timing cannot
change draw ordering.

## Destruction compatibility

The visual-state adapter consumes phase, state, condition, or lifecycle tokens exposed by existing
owners. Static families map unsupported disabled/burning/wreck states to the nearest supported
presentation without creating a new threshold or timer. Wreckage supports intact, disabled, burning,
destroyed, wreck, salvaged, and cleared states. Cleared wreckage intentionally emits no frame and no
draw command.

## Visibility-safe layering

The layer order is:

1. `ground-decal`
2. `low-prop`
3. `unit-height`
4. `tall-occluder`
5. `canopy-roof-fade`
6. `foreground-effect`

Trees, shelterbelts, houses, and industrial masses provide explicit occlusion masks. The pure
`environmentPropVisibility()` policy returns deterministic draw, alpha, cutaway, and outline values
when a selected/focused cell lies under the prop. It does not inspect hidden units, mutate fog, or
make visibility decisions.

## Original atlas generation

`scripts/lib/environment-prop-atlas-generator.mjs` generates a crisp-edge UFR-107-compatible SVG
atlas and manifest. The atlas contains **730 deterministic frames**:

- one conspicuous diagnostic fallback;
- all required family, biome, state, season, and variant combinations;
- two or three visibly distinct variants per family;
- stable bottom-center anchors;
- footprint, occlusion, effect, and selection metadata;
- family, layer, biome, state, season, and variant tags;
- CC0 provenance with an explicit no-generative-tools declaration.

`scripts/build-environment-prop-atlas.mjs` writes or checks
`assets/atlases/environment-props.svg` and `environment-props.atlas.json`. Generated files are not
hand-edited. Identical source contracts produce byte-identical outputs.

## Verification

Focused tests cover:

- family, alias, biome, state, season, variant, and layer completeness;
- profile and projection immutability;
- exact authored footprint and blocking-layer preservation;
- UFR-044/UFR-057 lifecycle compatibility;
- deterministic frame selection without `Math.random`;
- visible fallback and malformed-input rejection;
- stable draw ordering and duplicate-ID rejection;
- fade/cutaway behavior for every tall occluder;
- complete 730-frame generation, bounds, anchors, provenance, and visible variant differences.

The authoritative repository workflow remains the completion gate. Because the assembled browser
still lacks an authored-map prop composition path, this task does not claim `RUNTIME_INTEGRATED`,
`PLAYER_VERIFIED`, art-lab capture review, or renderer performance closure.

## Downstream handoff

A later authored-map/runtime integration owner may load the generated atlas through UFR-107, project
normalized map props through this module, sort the descriptors, and apply the returned visibility
policy. UFR-118 owns effects, UFR-122 owns comprehensive visual-regression scenes, and UFR-123 owns
final renderer batching, memory, and frame-budget closure.
