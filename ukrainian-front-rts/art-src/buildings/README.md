# Production building sources

The machine-readable source authority for UFR-115 is `building-art-source.json`. It records the exact sixteen canonical production structures, faction, role, tier, silhouette intent, and repository-owned provenance.

`src/render/building-atlas.js` owns stable frame IDs, lifecycle state names, dimensions, anchors, and runtime lookup. `scripts/lib/building-atlas-generator.mjs` turns the source contract into two UFR-107-compatible nearest-neighbor manifests, two original deterministic SVG atlases, and a complete contact sheet.

Generate optional review/runtime outputs with:

```bash
node scripts/build-building-art.mjs
```

Authoritative verification regenerates everything in memory through `scripts/verify-building-art.mjs`. Generated atlases and contact sheets are intentionally not committed; the source manifest and deterministic recipes remain the singular authority.
