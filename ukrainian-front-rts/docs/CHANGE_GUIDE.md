# Change guide

Use this guide to keep fixes and features local. Start from the authoritative state transition, contract, or presentation responsibility; do not compensate for a defect in a higher layer.

## Fast routing table

| Change | Start with | Usually avoid |
| --- | --- | --- |
| Unit/building/mission numbers or declarative instances | `src/config.js` and `docs/CONTENT_SCHEMA.md` | renderer branches |
| Content field shape/default/identity | `src/content-schema.js` + `docs/CONTENT_SCHEMA.md` | ad-hoc runtime fallback fields |
| Pure damage/armor vocabulary | `src/combat/` | UI or renderer ownership |
| Passability, terrain cost, A*, route conversion | `src/navigation/` | input/UI copies of path rules |
| Runtime movement, collision, objective, wave, projectile policy | focused `src/systems/` owner | importing `Game`, UI, or renderer into systems |
| Public gameplay command/state facade | small `Game` delegate | new rule branches in `main.js` |
| Selection, keyboard, mouse, minimap input | `src/input/battlefield-input.js` | `Game.update` or renderer event handling |
| Animation-frame lifecycle/fixed-tick scheduling | `src/app/runtime.js` + `src/core/fixed-step-clock.js` | simulation rules using frame delta |
| Headless cross-system scenario | `src/app/simulation-harness.js` + `tests/sim/` | mock browser object graphs |
| Domain-event type or buffering contract | `src/core/events.js` + `docs/DOMAIN_EVENTS.md` | ad-hoc strings or mutable entity payloads |
| HUD presentation | `src/ui.js` | simulation mutation from display code |
| Unit/terrain/effect visuals | renderer/art modules | combat or movement stat changes |
| Architecture policy | `scripts/lib/architecture-verifier.mjs` + tooling fixtures | documentation-only exceptions |
| Project-wide verification stage | `scripts/lib/verification-runner.mjs` + tooling fixtures | another top-level shell command |

## Bug-fix workflow

1. Reproduce the bug and name the incorrect state transition or contract result.
2. Locate the owner in `docs/ARCHITECTURE.md`.
3. Fix the smallest authoritative module.
4. Add a focused deterministic regression test at the matching test layer.
5. Avoid UI/renderer compensation when simulation state is wrong.
6. Run a focused command, then `bash verify.sh`.
7. Replay the affected browser interaction and one adjacent flow when runtime behavior changed.

Examples:

- Wrong damage class: combat schema or combat system, not damage-number rendering.
- Unit enters a blocked cell: navigation grid/path/movement owner, not cursor art.
- Overlapping ground units: collision system, not formation UI.
- Drag selection misses units: input adapter, not `Game.update`.
- Objective completes too early: objective system, not HUD copy.
- Sprite is unreadable: renderer/art module, not unit statistics.
- Verification stage runs out of order: verification runner, not CI-specific scripting.

## Feature slicing

Prefer a vertical slice with one owner per concern:

1. contract/data;
2. authoritative simulation rule;
3. public command/input boundary;
4. domain-event feedback boundary where decoupling is needed;
5. visual/HUD feedback;
6. tests, browser checks, performance evidence, and documentation.

Not every feature needs every slice. A schema addition can be contract-only; a visual pass can be renderer-only; a pure policy can remain browser-independent.

## Content and schema workflow

1. Read `docs/CONTENT_SCHEMA.md`.
2. Keep instances in `src/config.js` or the focused content module introduced by its queue task.
3. Respect each family's identity source: collection key or required `id`.
4. Add compatible optional fields with explicit defaults in `src/content-schema.js`.
5. Treat new required fields, identity changes, renames, type changes, or semantic changes as schema-version work.
6. Update executable and human-readable schema contracts together.
7. Keep cross-record validation in the content validator rather than duplicating it in UI/runtime callers.
8. Run focused schema/content fixtures and `bash verify.sh`.

## Simulation-system workflow

1. Identify the existing fixed-step phase that owns the mutation.
2. Add a focused function that receives game state explicitly.
3. Do not import the `Game` class, UI, renderer, or browser APIs into a system.
4. Keep `Game` as a small public/delegating boundary when existing callers depend on it.
5. Preserve authoritative phase order unless the task explicitly owns an integration change.
6. Use the seeded random service for authoritative randomness; never call `Math.random`.
7. Add a focused test and a headless scenario when the change crosses systems or phases.
8. Document state ownership, update position, event emission, and serialization/replay implications.

## Navigation and movement workflow

1. Put cell/passability/cost/search contracts in `src/navigation/`.
2. Put live game synchronization and unit mutation in `src/systems/`.
3. Request routes from world positions through the waypoint boundary; do not reconstruct cell paths in `Game`, input, UI, or renderer code.
4. Apply unit-to-unit separation only after all units have advanced for the fixed step.
5. Preserve deterministic stable-ID ordering and bounded work.
6. Add fixtures for blocked goals, corridors/chokes, dynamic blockers, mixed unit sizes, map edges, and reversed input order as applicable.
7. Include performance evidence for path search, large groups, caching, or repath changes.
8. Update `docs/NAVIGATION.md`.

## Domain-event workflow

1. Confirm an event is needed for a read-only consumer such as UI, audio, telemetry, or replay.
2. Extend `DOMAIN_EVENT_TYPES`; do not emit an unregistered string.
3. Mutate authoritative state first, then emit.
4. Include stable IDs and values, optional stable source metadata, and the authoritative tick.
5. Never include DOM nodes, renderer objects, mutable entity references, or callbacks in payloads.
6. Do not make gameplay depend on a subscriber being attached.
7. Test ordering, sequence monotonicity, payload immutability, subscription/unsubscription, and drain/peek behavior relevant to the change.
8. Update `docs/DOMAIN_EVENTS.md` when taxonomy or lifecycle rules change.

## Fixed-step and lifecycle workflow

1. Keep animation-frame scheduling in `src/app/runtime.js`.
2. Keep accumulation/tick cadence in `src/core/fixed-step-clock.js`.
3. Keep authoritative phase sequencing in `src/systems/simulation-phases.js`.
4. Never use display-frame delta inside a simulation rule.
5. If phase order changes, update `SIMULATION_PHASES`, phase-order tests, deterministic frame-chunking scenarios, architecture documentation, and any event/random ordering assumptions.
6. Verify zero-, one-, and multi-tick frame accumulation where relevant.

## Unit-test workflow

1. Identify the smallest public owner.
2. Add an independent `*.test.mjs` fixture using `node:test` and `node:assert`.
3. Choose the matching directory:
   - `tests/unit/` for focused public logic/state transitions;
   - `tests/core/` for core contracts;
   - `tests/navigation/` for grid/path/movement/collision;
   - `tests/combat/` for combat contracts/policies;
   - `tests/tooling/` for temporary-project verifier/runner fixtures.
4. Cover success, rejection/failure, deterministic ordering, and no-mutation guarantees relevant to the rule.
5. Reset shared deterministic services and never depend on test-file execution order.
6. Run a focused subset through the existing test runner, then `bash verify.sh`.

## Headless-simulation workflow

1. Use `src/app/simulation-harness.js`; do not construct renderer, UI, input, canvas, or animation-frame substitutes.
2. Start with an explicit mission index, seed, viewport, and tick duration when defaults are not under test.
3. Issue structured commands that delegate to public `Game` methods.
4. Advance exact ticks rather than sleeping or using wall-clock time.
5. Assert a reference-free snapshot or use `assertState`.
6. Repeat the same command stream with the same seed for deterministic behavior; use a different seed only when divergence is part of acceptance.
7. Keep direct live-game setup mutations small and explicit.
8. Run focused simulation tests, then `bash verify.sh`.

## Architecture-policy workflow

1. Define the new layer or dependency direction in plain language.
2. Update `layerOf`, `ALLOWED_IMPORTS`, DOM/audio ownership, and required-import checks as applicable in `scripts/lib/architecture-verifier.mjs`.
3. Add temporary-project fixtures for at least one allowed and one forbidden edge.
4. Do not solve a verifier mismatch by adding an undocumented allow-list or by claiming a source directory is exempt.
5. Update `docs/ARCHITECTURE.md` and this guide in the same PR.
6. Run the tooling fixture and the unified verification command.

The original Gate A verifier predates the dedicated `src/navigation/` and `src/combat/` directories now present on `main`. Their intended inward-only ownership is documented, but executable classification must be updated by an architecture-policy task rather than assumed by documentation.

## Verification-stage workflow

1. Keep `bash verify.sh` as the only supported top-level command.
2. Add or change ordered stages in `scripts/lib/verification-runner.mjs`.
3. Add temporary-project coverage for complete success, first-failure short-circuiting, stage label, and exact exit status.
4. Preserve stable syntax discovery and deterministic stage order.
5. Update `docs/VERIFICATION.md`.
6. Keep CI as a caller of `bash verify.sh`, not a second pipeline definition.

## Visual-improvement workflow

1. Define the gameplay read before drawing.
2. Prototype in an art pass or focused renderer module.
3. Validate in `art-lab.html` at supported zooms, facings, paused/unpaused motion, and grayscale mode.
4. Validate on mission terrain with selection rings, health bars, fog, effects, and UI overlays.
5. Keep combat and movement values unchanged unless the task explicitly includes balance.
6. Follow the asset/provenance pipeline before replacing procedural art with atlases.

## New-module checklist

Create a module when the concern has its own vocabulary, can be tested independently, and reduces branching in the caller. Do not create a module only to rename one expression or hide a cycle.

A new pure/core/navigation/combat module should:

- import only allowed inward contracts;
- avoid browser APIs and hidden global state;
- expose deterministic functions/classes with explicit inputs;
- return immutable results where they are shared across layers;
- have one clear reason to change.

A new system should:

- receive authoritative state explicitly;
- avoid importing `Game`, UI, or renderer classes;
- declare its mutation boundary and fixed-step position;
- preserve deterministic iteration/order;
- expose diagnostics only when they do not become a second source of truth.

An app/input/presentation adapter may own browser integration, but it must delegate simulation outcomes to public commands and authoritative systems.

## Review checklist

- Is the change confined to `ukrainian-front-rts/`?
- Is there one authoritative implementation of each rule?
- Does the import direction match both documented and executable architecture policy?
- Does `main.js` remain composition rather than behavior?
- Are simulation rules fixed-step and deterministic?
- Are seeded random draw order and event emission order preserved or deliberately documented?
- Do content and schema contracts match?
- Does the selected test layer match the owner?
- Does cross-system sequencing have a headless deterministic fixture?
- Are pathfinding/large-group changes measured?
- Are browser listeners disposable and key state cleared on blur?
- Do all affected controls work, including W/A/S/D where applicable?
- Do UI/render consumers remain read-only?
- Does `bash verify.sh` remain the single complete verification entry point?
- Do architecture, change, and focused subsystem docs match the new boundary?
