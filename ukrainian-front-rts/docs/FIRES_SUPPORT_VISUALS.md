# Fires and support visual sets

UFR-114 owns the production visual atlas for the drone/UAS, fires, air-defense, logistics, command, bridging, EW/recovery, and off-map-support profiles introduced by UFR-073, UFR-074, UFR-077, and UFR-078. The source of truth is `art-src/units/support/support-visual-source.json`; it is deliberately separate from the infantry and armored-vehicle atlas owners.

## Canonical identity coverage

The source contains **32 canonical content identities**, not one placeholder per family: 18 Ukrainian profiles and 14 Russian profiles. Tests compare the source IDs directly with `UKRAINIAN_UAS_EW_PROFILE_IDS`, `UKRAINIAN_FIRES_PROFILE_IDS`, `RUSSIAN_UAS_EW_FIRES_PROFILE_IDS`, and `SUPPORT_PROFILE_IDS`, so content drift fails verification until the visual set is updated.

Every faction has explicit coverage for all eight UFR-114 families: `drone`, `artillery`, `rocket`, `air-defense`, `logistics`, `command`, `bridging`, and `support`. More than twenty structural profiles distinguish FPV/recon/relay UAVs, wheeled and tracked artillery, rocket launchers, point/medium air defense, jammers, command/targeting vehicles, logistics/resupply/transport bodies, recovery systems, bridge layers/pontoon carriers, and off-map coordination systems. Faction palette is secondary recognition information; opposing sides are not merely palette-swapped copies of one family silhouette.

## Lifecycle and atlas contract

The release atlas follows the UFR-109 production lifecycle contract across eight directions (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`) and seven states:

- `idle` — 1 frame
- `move` — 2 frames
- `attack` — 2 frames
- `hit` — 1 frame
- `damaged` — 1 frame
- `death` — 4 frames
- `wreck` — 1 frame

Each canonical identity also receives a portrait and a family-readable command icon. The deterministic release generator produces **3,137 logical frames** (including the fail-safe missing frame) and **224 identity/state animations**. Movement shifts/rotor phases, firing/launch effects, hit sparks, damage smoke, progressive destruction, and wreck treatments are generated from the repository-authored source contract.

`node scripts/verify-support-visuals.mjs` regenerates the complete release atlas twice and requires byte-identical SVG/manifest output, exact identity/state/direction counts, portraits/icons, both-faction family coverage, and complete provenance. `tests/support-visual-atlas.test.mjs` additionally locks the dependency catalog projection, runtime ownership/fallback behavior, lifecycle resolution, install/restore composition, and fail-closed behavior for dependency or provenance drift.

## Runtime ownership and bounded decoding

`src/render/support-visual-atlas.js` resolves only canonical support IDs plus explicit current-runtime aliases. The active aliases are intentionally narrow: `uaDrone`/`quadDrone`, `uaArtillery`/`bohdana`, `ruDrone`/`fixedWingDrone`, and `ruArtillery`/`msta`. Broad role-string heuristics are forbidden because they could steal infantry or vehicle renderer ownership. Unknown identities delegate to the renderer chain unchanged.

The browser does **not** decode the 3,137-frame release SVG as one monolithic image. Runtime rendering uses the same deterministic frame geometry through `support-visual-review-frame.js`, preloading only the four currently instantiated support aliases across their eight idle facings (32 tiny images). Other lifecycle, direction, portrait, and canonical-profile frames decode lazily on first demand. While a requested frame is still decoding, `support-visual-art-pass.js` delegates to the previous renderer rather than producing a blank or duplicate draw. This keeps startup bounded and preserves renderer-chain ownership.

A parity regression test guards the split between release generation and runtime decoding: lightweight runtime/review frame SVG is required to occur byte-for-byte inside the production atlas output for every canonical profile, with additional coverage across every direction and lifecycle frame. If the production geometry changes without the runtime geometry changing, verification fails.

`src/render/support-visual-art-pass.js` composes after the existing Ukrainian and Russian vehicle installers. It wraps both unit and portrait rendering, preserves selection behavior only after a support frame actually draws, restores both predecessor methods on teardown, and fails back to predecessor rendering during load/decode failure or for unrelated identities.

## Art Lab and browser evidence

Press `P` in `art-lab.html` to cycle four UFR-114 review pages and then return to the normal roster:

1. Ukrainian UAS / EW / fires
2. Ukrainian logistics / command / bridging / support
3. Russian UAS / EW / fires
4. Russian logistics / command / bridging / support

`U` cycles lifecycle state, `R` cycles direction, `1`/`2`/`3` changes zoom, `V` toggles grayscale value inspection, `Space` pauses animation, and `S` captures the current review. Review-query startup preloads only the requested page's idle/east frames, so browser evidence cannot accidentally trigger a monolithic atlas decode. The visual-regression gate captures representative opposing-faction pages in color and grayscale while the four complete pages remain available for manual inspection; exact all-32 identity coverage is enforced by the source/verifier tests.

The UFR-113 Russian vehicle Art Lab overlay explicitly suspends itself while a UFR-114 page is active, preventing an older review loop from contaminating support screenshots or intercepting UFR-114 state/direction/value controls.

## Provenance and scope

The art is original repository-authored fictional vector geometry under CC0-1.0, with no external visual inputs or public-figure likenesses. UFR-114 changes rendering/art contracts only. It does not add units to missions, change simulation statistics, targeting, balance, campaign logic, saves, or sibling projects.
