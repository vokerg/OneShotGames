# Environment prop source art

UFR-117 environment art is original repository-authored vector geometry generated deterministically by
`scripts/lib/environment-prop-atlas-generator.mjs` from the immutable family, biome, lifecycle,
season, layering, and occlusion contract in `src/render/environment-prop-system.js`.

Coverage includes shelterbelts, individual trees, walls, fences, houses, industrial props, craters,
and wreckage. The generator emits intact/damaged/destroyed or destruction-lifecycle variants as
applicable, biome-compatible seasonal treatments, stable deterministic variants, footprint and
occlusion masks, effect/selection anchors, and a conspicuous diagnostic fallback.

Generate the review/runtime outputs with:

```bash
node scripts/build-environment-prop-atlas.mjs
node scripts/build-environment-prop-atlas.mjs --check
```

The generated outputs are `assets/atlases/environment-props.svg` and
`assets/atlases/environment-props.atlas.json`. They are reproducible build products rather than
hand-edited sources.

Provenance: Fields of Resolve contributors, 2026-08-04, CC0-1.0. No generative image tool,
external commercial-game material, external font, or unrecorded source image was used.
