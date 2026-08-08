# Russian vehicle atlas

UFR-113 implements the Russian armored-vehicle visual family using the UFR-109 sprite-atlas contract and the canonical UFR-076 mobility/armor identities. The editable source catalog lives at `art-src/units/russia/vehicles/russian-vehicle-source.json`; `src/render/russian-vehicle-atlas-generator.js` deterministically expands it into the versioned atlas manifest and SVG sheet.

## Family coverage

The atlas contains five visual identities: mass protected transport/APC, infantry fighting vehicle, breakthrough main battle tank, armored recovery tractor, and combat engineering breacher. The first four map directly to the UFR-076 content branch (`ru.apc-carrier`, `ru.apc-ifv`, `ru.tank-breakthrough`, and `ru.repair-tractor`). `ruEngineeringVehicle` is a stable visual-only alias that satisfies the UFR-113 engineering family without adding a gameplay roster entry.

Current legacy battlefield types `ruIfv` and `ruTank` resolve to the IFV and breakthrough-tank identities. `ruApc`, `ruRecovery`, and `ruEngineeringVehicle` remain forward-compatible visual aliases and do not change balance, production, or simulation ownership.

Every identity has all eight canonical facings plus `idle`, `move`, `attack`, `hit`, `damaged`, `death`, and `wreck` coverage. Attack frames carry profile-appropriate recoil and muzzle attachment placement; damage/death/wreck sequences add sparks, smoke, blast, and hull damage. Every identity has a portrait and command icon. The generated family contains 851 frames and 35 directional animation definitions.

Silhouette detail is role-specific rather than decorative noise: the APC retains a compact defensive mount, the IFV carries autocannon/optic/missile details, the tank uses a large turret/main gun and ERA-like blocks, recovery uses a crane/winch profile, and engineering uses a forward breaching blade. Tracks, hull panels, stowage, optics, and material separation add inspection-scale fidelity while keeping role geometry dominant at command and strategic zooms.

## Runtime integration

`src/render/russian-vehicle-art-pass.js` only claims matching Russian armored, non-air entities. Ukrainian vehicles, infantry, drones, artillery/support units, and unrelated identities continue through the prior renderer layers. Loading failures retain the previous renderer and portrait implementation as explicit fallback.

The runtime installer is composed after the Ukrainian vehicle installer in `src/render/viewport-runtime-bootstrap.js`. This preserves the layered fallback chain while giving each faction-specific vehicle atlas exclusive ownership of its own identities.

## Review and provenance

The shared Art Lab includes a dedicated UFR-113 Russian vehicle strip synchronized with production state/direction controls and strategic/command/inspection scales. `scripts/russian-vehicle-mission-readability-smoke.mjs` additionally captures the integrated Russian IFV and tank on an actual mission terrain surface at strategic, command, inspection, and grayscale/value views.

The source records original repository-authored fictional vehicle art, CC0-1.0, with no external visual assets or public-figure likenesses. `tests/russian-vehicle-atlas.test.mjs` validates deterministic generation, exact lifecycle/directional coverage, aliases, faction ownership, portrait/icon presence, detail markers, and runtime composition.