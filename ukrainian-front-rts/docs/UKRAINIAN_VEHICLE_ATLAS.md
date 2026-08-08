# Ukrainian vehicle atlas

UFR-112 implements the Ukrainian armored-vehicle visual family using the UFR-109 sprite-atlas contract. The editable source catalog lives at `art-src/units/ukraine/vehicles/ukrainian-vehicle-source.json`; `src/render/ukrainian-vehicle-atlas-generator.js` deterministically expands it into a versioned atlas manifest and SVG sheet.

## Family coverage

The atlas contains five required vehicle identities: protected transport/APC, infantry fighting vehicle, main battle tank, armored recovery vehicle, and combat engineering vehicle. Current game IDs `uaIfv` and `uaTank` resolve directly; `uaApc`, `uaRecovery`, and `uaEngineeringVehicle` are stable visual aliases for the broader UFR-072 roster without adding gameplay types on this branch.

Every identity has all eight canonical facings plus `idle`, `move`, `attack`, `hit`, `damaged`, `death`, and `wreck` coverage. Attack frames include profile-appropriate recoil/muzzle attachment placement; damage/death/wreck sequences add sparks, smoke, blast, and hull-damage marks. Each identity also has a portrait and command icon. The generated family contains 851 frames and 35 directional animation definitions.

Silhouettes are deliberately role-readable: protected carrier, IFV turret/autocannon, MBT turret/main gun, recovery boom, and engineering blade/breaching profile. Palette/value hierarchy follows `docs/ART_PIPELINE.md`, and the manifest requests nearest-neighbor sampling.

## Runtime integration

`src/render/ukrainian-vehicle-art-pass.js` only claims matching Ukrainian armored, non-air entities. Unmatched infantry, drones, artillery/support entities, and all simulation logic continue through the existing renderer/runtime. Loading failures retain the old procedural unit/portrait renderer as an explicit fallback.

The adapter is registered from `src/render/viewport-runtime-bootstrap.js`, before normal game composition constructs the renderer, and uses the shared atlas runtime for frames, directional animations, anchors, masks, and muzzle attachments.

## Provenance and verification

The source records the silhouettes as original repository-authored fictional art, CC0-1.0, with no external visual inputs or public-figure likenesses. `tests/ukrainian-vehicle-atlas.test.mjs` validates source coverage, manifest validity, exact frame/animation counts, all direction/state sequences, portrait/icon presence, current armored aliases, exclusion of infantry/drones, and browser registration.

A maintainer visual review of final contact-sheet/in-game presentation remains a release-quality gate. The branch also relies on the repository browser-startup and deterministic visual-regression captures to catch integration regressions while under review.
