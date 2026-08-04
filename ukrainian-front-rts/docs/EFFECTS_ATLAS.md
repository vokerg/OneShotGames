# UFR-118 — Effects atlas and renderer

## Scope

UFR-118 replaces the active projectile/effect presentation path with original, repository-owned sprite-atlas effects while preserving all simulation ownership. Combat, damage, projectile arrival, visibility, construction, healing, capture, weather, and objective systems continue to publish public state records; the effects renderer only translates those records into animation, placement, scale, rotation, and alpha.

The implementation uses the UFR-107 atlas schema/runtime and the UFR-108 source/provenance pipeline. It does not add combat mechanics or infer gameplay outcomes from pixels.

## Complete effect-family contract

`fields-of-resolve.effects` contains 48 centered 48 × 48 logical frames across all required families:

| Family | Frames | Playback | Presentation input |
| --- | ---: | --- | --- |
| `muzzle-flash` | 3 | once | transient `unit.flash` presentation field |
| `tracer` | 2 | loop | default/bullet projectiles |
| `shell` | 2 | loop | shell projectiles |
| `missile` | 3 | loop | missile/rocket projectiles |
| `drone` | 2 | loop | drone projectiles |
| `impact` | 3 | once | kinetic/small blast and unknown explicit fallback |
| `explosion` | 4 | once | large or explosive blast records |
| `smoke` | 4 | loop | smoke records |
| `fire` | 4 | loop | fire/burning records |
| `dust` | 3 | once | dust records |
| `repair` | 3 | loop | repair records |
| `heal` | 3 | loop | heal/healing records |
| `capture` | 4 | loop | capture and reconnaissance-pulse records |
| `build` | 4 | loop | build/construction records |
| `weather` | 4 | loop | weather/rain/snow/storm records |

Every frame carries an `effects` tag plus its family tag, a centered anchor, an `origin` attachment, declared palette tokens, and deterministic duration metadata. Missing or unregistered effect kinds render through the atlas `impact` fallback and are marked as fallback descriptors rather than silently disappearing.

## Runtime integration

`installEffectsAtlasRenderer()` wraps only the renderer instance:

- before the atlas is ready, the existing procedural `Renderer.effects()` and muzzle flash remain active;
- after successful load, deterministic manifest derivation, and validation, projectiles and effect records are drawn through the nearest-neighbor atlas runtime;
- projectile direction comes only from current presentation coordinates (`x`, `y`, `aimX`, `aimY`);
- effect progress comes only from public lifetime or elapsed/duration fields;
- world scale is bounded from the authored effect radius and camera zoom;
- the original `unit()` method receives a shallow presentation copy with `flash: 0`, then the atlas muzzle flash is layered at the existing muzzle position;
- load failure remains visible through `renderer.effectsAtlasState()` and preserves the procedural fallback;
- disposal restores the exact original renderer methods.

The adapter never modifies the source projectile/effect/unit records and never publishes commands or simulation events.

## Source and provenance

The source asset is `shared.effects-core`, described by an isolated UFR-108-compatible catalog at `art-src/effects/manifest.json` so active unit, building, and terrain families do not share a write hotspot. All 48 SVG frames are original CC0-1.0 repository art represented by deterministic reviewed vector recipes. `scripts/build-effects-art.mjs` can materialize those SVGs under `art-src/effects/core/`, packs `assets/atlases/effects.build.json`, and builds the effects-specific export manifest and contact sheet. CI regenerates source and review artifacts in memory; only the versioned build spec and runtime atlas image are checked in; the UFR-107 manifest is derived and validated from that spec at load time.

Palette use is explicit and restricted to the shared effects palette. The contact sheet includes every source frame for family-completeness and timing review.

Commands:

```bash
node scripts/build-effects-art.mjs
node scripts/verify-effects-art.mjs
node --test tests/art/effects-atlas.test.mjs
bash verify.sh
```

## Ownership and downstream handoff

UFR-118 owns:

- effect source recipes, catalog, and provenance;
- `effects.build.json`, the generated atlas image, and deterministic runtime-manifest derivation;
- effect-family validation and public-record presentation mapping;
- the renderer-instance adapter for `effects()` and transient muzzle flashes;
- deterministic effect-art verification and documentation.

It does not own:

- projectile trajectories, impact resolution, damage, suppression, smoke occlusion, destruction, healing, capture, construction, weather simulation, or audio;
- generic sprite-atlas schema changes;
- unit, building, terrain, portrait, icon, or UI asset families;
- balance values or campaign content.

UFR-123 remains responsible for final production-load batching, culling, atlas memory budgets, and release-scene removal of procedural fallback. UFR-122 remains responsible for deterministic screenshot coverage across zoom, grayscale, color-vision, and all effect families.

## Evidence ceiling

The justified target is `RUNTIME_INTEGRATED`: the application composition installs the effects adapter, the browser smoke covers the assembled renderer lifecycle, and repository verification checks generated sources, atlas output, family completeness, fallback, and teardown. Manual visual approval of every family across all zooms and production-load performance remain downstream work, so this task does not claim `PLAYER_VERIFIED`.
