# Fires and support visual sets

UFR-114 adds one deterministic source contract for both factions’ drone, artillery, rocket, air-defense, logistics, command, bridging, and general-support identities. The source lives at `art-src/units/support/support-visual-source.json` and is intentionally independent from the infantry and armored-vehicle atlas owners.

The generator produces 640 logical SVG frames: 2 factions × 8 support families × 8 directions × 5 battlefield states. Every family has idle, move, attack, damaged, and wreck treatment. Faction palette tokens remain distinct while role silhouettes carry the primary recognition burden: drones use four rotors, artillery uses a long gun, rockets use an elevated launcher rack, air defense uses a radar dish, logistics uses a cargo body, command uses a mast, bridging uses a folded bridge span, and generic support uses a utility body.

`node scripts/verify-support-visuals.mjs` fails closed if either faction, any required family/direction/state, provenance metadata, or any expected frame identity disappears. `tests/support-visual-atlas.test.mjs` additionally locks deterministic generation and identity uniqueness.

The art is repository-authored fictional vector geometry under CC0-1.0, with no external visual inputs and no public-figure likenesses. This task does not alter simulation statistics, targeting, balance, campaign logic, or sibling projects.
