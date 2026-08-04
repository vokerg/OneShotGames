# Campaign Art System

## Ownership

UFR-121 owns presentation-only campaign artwork: operation illustrations, tactical map overlays, briefing panels, loading art, ending panels, credits visuals, and debrief medal frames. UFR-089 remains authoritative for briefing/debrief state, UFR-092 owns dialogue/subtitle presentation, mission content owns operation identity and outcomes, and UFR-119 owns the medal motifs placed inside the UFR-121 frames.

The campaign-art catalog does not mutate campaign progress, select operations, award medals, evaluate objectives, start missions, or define UI layout. Consumers request an asset by family and stable ID, then render the returned symbol or the explicit diagnostic fallback.

## Canonical coverage

The catalog provides coordinated art bundles for five fictional operation identities:

- `operation-safe-passage`: protected urban evacuation corridor;
- `operation-lantern-gate`: reconnaissance and engineer breach;
- `operation-silent-ledger`: depot, air-defense, fires, and extraction network;
- `operation-ember-line`: staged defensive withdrawal;
- `operation-iron-horizon`: three-sector combined-arms offensive.

Each identity has an operation illustration, transparent tactical overlay, briefing panel, and loading illustration. The catalog also provides victory, withdrawal, and defeat ending panels; campaign and contributor credits visuals; eight debrief frames aligned to UFR-119 medal IDs; and a conspicuous fallback.

## Visual and accessibility contract

All artwork is original deterministic SVG geometry using the frozen UFR-106 palette hierarchy. Large panels declare bounded safe areas and focal points so adapters can place copy without obscuring the operational motif. Tactical overlays are transparent and contain no terrain semantics; they are presentation marks only. Every runtime asset has a non-empty accessible description. Runtime and review SVGs contain no embedded text, scripts, foreign objects, raster data, remote references, public figures, insignia, or copied commercial-game imagery.

## Source and generation

Authority is split deliberately:

- `src/ui/campaign-art-catalog.js` defines stable IDs, dimensions, safe areas, alt text, fallback, and provenance.
- `art-src/campaign/campaign-art-source.json` records reviewed source/output and licensing constraints.
- `scripts/lib/campaign-art-pipeline.mjs` renders deterministic symbol, runtime-manifest, and contact-sheet outputs.
- `node scripts/build-campaign-art.mjs` writes optional review/runtime outputs.
- `node scripts/verify-campaign-art.mjs` regenerates everything in memory and rejects coverage, provenance, determinism, or embedded-content drift.

Generated outputs are reproducible products, not independent authorities. CI verifies them from the catalog and source manifest.

## Runtime handoff

A campaign adapter may call `resolveOperationCampaignArt(operationId)` and mount returned SVG symbols in an UFR-089 briefing/loading view. Debrief code may combine a UFR-119 medal motif with a `debriefMedalFrames` asset. Ending and credits views may resolve their stable outcome/credits IDs. Unknown IDs must remain visible through `fallback:missing`; consumers must not silently omit artwork.

## Evidence boundary

The catalog, original vector recipes, generators, lookup/fallback behavior, provenance, accessibility metadata, and automated verification are complete. This task does not mount a campaign screen or claim a human-reviewed final capture matrix. Runtime mounting remains with the relevant campaign/UI composition owner, and broad production skin/layout remains UFR-120 ownership.
