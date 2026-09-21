# Production building atlas

## Scope

UFR-115 defines original production art for every structure in the canonical UFR-070 faction technology trees. UFR-169 integrates that family into active battlefield rendering for the current HQ, depot, barracks, and workshop runtime types while preserving the UFR-107 nearest-neighbor sprite-atlas boundary and UFR-106 art bible. The integration does not change building footprints, costs, production rules, capture rules, damage thresholds, navigation, or simulation state.

## Coverage

The source contract contains sixteen structures: eight Ukrainian and eight Russian. Each building provides:

1. placement preview;
2. foundation, structural frame, fit-out, and completed construction coverage;
3. idle and active production/research/support presentation;
4. damaged and critical/burning states;
5. a three-frame destruction transition;
6. stable rubble aligned to the obstruction origin;
7. a dedicated 40 × 40 icon;
8. entrance, exit, rally, capture, and effect attachment anchors.

This produces 208 production frames, plus one visible diagnostic fallback per faction atlas. The two runtime manifests contain 210 frames and 176 animations in total.

All battlefield frames use a 96 × 96 logical canvas and the stable footprint-origin anchor `(48, 88)`. Construction, operational, damage, destruction, and rubble states retain the same origin and obstruction mask. Icons use a separate 40 × 40 canvas with a centered anchor.

## Faction and role language

Ukrainian structures use compact modular masses, network/sensor cues, and restrained blue/yellow recognition marks associated with Networked Maneuver. Russian structures use broader prepared masses, supply-depth geometry, and restrained warm recognition marks associated with Echeloned Pressure.

Command, logistics, infantry, vehicle, UAS/EW, fires, air-defense, and engineering facilities have distinct equipment and roof geometry. The family is not a palette mirror. Every facility remains identifiable by role in grayscale through silhouette and massing, while faction colors provide reinforcement rather than the only distinction.

The buildings are stylized fictional infrastructure. They do not reproduce real installations, commercial-game assets, emblems, or public-figure content.

## Source and generation

`art-src/buildings/building-art-source.json` is the source manifest. It declares canonical IDs, roles, tiers, silhouette intent, provenance, license, redistribution, and tool disclosure. The browser-safe deterministic visual recipes live in `src/render/building-atlas-generator.js`; `scripts/lib/building-atlas-generator.mjs` re-exports that implementation so tooling and runtime generation share one authority.

Optional review outputs are produced with:

```bash
node scripts/build-building-art.mjs
```

That command writes:

- `assets/atlases/buildings-ukraine.atlas.json` and `.svg`;
- `assets/atlases/buildings-russia.atlas.json` and `.svg`;
- `assets/contact-sheets/buildings.svg`.

Generated files are deliberately not committed. `scripts/verify-building-art.mjs` regenerates and validates the exact artifacts in memory, preventing generated duplication while preserving reproducibility.

## Runtime integration and ownership boundary

`src/render/building-atlas.js` owns presentation identifiers, dimensions, attachments, and lookup paths. `src/render/building-atlas-runtime.js` maps active runtime building types to canonical faction IDs and derives presentation-only lifecycle states from authoritative building data. `src/render/building-art-pass.js` installs atlas drawing on the renderer.

The active integration:

- renders idle, active, damaged, critical, construction, destruction, and rubble states from the production atlas;
- keeps the procedural building renderer as asynchronous/error fallback only;
- preserves selection geometry and shows health bars only when selected, under construction, damaged, or being captured;
- rotates atlas presentation in 90° increments when construction placement rotates a non-square footprint;
- exposes the atlas `placement` state to the construction-preview renderer while retaining the authoritative validity grid and warning colors;
- keeps rubble/destruction animation presentation-only and does not own obstruction or cleanup timing.

Simulation and content systems must not derive passability, footprint, production timing, capture state, authoritative damage, destruction timing, or rally behavior from atlas frames.

## Verification and evidence boundary

Automated verification proves:

- exact agreement with all sixteen UFR-070 production structures;
- complete lifecycle and icon coverage;
- stable footprint origins, masks, and attachments;
- distinct faction and role silhouettes;
- deterministic manifests, SVG atlases, and contact sheet;
- UFR-107 manifest-schema compatibility and nearest-neighbor sampling;
- original CC0 provenance and no external/generative visual source;
- visible diagnostic fallback behavior;
- assembled repository tests and browser startup non-regression.

UFR-115 itself remains historically `CONTRACT_COMPLETE`: that task authored the family but did not install it. UFR-169 provides the renderer handoff and browser evidence for active missions and the Art & VFX Lab. Its CI review surface captures idle tactical color, damaged command color, and foundation strategic grayscale states, alongside existing mission and visual-regression browser checks. The renderer integration may therefore claim `RUNTIME_INTEGRATED` once the final UFR-169 head passes the repository verification matrix; `PLAYER_VERIFIED` still requires explicit human/player acceptance rather than automated browser evidence.
