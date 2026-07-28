# Change guide

Use this guide to keep fixes and features local instead of expanding a change across the game.

## Bug fix workflow

1. Reproduce the bug in one mission and write down the responsible state transition.
2. Locate the owner using `docs/ARCHITECTURE.md`.
3. Fix the smallest authoritative module.
4. Avoid compensating UI or renderer code when the defect is in simulation state.
5. Run `bash verify.sh`, then replay the affected interaction and one adjacent system.

Examples:

- A unit deals the wrong damage: config or combat simulation, not the renderer.
- Drag selection misses units: input adapter, not `Game.update`.
- An objective completes too early: objective system, not HUD text.
- A sprite is unreadable: art/render module, not unit statistics.

## Feature slicing

Prefer vertical slices with one owner per concern:

- data/configuration;
- simulation rule;
- player command/input;
- visual feedback;
- HUD feedback;
- verification/documentation.

Not every feature needs every slice. A balance patch can be config-only; a visual pass can be renderer-only.

## Visual improvement workflow

1. Define the gameplay read before drawing.
2. Prototype in `art-pass.js` or a focused renderer module.
3. Validate in `art-lab.html` at zoom levels 1–3, both facings, motion paused/unpaused, and grayscale mode.
4. Validate on all mission terrain palettes with selection rings, health bars, fog, and effects.
5. Keep combat and movement values unchanged unless the task explicitly includes balance.
6. Follow `ART_PIPELINE.md` before converting a procedural unit to an atlas.

## New module checklist

Create a module when a concern has its own vocabulary, can be tested or reasoned about independently, and reduces branching in its caller. Do not create a module that only renames one line or hides a circular dependency.

A new system should:

- accept required state explicitly;
- avoid DOM APIs;
- avoid importing `Game`, `UI`, or `Renderer`;
- return a result or mutate the supplied authoritative state deliberately;
- have a single clear reason to change.

## Review checklist

- Is the change confined to `ukrainian-front-rts/`?
- Is there one authoritative implementation of each rule?
- Can balance/content remain in `config.js`?
- Does `main.js` still read as composition rather than behavior?
- Are event listeners disposable and key state cleared on blur?
- Do all documented controls work, including W/A/S/D?
- Do docs match any new boundary or extension point?
