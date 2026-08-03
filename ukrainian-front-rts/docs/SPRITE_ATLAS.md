# Sprite atlas contract

## Scope

UFR-107 establishes the dependency-free atlas boundary consumed by later production-art tasks. It does not replace the current procedural battlefield art. It defines how original or properly licensed source frames become deterministic atlas outputs and how render modules load and draw those outputs without changing simulation state.

The normative visual rules remain in `ART_PIPELINE.md`. This document owns the executable file formats, packing command, runtime API, fallback behavior, and validation handoff.

## Repository layout

```text
assets/atlases/
  <family>.source.json       # authored packing input
  <family>.atlas.json        # generated runtime manifest
  <family>.svg               # generated packed image
  sources/                   # UFR-107 diagnostic source only
src/render/
  sprite-atlas-manifest.js   # versioned manifest validator and lookup
  sprite-atlas-runtime.js    # browser image loading and Canvas 2D drawing
scripts/
  pack-sprite-atlas.mjs      # deterministic build/check command
  verify-sprite-atlases.mjs  # production output verification
```

UFR-108 may establish the final `art-src/` production tree. A source spec may reference files there with relative paths; generated atlas files remain under `assets/atlases/`.

## Source specification

Source files use:

```json
{
  "schema": "fields-of-resolve.sprite-atlas-source",
  "version": 1,
  "id": "ua.infantry.line",
  "padding": 1,
  "maxWidth": 2048,
  "pixelRatio": 2,
  "output": {
    "image": "ua-infantry.svg",
    "manifest": "ua-infantry.atlas.json"
  },
  "directions": {
    "order": ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
    "zero": "n",
    "clockwise": true
  },
  "frames": [],
  "animations": {},
  "fallback": { "frame": "missing" }
}
```

The packer sorts frames by stable `id`, then uses integer shelf placement with declared padding. Input order therefore cannot change atlas coordinates. `maxWidth`, dimensions, output names, direction order, anchors, attachments, masks, animation timing, and palette tokens are versioned source data.

Each frame declares:

- `id`: stable family-qualified frame ID;
- `source`: relative PNG or SVG source path;
- `anchor`: ground-contact or footprint-origin point in source pixels;
- `attachments`: named source-pixel points such as `muzzle`, `shadow`, `selection`, `exit`, or `effect`;
- `masks`: named source-pixel rectangles for selection, hit, portrait crop, or focused renderer use;
- optional `sourceSize`, `offset`, `tags` for trimmed-frame compatibility.

The packer probes PNG headers and SVG dimensions. A declared width or height that disagrees with the source file fails the build.

## Generated manifest

Runtime manifests use schema `fields-of-resolve.sprite-atlas`, version `1`, and sampling mode `nearest`.

Required top-level fields:

- `id` — stable atlas ID;
- `image` — relative source, packed pixel dimensions, and `pixelRatio`;
- `directions` — stable order, zero direction, and clockwise policy;
- `frames` — atlas rectangles plus source geometry and attachment metadata;
- `animations` — non-empty frame sequences, timing, loop policy, and optional directional sequences;
- `fallback.frame` — a valid diagnostic frame used for unknown frame or animation IDs.

All frame rectangles must fit the packed image. Trim offsets, anchors, attachments, and masks must fit the declared source size. Animation references must resolve to existing frames. Unsupported schema versions fail closed.

Coordinates in manifests are source pixels. Runtime destination sizes and anchors are divided by `image.pixelRatio`, then multiplied by the requested logical draw scale. A 2× atlas therefore occupies the same logical battlefield size as its 1× equivalent.

## Packing and verification

Generate an atlas:

```bash
node scripts/pack-sprite-atlas.mjs assets/atlases/<family>.source.json
```

Verify generated files are current without rewriting them:

```bash
node scripts/pack-sprite-atlas.mjs assets/atlases/<family>.source.json --check
node scripts/verify-sprite-atlases.mjs
```

The dependency-free packer emits an SVG sheet containing base64-embedded PNG or SVG frames. This gives deterministic, self-contained build output without introducing an image-processing dependency. Later tooling may add a deterministic PNG encoder behind the same manifest contract; that requires a deliberate manifest/build compatibility review, not silent output drift.

`bash verify.sh` runs the atlas verifier. It checks every source spec against generated output, validates every manifest, confirms its image exists, and compares packed image dimensions with the manifest.

## Runtime API

`validateSpriteAtlasManifest()` returns an immutable normalized manifest. Revalidating an already-normalized manifest is supported.

`loadSpriteAtlas()`:

1. fetches and validates a manifest or accepts a manifest object;
2. resolves the image relative to the manifest URL;
3. loads it through an injectable image factory;
4. returns an immutable runtime with frame, animation, and attachment helpers;
5. returns an explicit degraded fallback runtime when one is supplied and loading fails.

`createSpriteAtlasRuntime()` draws around the gameplay anchor, disables Canvas 2D smoothing before every draw, supports logical scale, alpha, horizontal mirroring, directional animation lookup, and named attachment resolution. It reads presentation data only; it must not choose authoritative attack timing, collision, visibility, passability, objective, or damage outcomes.

Render owners should keep the current procedural renderer as a fallback until a complete production family is available. Missing atlas files or IDs must remain visible through the diagnostic fallback rather than producing invisible units.

## Direction and animation rules

Direction values passed as strings use the manifest IDs. Numeric values are wrapped direction indices, not world-space angles. The owning renderer converts authoritative facing into the atlas direction convention once.

Animations declare either:

- one shared `frames` sequence; or
- `directions` containing sequences keyed by declared direction IDs.

Each entry may be a frame ID or `{ "frame": "...", "durationMs": 100 }`. Loop modes are `loop`, `once`, and `hold`. Presentation timing may align to simulation events but may never trigger them.

## Fallback atlas

`assets/atlases/fallback.*` is a generated diagnostic atlas, not production art. It proves the full source → pack → manifest → validation path and provides a conspicuous frame for missing IDs. Do not replace it with a transparent pixel or faction-like silhouette; missing coverage must remain obvious during review.

## Downstream handoff

- UFR-108 owns production source-tree conventions, export checks, manifests, and reproducible invocation of this packer.
- UFR-109 owns the first gold-standard production family and must exercise eight directions, mandatory states, anchors, attachments, damage/death coverage, and fallback behavior.
- UFR-110 through UFR-121 add asset families without changing schema version 1 unless an explicit compatibility migration is approved.
- UFR-122 captures deterministic atlas-backed review scenes.
- UFR-123 may optimize batching or image format while preserving logical anchors, frame IDs, nearest-neighbor sampling, and fallback semantics.

A schema field removal, coordinate semantic change, direction convention change, output-format incompatibility, or fallback-policy change requires a new version and migration tests.
