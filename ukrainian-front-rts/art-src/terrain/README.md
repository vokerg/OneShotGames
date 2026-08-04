# Terrain source art

UFR-116 terrain art is original repository-authored vector work generated deterministically by
`scripts/lib/terrain-atlas-generator.mjs` from the immutable biome and family contract in
`src/render/terrain-tile-system.js`.

The generator emits the reviewable `assets/atlases/terrain.svg` vector sheet and its
`terrain.atlas.json` runtime manifest without external images, fonts, generative tools, or
commercial-game material. The source of truth is the committed generator plus the versioned
terrain contract; generated outputs can be written or checked with:

```bash
node scripts/build-terrain-atlas.mjs
node scripts/build-terrain-atlas.mjs --check
```

The UFR-116 completion evidence validates the generated outputs in memory against the generic
UFR-107 atlas schema. Runtime loading and replacement of the current procedural battlefield
terrain remain a downstream integration boundary.

Provenance: Fields of Resolve contributors, 2026-08-04, CC0-1.0.
