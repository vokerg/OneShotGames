# Change guide

Use this guide to route work to one authoritative owner, keep dependency direction intact, and choose the required verification before editing.

## Start every change here

1. Read the task row in `TASKS.md` and its dependency/parallel rules.
2. Resolve the current owner in `docs/ARCHITECTURE.md`.
3. Reproduce or describe the state transition being changed.
4. Separate data, simulation, AI planning, input, presentation, and verification concerns.
5. Change the smallest authoritative module.
6. Add focused deterministic coverage.
7. Run the focused command, then `bash verify.sh`.
8. Perform browser, visual, audio, or performance checks required by the affected flow.

Do not fix authoritative-state defects in UI or renderer code. Do not add gameplay rules to `main.js`, runtime scheduling, input listeners, AI inspection consumers, or domain-event consumers.

## Change routing

| Change | Primary owner | Usually coordinate | Avoid |
| --- | --- | --- | --- |
| Balance or content instance | `src/config.js` or focused `src/content/` module | schema/content docs and validators | renderer branches for gameplay values |
| Content field or identity | `src/content-schema.js` | `docs/CONTENT_SCHEMA.md`, validators, migrations | silent shape changes in consumers |
| Simulation rule | focused `src/systems/` module + small `Game` delegate | phase order, random/event implications | UI, renderer, runtime |
| AI knowledge/planning contract | `src/ai/` | doctrine/content data, fixed-step system adapter, public commands | hidden-state reads, direct `Game`/system imports, UI-owned decisions |
| Fixed-step order or timing | `src/systems/simulation-phases.js`, `src/core/fixed-step-clock.js` | runtime, harness, deterministic scenarios | animation-frame delta in rules |
| Random authoritative decision | `src/core/random.js` service or core helpers | same-seed/different-seed tests | `Math.random` in simulation or AI |
| Domain-event type/stream | `src/core/events.js` | producer and read-only consumer docs/tests | ad-hoc strings or event-driven gameplay authority |
| Browser input/commands | `src/input/` | public `Game` commands and UI feedback | literal-key logic in simulation |
| Mission startup/frame loop | `src/app/runtime.js` | fixed-step clock and runtime tests | gameplay rules in frame callbacks |
| Headless scenario support | `src/app/simulation-harness.js` | public `Game` commands and snapshots | fake DOM/renderer implementations |
| Rendering or art | renderer/art module | `art-lab.html`, zoom/grayscale checks | combat or movement mutations |
| HUD/presentation | `src/ui.js` | public commands and domain events | owning objective/economy/combat/AI rules |
| Browser audio | `src/audio/` | domain-event mapping, mute/volume lifecycle | direct `Audio` calls elsewhere |
| New production layer | focused `src/<layer>/` | architecture verifier + docs + tooling fixtures | unclassified modules |
| Verification stage | `scripts/lib/verification-runner.mjs` | focused tooling fixtures and `docs/VERIFICATION.md` | duplicated shell/CI stage lists |

## Bug-fix workflow

1. Reproduce the failure in the smallest deterministic context.
2. Identify the state owner, not the visible symptom.
3. Add a failing test at the narrowest appropriate layer.
4. Fix the owner without compensating in a higher layer.
5. Verify one adjacent behavior that shares the same contract.

Examples:

- Wrong damage: content or combat policy, not the renderer.
- Drag selection misses units: input adapter, not `Game.update`.
- Objective completes early: objective system, not HUD text.
- AI reacts to an unseen target: observation/knowledge adapter, not difficulty numbers.
- Slow displays change outcomes: fixed-step runtime/phase contract, not unit speed values.
- Sound plays twice: audio consumer/event mapping, not combat state.
- Contract violation is not caught: focused verifier and tooling fixtures, not CI-only logic.

## Content and schema workflow

1. Read `docs/CONTENT_SCHEMA.md`.
2. Keep content instances declarative in `src/config.js` or the focused `src/content/` module assigned by the queue.
3. Use the family identity source exactly as specified.
4. Prefer optional fields with explicit defaults for compatible additions.
5. Treat new required fields, identity changes, renames, type changes, and semantic changes as schema-version decisions.
6. Update `src/content-schema.js` and `docs/CONTENT_SCHEMA.md` together.
7. Update focused cross-record validators when references or legal combinations change.
8. Keep runtime migration/loading work in its own owner unless explicitly included.
9. Run focused schema/content checks, then `bash verify.sh`.

## Simulation-mechanic workflow

1. Define the authoritative state inputs and mutation boundary.
2. Put independently testable policy in a focused system.
3. Keep a small `Game` method as the public facade when existing callers need it.
4. Decide which fixed-step phase owns execution.
5. Use seeded randomness for every replay-relevant draw.
6. Emit domain events only after successful state mutation.
7. Render and display feedback from state/events; do not duplicate the rule.
8. Add unit coverage and a headless scenario when cross-system order matters.
9. Document changes to tick order, random draw order, event order, serialization, or replay behavior.

## AI planning workflow

1. Define which own-side state and enemy observations are permitted inputs.
2. Express doctrine, cadence, risk, and weighting as immutable data.
3. Store contacts, goals, budgets, and decision history in the `src/ai/` blackboard contract.
4. Add knowledge only from explicit line-of-sight, domain-event, or authored mission-intelligence observations.
5. Evaluate planners at exact fixed simulation ticks; never use animation-frame time or wall-clock timers.
6. Have planners return reference-free proposals or command descriptors rather than mutating `Game` or system state.
7. Validate and execute proposals through the same public `Game` commands or focused system policies used by player actions.
8. Use stable iteration/tie-breaking and the seeded random service for every replay-relevant draw.
9. Expose frozen inspection snapshots for debug UI, telemetry, replay, and tests.
10. Compare incremental and chunked tick advancement and assert identical decisions.
11. Never grant hidden map knowledge or stat cheats by default; difficulty changes reaction delay, planning quality, risk, and economy efficiency.

See `docs/AI_ARCHITECTURE.md` for the UFR-079 contracts and UFR-080 through UFR-083 ownership boundaries.

## Fixed-step or deterministic-behavior workflow

A change is deterministic-behavior work when it modifies tick duration, phase order, command execution order, entity iteration order, random draw order, event sequence order, AI decision cadence, or snapshot shape.

1. Update the authoritative owner only.
2. Preserve one `Game.update(fixedStep)` call per simulation tick.
3. Never use animation-frame elapsed time inside a simulation or AI rule.
4. Update phase/unit/AI tests.
5. Run identical command and observation streams under different render-frame chunking.
6. Compare reference-free snapshots with the same seed.
7. Add a different-seed divergence assertion when randomness is involved.
8. Record replay/save compatibility implications.

## Domain-event workflow

1. Confirm the event describes a completed authoritative change or external request.
2. Add the stable type to `DOMAIN_EVENT_TYPES`; do not emit an unregistered string.
3. Use a payload containing stable IDs and immutable values.
4. Emit after validation and mutation succeed.
5. Keep producer ordering deterministic within the owning phase/command.
6. Keep consumers read-only with respect to simulation authority.
7. Test type validation, tick/sequence order, payload shape, and relevant consumer mapping.
8. Update `docs/DOMAIN_EVENTS.md` for taxonomy or lifecycle changes.

An event stream is not a command bus. Gameplay must produce the same result when presentation, audio, telemetry, replay, and AI observation consumers are absent.

## Input and command workflow

1. Add or reuse a named action in the input action map.
2. Bind browser keys/gestures in the input adapter.
3. Delegate authoritative validation and mutation to a public `Game` command.
4. Define cancellation, replacement, queueing, and game-over behavior explicitly.
5. Clear held state on keyup, blur, disposal, and mission transition where applicable.
6. Provide cursor/HUD feedback without duplicating the rule.
7. Test command resolution independently and browser integration where supported.
8. Recheck W/A/S/D, minimap navigation, selection, right-click orders, and attack-move unless the task is isolated from those flows.

## Unit-test workflow

1. Identify the smallest public owner.
2. Add a deterministic `*.test.mjs` under `tests/unit/` or the focused existing test directory such as `tests/ai/`.
3. Use `node:test` and `node:assert`; do not add a third-party framework.
4. Build the smallest explicit fixture.
5. Cover success, rejection, and no-mutation-on-failure behavior.
6. Reset shared deterministic services inside the test.
7. Run `node scripts/run-tests.mjs <path-fragment>`, then `bash verify.sh`.

## Headless-scenario workflow

1. Use `src/app/simulation-harness.js`.
2. Start with explicit mission, seed, viewport, and tick duration where relevant.
3. Issue structured commands that delegate to public `Game` methods.
4. Advance exact ticks; do not sleep or use wall-clock time.
5. Assert a reference-free snapshot or use `assertState`.
6. Keep direct live-state setup small and explicit.
7. Repeat the scenario with the same seed for deterministic behavior.
8. Keep DOM, canvas, renderer, UI, input, and animation-frame substitutes out of the harness.
9. Run `node scripts/run-tests.mjs sim`, then `bash verify.sh`.

## Tooling-contract workflow

Use `tests/tooling/` for architecture, verification, queue, or similar executable repository contracts.

1. Extract reusable logic from the CLI into a focused module.
2. Inject filesystem/process execution boundaries where practical.
3. Build temporary synthetic projects that cover accepted and rejected layouts.
4. Assert actionable failure messages and exact non-zero propagation.
5. Do not copy the production tree into fixtures.
6. Do not weaken a contract merely to make current source pass.
7. Run the focused tooling test, then the real `bash verify.sh` entry point.

## Adding a production module or layer

Create a module when the concern has its own vocabulary, independently testable policy, and a single reason to change.

A focused simulation/core/AI module should:

- accept required state explicitly;
- avoid DOM and direct browser audio APIs;
- avoid importing higher layers;
- return a result or deliberately mutate supplied authoritative state owned by that layer;
- expose stable public contracts rather than mutable internal references.

Focused declarative modules under `src/content/` use the existing `config` architecture layer. The `src/ai/` directory is a distinct inward-facing planning layer and may import only core, schema, config/content, and sibling AI modules.

A new top-level source layer additionally requires:

1. a documented owner and dependency direction;
2. an entry in `scripts/lib/architecture-verifier.mjs`;
3. allowed-import rules that point inward;
4. DOM/audio ownership decisions;
5. accepted and rejected tooling fixtures;
6. an update to `docs/ARCHITECTURE.md` and this guide.

Never leave a new `src/` directory unclassified.

## Extending verification

1. Add the command to `VERIFICATION_COMMANDS` in `scripts/lib/verification-runner.mjs`.
2. Place it at the correct dependency order.
3. Add or update `tests/tooling/verification-runner.test.mjs`.
4. Ensure first-failure short-circuiting and status preservation remain intact.
5. Update `docs/VERIFICATION.md`.
6. Keep `verify.sh` as a thin entry point.
7. Configure CI to call `bash verify.sh`; do not duplicate stages in workflow YAML.

## Visual-improvement workflow

1. Define the gameplay read before drawing.
2. Prototype in `art-pass.js` or a focused renderer module.
3. Validate in `art-lab.html` at supported zoom levels and both facings.
4. Check motion paused/unpaused, selection rings, health bars, fog, effects, and grayscale readability.
5. Check all affected mission terrain palettes.
6. Keep combat, movement, AI, and content values unchanged unless balance is explicit scope.
7. Follow `ART_PIPELINE.md` before converting procedural art to atlas assets.

## Review and completion checklist

- Is the change confined to `ukrainian-front-rts/`?
- Is there one authoritative implementation of each rule?
- Does dependency direction still point inward?
- Does `main.js` remain composition only?
- Are fixed-step, random, event, AI-cadence, and command ordering implications explicit?
- Does AI use only permitted observations and ordinary validated command paths?
- Do schema code, content data, and human-readable docs agree?
- Do tests use the correct unit, AI, simulation, or tooling layer?
- Is a new source layer registered in architecture verification?
- Does `bash verify.sh` remain the only top-level verification command?
- Were required browser, visual, audio, and performance checks performed?
- Does the PR contain exact verification evidence?
- Was current `main` integrated before completion?
- Was the claim removed and the completion marker added?
- Do `docs/ARCHITECTURE.md` and this guide match the final owners and extension points?
