# Fires and support visual sets

UFR-114 owns the production visual atlas for the drone/UAS, fires, air-defense, logistics, command, bridging, EW/recovery, and off-map-support profiles introduced by UFR-073, UFR-074, UFR-077, and UFR-078. The source of truth is `art-src/units/support/support-visual-source.json`; it is deliberately separate from the infantry and armored-vehicle atlas owners.

## Canonical identity coverage

The source contains **32 canonical content identities**, not one placeholder per family: 18 Ukrainian profiles and 14 Russian profiles. Tests compare the source IDs directly with `UKRAINIAN_UAS_EW_PROFILE_IDS`, `UKRAINIAN_FIRES_PROFILE_IDS`, `RUSSIAN_UAS_EW_FIRES_PROFILE_IDS`, and `SUPPORT_PROFILE_IDS`, so content drift fails verification until the visual set is updated.

Every faction has explicit coverage for all eight UFR-114 families: `drone`, `artillery`, `rocket`, `air-defense`, `logistics`, `command`, `bridging`, and `support`. More than twenty structural profiles distinguish FPV/recon/relay UAVs, wheeled and tracked artillery, rocket launchers, point/medium air defense, jammers, command/targeting vehicles, logistics/resupply/transport bodies, recovery systems, bridge layers/pontoon carriers, and off-map coordination systems. Faction palette is secondary recognition information; opposing sides are not merely palette-swapped copies of one family silhouette.

## Lifecycle and atlas contract

The atlas follows the UFR-109 production lifecycle contract across eight directions (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`) and seven states:

- `idle` — 1 frame
- `move` — 2 frames
- `attack` — 2 frames
- `hit` — 1 frame
- `damaged` — 1 frame
- `death` — 4 frames
- `wreck` — 1 frame

Each canonical identity also receives a portrait and a family-readable command icon. The generated atlas contains **3,137 frames** (including the fail-safe missing frame) and **224 identity/state animations**. Movement shifts/rotor phases, firing/launch effects, hit sparks, damage smoke, progressive destruction, and wreck treatments are generated deterministically from the repository-authored source contract.

`node scripts/verify-support-visuals.mjs` regenerates the atlas twice and requires byte-identical SVG/manifest output, exact identity/state/direction counts, portraits/icons, both-faction family coverage, and complete provenance. `tests/support-visual-atlas.test.mjs` additionally locks the dependency catalog projection, runtime ownership/fallback behavior, lifecycle resolution, install/restore composition, and fail-closed behavior for dependency or provenance drift.

## Runtime ownership

`src/render/support-visual-atlas.js` resolves only canonical support IDs plus explicit current-runtime aliases. The active aliases are intentionally narrow: `uaDrone`/`quadDrone`, `uaArtillery`/`bohdana`, `ruDrone`/`fixedWingDrone`, and `ruArtillery`/`msta`. Broad role-string heuristics are forbidden because they could steal infantry or vehicle renderer ownership. Unknown identities delegate to the renderer chain unchanged.

`src/render/support-visual-art-pass.js` composes after the existing Ukrainian and Russian vehicle installers. It uses the shared sprite-atlas runtime and preserves fallback drawing while the atlas is loading, after a load error, for an unrelated unit, or if an expected animation cannot be resolved. Runtime state mapping includes hit/death/wreck behavior and preserves the existing selection overlay.

## Art Lab and browser evidence

Press `P` in `art-lab.html` to cycle four UFR-114 review pages and then return to the normal roster:

1. Ukrainian UAS / EW / fires
2. Ukrainian logistics / command / bridging / support
3. Russian UAS / EW / fires
4. Russian logistics / command / bridging / support

`U` cycles lifecycle state, `R` cycles direction, `1`/`2`/`3` changes zoom, `V` toggles grayscale value inspection, `Space` pauses animation, and `S` captures the current review. The normal visual-regression browser smoke opens every UFR-114 page through the Art Lab automation hook, verifies the support runtime reached ready state, and writes four review captures to `artifacts/visual-regression/`; the final Russian support page is captured in grayscale.

## Provenance and scope

The art is original repository-authored fictional vector geometry under CC0-1.0, with no external visual inputs or public-figure likenesses. UFR-114 changes rendering/art contracts only. It does not add units to missions, change simulation statistics, targeting, balance, campaign logic, saves, or sibling projects.
