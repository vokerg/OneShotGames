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

## Content and schema workflow

1. Read `docs/CONTENT_SCHEMA.md` before adding or changing declarative content.
2. Keep content instances in `src/config.js` or the focused content module introduced by its queue task.
3. Use the collection key or required `id` field exactly as the family contract specifies.
4. Add optional fields with explicit defaults in `src/content-schema.js`.
5. Treat new required fields, identity changes, renames, type changes, or changed meanings as a schema-version change.
6. Update `src/content-schema.js` and `docs/CONTENT_SCHEMA.md` in the same PR.
7. Do not fold cross-record validation, migrations, map loaders, or AI behavior into a schema-only task.
8. Run `bash verify.sh` so the schema registry and default materialization checks execute.

## Unit test workflow

1. Identify the public function, public `Game` method, or focused system that owns the behavior.
2. Add a deterministic `*.test.mjs` file under `tests/unit/`; do not add a third-party framework.
3. Use `node:test` and `node:assert`, with the smallest explicit fixture that exercises the owner directly.
4. Cover the successful transition, important rejection paths, and state that must remain unchanged on failure.
5. Reset shared deterministic services inside the affected test and never depend on file execution order.
6. Run a focused subset with `node scripts/run-tests.mjs <path-fragment>`, then run `bash verify.sh`.
7. Keep headless scenario stepping and browser interaction coverage in their dedicated later test layers.

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
- Do schema and content documentation match affected data?
- Do unit tests cover the changed pure rule or public state transition?
- Does `main.js` still read as composition rather than behavior?
- Are event listeners disposable and key state cleared on blur?
- Do all documented controls work, including W/A/S/D?
- Do docs match any new boundary or extension point?
