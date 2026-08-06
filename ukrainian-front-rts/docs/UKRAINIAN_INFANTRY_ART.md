# Ukrainian infantry art family

UFR-110 defines the complete original Ukrainian infantry/support battlefield family on top of the UFR-107 sprite-atlas schema and UFR-109 state/direction contract.

## Canonical coverage

The source manifest covers combat engineers, line/mechanized infantry, anti-armor, reconnaissance, CASEVAC/medical, mobile air defense, and command support. Each identity provides eight clockwise directions and `idle`, `move`, `attack`, `hit`, `damaged`, `death`, and `wreck` states, plus a portrait and compact icon.

The deterministic generator expands the compact reviewed source into 840 battlefield frames, 855 total frames, and 49 directional animations. Geometry is built from reusable SVG definitions and crisp-edge `<use>` placement; no remote references, embedded scripts, raster payloads, external likenesses, or public figures are used.

## Runtime composition

`src/render/ukrainian-infantry-atlas.js` expands the compact source in memory, gives the generated SVG to the existing UFR-107 atlas runtime through a data URL, and exposes the immutable catalog. `src/render/ukrainian-infantry-art-pass.js` replaces only eligible Ukrainian infantry drawing and portraits. Existing procedural drawing remains an explicit loading/error fallback; vehicles, drones, Russian units, simulation, combat resolution, selection, and UI ownership are unchanged.

Active prototype aliases currently resolve `uaEngineer`, `uaInfantry`, and `uaMedic`; canonical future aliases for anti-armor, reconnaissance, air defense, and command support are already stable. Role fallback is bounded and never claims armored or air units.

## Review and reproduction

Run:

```bash
node scripts/verify-ukrainian-infantry-art.mjs
node --test tests/art/ukrainian-infantry-atlas.test.mjs
node scripts/build-ukrainian-infantry-atlas.mjs
```

The build command materializes review-only atlas, manifest, catalog, and contact-sheet files under `artifacts/ukrainian-infantry/`; those files are reproducible products rather than source authorities.

Open `art-lab.html` for the player-visible matrix. `U` cycles the Ukrainian state and `R` cycles direction; the existing zoom, pause, grayscale, facing, template-state, and capture controls remain available.

## Provenance

The source is original repository work, CC0-1.0, redistribution allowed. It records no external art inputs and no public-figure likenesses. Automated contract coverage does not replace maintainer visual approval; Art Lab and visual-regression captures remain the human review surfaces.
