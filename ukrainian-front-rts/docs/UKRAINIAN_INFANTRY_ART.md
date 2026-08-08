# Ukrainian infantry art family

UFR-110 defines the complete original Ukrainian infantry/support battlefield family on top of the UFR-107 sprite-atlas schema and UFR-109 state/direction contract. Post-merge playtest issue #206 added a stricter battlefield-readability contract after the first integrated atlas proved technically correct but visually too small and abstract in normal missions.

## Canonical coverage

The source manifest covers combat engineers, line/mechanized infantry, anti-armor, reconnaissance, CASEVAC/medical, mobile air defense, and command support. Each identity provides eight clockwise directions and `idle`, `move`, `attack`, `hit`, `damaged`, `death`, and `wreck` states, plus a portrait and compact icon. Frame counts meet the art-bible production minima: six-frame movement, two-frame hit and damaged reactions, and five-frame death sequences.

The deterministic generator expands the compact reviewed source into 1,176 battlefield frames, 1,191 total frames, and 49 directional animations. Geometry is built from reusable SVG definitions and crisp-edge `<use>` placement; no remote references, embedded scripts, raster payloads, external likenesses, or public figures are used.

## Battlefield readability contract

Battlefield frames use the `screen-upright-directional-v3` presentation. The human figure occupies most of the 48×48 cell instead of a small center patch. The torso, helmet, arms, and legs remain screen-upright in the game's 2.5D projection while head placement, hands, service weapon, launcher, optic, tool, SAM tubes, and radio details are authored per direction. Direction changes therefore read as a soldier changing facing rather than the entire humanoid sprite rotating into a horizontal icon.

The presentation contract exported by `src/render/ukrainian-infantry-atlas-generator.js` records minimum standing-body footprint, maximum role-equipment footprint, runtime scale floor, scale multiplier, and draw offset. Regression tests keep the human silhouette dominant and prohibit returning to whole-frame directional rotation. Role equipment must communicate identity without becoming larger or more visually important than the soldier.

Runtime scale is calibrated against the normal mission building footprint and selection geometry. Strategic zoom retains a minimum readable sprite scale, while command and inspection zoom continue to use nearest-neighbor atlas sampling.

## Runtime composition

`src/render/ukrainian-infantry-atlas.js` expands the compact source in memory, gives the generated SVG to the existing UFR-107 atlas runtime through a data URL, and exposes the immutable catalog and battlefield presentation contract. `src/render/ukrainian-infantry-art-pass.js` replaces only eligible Ukrainian infantry drawing and portraits. Existing procedural drawing remains an explicit loading/error fallback; vehicles, drones, Russian units, simulation, combat resolution, selection, and UI ownership are unchanged.

Active prototype aliases currently resolve `uaEngineer`, `uaInfantry`, and `uaMedic`; canonical future aliases for anti-armor, reconnaissance, air defense, and command support are already stable. Generic role fallback requires Ukrainian identity/faction metadata and never claims Russian, armored, or air units.

## Review and reproduction

Run:

```bash
node scripts/verify-ukrainian-infantry-art.mjs
node --test tests/art/ukrainian-infantry-atlas.test.mjs tests/art/ukrainian-infantry-readability.test.mjs
node scripts/build-ukrainian-infantry-atlas.mjs
node scripts/ukrainian-infantry-art-lab-smoke.mjs
node scripts/ukrainian-infantry-mission-readability-smoke.mjs
```

The build command materializes review-only atlas, manifest, catalog, and contact-sheet files under `artifacts/ukrainian-infantry/`; those files are reproducible products rather than source authorities.

`art-lab.html` remains the exhaustive identity/state/direction surface. The mission readability smoke additionally launches the real first mission and captures Ukrainian infantry at strategic, command, and inspection zoom plus a strategic grayscale/value pass. This actual-mission evidence is mandatory for battlefield-readability changes because atlas coverage alone cannot prove usable scale against terrain, buildings, selection rings, fog, and HUD composition.

## Provenance

The source is original repository work, CC0-1.0, redistribution allowed. It records no external art inputs and no public-figure likenesses. Automated coverage does not replace visual review; Art Lab, actual-mission zoom/value captures, and the normal visual-regression surface are all part of the review evidence.
