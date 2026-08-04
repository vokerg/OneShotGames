# UI art assets

UFR-119 defines the original reusable portrait, icon, cursor, ping, and medal family for Fields of Resolve. The assets are presentation data only: they do not own selection, command validation, objective state, modernization, scoring, or gameplay outcomes.

## Authoritative catalog

`src/ui/ui-art-catalog.js` is the stable runtime lookup contract. It covers:

- 16 current fictionalized runtime-unit portraits;
- 16 matching unit icons;
- 4 building icons;
- 14 ability icons;
- 6 upgrade icons;
- 11 objective-type icons;
- 16 command and targeting cursors;
- 8 minimap/alert pings;
- 8 reusable medal motifs;
- 1 visible missing-asset fallback.

The catalog is deeply immutable, uses stable IDs, declares dimensions and pixel ratios, and exposes exact lookup plus a visible fallback. Unit and building identities are checked against reconciled runtime content; ability, upgrade, and objective families are checked against their current contracts.

## Source and generation

`art-src/ui/ui-art-source.json` records provenance, output paths, family counts, production constraints, and the deterministic generator. All geometry is original repository-authored SVG produced by `scripts/build-ui-art.mjs`; there are no recordings, copied commercial-game assets, external image inputs, embedded fonts, public-figure portraits, or generated-person likenesses.

Reproducible build outputs:

- `assets/ui/ui-art-symbols.svg` — reusable fragment-addressable symbol sheet;
- `assets/ui/ui-art-manifest.json` — generated runtime/review metadata;
- `assets/contact-sheets/ui-art.svg` — deterministic review sheet.

These outputs are generated artifacts rather than parallel source databases. The authoritative catalog and source manifest are source-controlled; CI regenerates the outputs in memory and proves exact coverage. Run the build command when a downstream integration owner needs materialized files.

Regenerate with:

```bash
node scripts/build-ui-art.mjs
```

Verify exact generated output with:

```bash
node scripts/verify-ui-art.mjs
```

## Visual contract

Portraits use the production 144 × 112 viewport and a stable safe area. Command, ability, upgrade, building, unit, and objective icons use the 32 × 32 logical grid. Cursors declare 1×/2× coverage and bounded hotspots. Pings use a 900 ms presentation budget and a static reduced-motion alternative. Medals are 64 × 64 and remain reusable motifs rather than operation-specific awards.

The sheet uses the frozen UFR-106 value hierarchy and faction palette families:

- deep ink and panel separation;
- Ukrainian blue/yellow accents;
- Russian warm earth accents;
- restrained objective gold;
- explicit danger and benefit colors;
- no baked player-facing text.

Color reinforces geometry but does not carry identity alone. Every family has an inked silhouette and value separation suitable for grayscale review.

## Runtime handoff

Consumers resolve an asset through:

```js
const result = resolveUiArtAsset('abilityIcons', 'barrage');
const href = uiArtHref(result);
```

The returned fragment reference is suitable for SVG `<use>`, CSS masks, or a later image-loader adapter. Unknown IDs resolve to `fallback:missing`; presentation code must not silently omit an asset.

UFR-120 owns production UI skin and layout adoption. UFR-121 owns operation-specific campaign art. UFR-110 through UFR-115 own battlefield sprite/portrait family replacement when those larger atlases land. UFR-122 owns screenshot scenes and manual visual matrices. UFR-119 does not modify those owners.

## Verification and evidence boundary

The authoritative verifier runs catalog tests and `scripts/verify-ui-art.mjs` without mutating the checkout. Coverage includes canonical ID drift, family dimensions, hotspots, reduced-motion pings, safe areas, lookup/fallback behavior, deep immutability, deterministic generated-output equality, provenance, text-free assets, and public-figure exclusion.

This task can reach `CONTRACT_COMPLETE`: the production-ready source/runtime asset family and deterministic pipeline are present. The active prototype UI is not broadly reskinned by this task, so browser startup proves non-regression rather than complete player-visible adoption.
