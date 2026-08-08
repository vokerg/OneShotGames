# Russian infantry atlas

UFR-111 implements the Russian infantry visual family on the versioned sprite-atlas contract established by UFR-109. The canonical editable source is `art-src/units/russia/infantry/russian-infantry-source.json`; `src/render/russian-infantry-atlas-generator.js` deterministically expands that source into the atlas manifest and SVG sheet consumed by the runtime loader.

## Family coverage

The atlas contains eight visual identities: engineer-sappers, command group, motor-rifle squad, shock assault group, anti-armor group, scout section, medical team, and short-range air-defense team. The first seven map to the UFR-075 Russian infantry roster; the air-defense team closes the explicit UFR-111 art requirement and is available through the `ruAirDefense`/`air-defense` visual alias without creating gameplay ownership for a new unit type.

Every identity has all eight canonical facings (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`) and the required `idle`, `move`, `attack`, `hit`, `damaged`, `death`, and `wreck` states. Each identity also has a portrait and command icon. The generated family contains 1,361 frames and 56 directional animation definitions.

Role silhouettes are intentionally differentiated through equipment and accents: engineer tool, command radio, rifle, assault grenade, anti-armor launcher, reconnaissance optic, medical marking, and elevated short-range air-defense launcher. Faction palette/value hierarchy follows `docs/ART_PIPELINE.md` and nearest-neighbor sampling is declared in the atlas manifest.

## Runtime integration

`src/render/russian-infantry-art-pass.js` is a renderer adapter, not a simulation owner. It resolves only matching non-armored/non-air Russian infantry IDs and delegates every unmatched entity to the pre-existing renderer. Until the generated atlas finishes loading—or if it fails—the old procedural rendering remains the explicit fallback. Portraits use the same resolved atlas identity.

`src/render/russian-infantry-runtime-install.js` installs the adapter in the browser runtime. Muzzle attachments, selection anchors, masks, and directional animation timing use the shared UFR-109 atlas runtime contract.

## Provenance and verification

The source catalog records the family as original repository-authored fictional silhouettes, CC0-1.0, with no external visual inputs or public-figure likenesses. `tests/russian-infantry-atlas.test.mjs` validates source coverage, manifest validity, frame/animation counts, all direction/state sequences, portrait/icon presence, current runtime aliases, the planned air-defense alias, and browser registration.

A maintainer visual review of final contact-sheet/in-game presentation remains a release-quality gate; the deterministic visual-regression capture is used to detect unrelated renderer/UI regressions while this family remains in draft review.
