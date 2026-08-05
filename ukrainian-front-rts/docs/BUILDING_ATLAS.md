# Production building atlas

## Scope

UFR-115 defines original production art for every structure in the canonical UFR-070 faction technology trees. The work consumes the UFR-107 nearest-neighbor sprite-atlas boundary and follows the UFR-106 art bible without changing building footprints, costs, production rules, capture rules, damage thresholds, simulation state, or active renderer ownership.

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

`art-src/buildings/building-art-source.json` is the source manifest. It declares canonical IDs, roles, tiers, silhouette intent, provenance, license, redistribution, and tool disclosure. The visual recipes are deterministic repository code in `scripts/lib/building-atlas-generator.mjs`.

Optional review outputs are produced with:

```bash
node scripts/build-building-art.mjs
```

That command writes:

- `assets/atlases/buildings-ukraine.atlas.json` and `.svg`;
- `assets/atlases/buildings-russia.atlas.json` and `.svg`;
- `assets/contact-sheets/buildings.svg`.

Generated files are deliberately not committed. `scripts/verify-building-art.mjs` regenerates and validates the exact artifacts in memory, preventing generated duplication while preserving reproducibility.

## Ownership boundary

`src/render/building-atlas.js` owns presentation identifiers, dimensions, attachments, and lookup paths. Simulation and content systems must not derive passability, footprint, production timing, capture state, authoritative damage, destruction timing, or rally behavior from atlas frames. A later renderer integration task may load these manifests and map authoritative building state to the stable animation IDs.

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

The active prototype renderer is not switched to these generated atlases in UFR-115, and no human zoom/grayscale/color-vision capture matrix is claimed. The highest justified completion evidence is therefore `CONTRACT_COMPLETE`, not `RUNTIME_INTEGRATED` or `PLAYER_VERIFIED`.
