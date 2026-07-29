# Fields of Resolve architecture

## Purpose

Fields of Resolve is a dependency-free browser RTS. The architecture keeps authoritative gameplay deterministic, content declarative, browser concerns at the edge, and verification executable through one command. Changes should touch the smallest responsible owner and preserve explicit dependency direction.

This document records the Gate A foundation established by UFR-003 through UFR-011 and the navigation layer established by UFR-018 through UFR-022. Later feature lanes may add focused modules, but they must preserve these contracts or update this document and the architecture verifier in the same pull request.

## Gate A invariants

1. `src/main.js` is composition only.
2. `Game` and `src/systems/` own authoritative simulation state and rules.
3. Simulation advances in fixed ticks through one documented phase order.
4. All authoritative randomness uses the seeded core service.
5. Content shape is versioned in `src/content-schema.js`; content instances remain declarative.
6. Domain events describe completed state changes; consumers never become an alternate simulation control path.
7. Browser DOM, canvas, input, and audio APIs remain at browser-owned boundaries.
8. Unit, scenario, tooling, and contract verification are dependency-free and run through `bash verify.sh`.
9. Production source uses repository-relative imports and never imports tests.
10. Every new source layer is declared in `scripts/lib/architecture-verifier.mjs` when introduced.

## Runtime composition

```text
index.html
  └─ src/main.js                         composition root
      ├─ src/app/runtime.js              mission start + animation-frame lifecycle
      │   └─ src/core/fixed-step-clock.js
      │                                   frame accumulator and fixed tick cadence
      ├─ src/input/                      browser input adapters
      ├─ src/ui.js                       HUD and command presentation
      ├─ src/render.js                   base renderer
      ├─ src/art-pass.js                 additive visual override
      └─ src/game.js                     authoritative simulation facade
          ├─ src/config.js               content and balance instances
          ├─ src/content-schema.js       versioned content contracts/defaults
          ├─ src/core/
          │   ├─ random.js               seeded simulation random stream
          │   ├─ fixed-step-clock.js     fixed-tick accumulator
          │   └─ events.js               domain-event taxonomy and stream
          ├─ src/navigation/
          │   ├─ navigation-grid.js      passability, terrain cost, blockers
          │   ├─ pathfinder.js           deterministic bounded A*
          │   ├─ waypoint-route.js       world/cell route translation
          │   └─ path-service.js         cache, invalidation, repath cadence, counters
          └─ src/systems/
              ├─ simulation-phases.js    authoritative phase order
              ├─ navigation-movement-system.js
              ├─ objective-system.js
              ├─ projectile-system.js
              └─ wave-system.js
```

`src/content-schema.js` is not a second content database. It describes the stable shape, defaults, identities, and references of content held in `src/config.js` and later focused content modules.

`src/navigation/` is a browser-independent policy layer. It owns reusable navigation data and route computation, but it does not own units, orders, fixed-step sequencing, collision resolution, or runtime map synchronization. Those authoritative mutations remain in `src/systems/` and `Game`.

### Headless composition

```text
src/app/simulation-harness.js
  ├─ constructs Game through an injectable factory
  ├─ derives and resets the mission seed
  ├─ supplies numeric viewport values without DOM/canvas objects
  ├─ dispatches structured commands to public Game methods
  ├─ advances exact fixed ticks through Game.update
  └─ emits reference-free snapshots
```

The harness is a deterministic driver, not a second implementation of combat, economy, objectives, waves, production, commands, navigation, or simulation phases.

### Verification composition

```text
bash verify.sh
  └─ scripts/run-verification.mjs
      └─ scripts/lib/verification-runner.mjs
          ├─ shell and JavaScript syntax checks
          ├─ tests/**/*.test.mjs
          │   ├─ tests/unit/
          │   ├─ tests/sim/
          │   └─ tests/tooling/
          ├─ task-queue validation
          ├─ content/schema/technology validation
          ├─ seeded-random verification
          └─ architecture verification
```

The ordered stage list has one owner: `scripts/lib/verification-runner.mjs`. CI and local development must invoke `bash verify.sh` rather than duplicate that list.

## Dependency direction

Dependencies point inward toward declarative data, pure contracts, and focused policies:

```text
main → app/input/ui/render/game
runtime → injected Game/UI/Renderer interfaces + core fixed-step clock
simulation harness → Game/core only
ui/render → config + read-only game state + public game commands
Game → config/schema/core/systems
systems → config/schema/core/navigation/sibling systems
navigation → core/sibling navigation modules
config → schema/core only when needed
schema → core only when needed
core → sibling core modules only
production → never tests
```

The architecture verifier enforces the declared production layers: `core`, `schema`, `config`, `navigation`, `systems`, `game`, `app`, `input`, `ui`, `render`, `audio`, and `main`. Navigation modules may import only `core` and sibling `navigation` modules. Systems may consume navigation policies, but navigation must not import systems, `Game`, app, input, UI, renderer, audio, or main. A new top-level source directory is an architecture change: add its ownership and allowed imports to the verifier, add accepted/rejected tooling fixtures, and update this document.

### Browser ownership

Direct DOM access is restricted to browser-owned modules such as composition, runtime, input, UI, rendering, and dedicated audio adapters. Simulation, navigation, schema, config, core, and headless code must remain browser-independent.

Direct `Audio`, `AudioContext`, media-source construction, and decoding belong in `src/audio/`. Other layers request sound through domain events or a dedicated injected service; they do not construct browser audio objects.

## Authoritative owners

### `src/main.js`

Resolves DOM elements, constructs top-level objects, installs adapters, and starts the runtime. It must remain readable as wiring and must not contain gameplay rules or complex input handling.

### `src/app/runtime.js`

Owns mission startup and animation-frame scheduling. It derives the mission seed, resets the random service and fixed-step clock, and converts variable render-frame elapsed time into zero or more fixed simulation ticks followed by one render and UI refresh.

### `src/app/simulation-harness.js`

Owns deterministic Node-side scenario driving. It calls public `Game` methods and the same fixed-step update boundary used by the browser runtime. It never creates DOM, renderer, UI, input, or wall-clock dependencies.

### `src/input/`

Translates browser gestures and configurable key bindings into public commands and camera state. Listener disposal, key release, blur cleanup, selection gestures, and cursor modes belong here—not in `main.js` or simulation phases.

### `src/game.js`

Owns authoritative state and provides the public gameplay facade. Existing callers may use small public methods, but independently testable policies should be delegated to focused systems. `Game.update(stepSeconds)` is the only public simulation-tick boundary.

### `src/systems/simulation-phases.js`

Owns the fixed-step order:

```text
clock → camera → units → projectiles → production → waves
      → destroyed-entity cleanup → objectives → outcome
```

A phase may call a focused owner, but runtime, UI, renderer, input, and tests must not create alternate phase orders.

### `src/navigation/`

Owns deterministic browser-independent navigation policies. `navigation-grid.js` owns passability, terrain costs, movement layers, footprints, and blockers. `pathfinder.js` owns bounded deterministic A*. `waypoint-route.js` translates between cell paths and world-space route objects. `path-service.js` owns bounded route-template caching, revision invalidation, fixed-tick repath cadence, and deterministic counters.

Navigation accepts explicit grids, points, options, revisions, request IDs, and tick values. It never reads `Game`, units, buildings, missions, DOM, canvas, audio, or renderer state. It returns policy results and route objects; `src/systems/navigation-movement-system.js` remains responsible for deriving runtime grids, assigning unit routes, pausing throttled orders, advancing movement, and invoking collision resolution.

### `src/core/random.js`

Owns the process-global seeded simulation stream, seed normalization/derivation, deterministic draws, and snapshot/restore. Authoritative state changes must not use `Math.random`. Draw order is replay-relevant behavior.

### `src/core/fixed-step-clock.js`

Owns the default 30 Hz step, frame accumulator, maximum accepted frame delta, tick index, reset behavior, and interpolation fraction. It schedules callbacks but never imports or mutates game state.

### `src/core/events.js`

Owns the stable domain-event taxonomy and deterministic stream semantics: type, tick, monotonic sequence, source, immutable payload snapshot, subscriptions, peek, and drain.

Simulation producers emit only after the authoritative mutation succeeds. UI, audio, telemetry, and replay code may consume events, but gameplay outcomes must not depend on a presentation consumer being attached. Event payloads contain stable IDs and values—not DOM nodes, renderer objects, or mutable entity references. See `docs/DOMAIN_EVENTS.md`.

### `src/config.js`

Owns declarative content and balance instances: factions, units, buildings, missions, abilities, upgrades, costs, and statistics. A content addition should remain data-only until it requires a genuinely new rule.

### `src/content-schema.js`

Owns schema version, content families, identity source, required fields, explicit defaults, references, and default materialization. `docs/CONTENT_SCHEMA.md` is the human-readable contract.

New required fields, identity changes, renames, type changes, and semantic changes require a schema-version decision. Cross-record validation remains in focused scripts rather than the schema registry itself.

### Rendering and UI

`render.js` and visual-pass modules translate state into pixels. `ui.js` translates state into information and invokes public commands. Neither layer owns combat outcomes, resources, objectives, path decisions, or production completion.

## State, command, and event flow

```text
browser input
  → named action / public Game command
  → authoritative state mutation during command handling or fixed phase
  → optional domain event after successful mutation
  → read-only consumers (UI/audio/telemetry/replay)

animation frame
  → fixed-step accumulator
  → zero or more Game.update(fixedStep) calls
  → one renderer draw
  → one UI refresh
```

Events are observation and integration records. They do not replace authoritative state, command validation, or fixed-step ordering.

## Browser update lifecycle

1. `runtime.startMission` derives and resets the mission seed.
2. `Game.start` initializes authoritative mission state.
3. The fixed-step accumulator is reset.
4. Input adapters update held actions or invoke public commands.
5. Each animation frame contributes a capped elapsed duration.
6. The clock invokes `Game.update(FIXED_SIMULATION_STEP_SECONDS)` once per complete tick.
7. `Game.update` runs the documented phase order.
8. Seeded random draws and domain-event sequence order follow authoritative execution order.
9. The renderer draws the latest completed state once.
10. The UI refreshes from that same state.

Changing tick duration, phase order, random draw order, event ordering, command validation, navigation request order, or repath cadence is deterministic-behavior work and requires corresponding tests and documentation.

## Test layers

### `tests/unit/`

Fast deterministic tests for pure functions, focused systems, and public state transitions. They use `node:test` and `node:assert`, construct explicit fixtures, and avoid DOM/canvas/network/wall-clock dependencies.

### `tests/sim/`

Whole-scenario tests driven through `src/app/simulation-harness.js`. They issue structured commands, advance exact ticks, and compare reference-free snapshots. Cross-system sequencing and frame-chunking equivalence belong here.

### `tests/tooling/`

Temporary-project fixtures for executable development contracts such as architecture and verification. They may create isolated filesystem trees but must not mutate the repository checkout or weaken a rule merely to make current production code pass.

### Specialized verifiers

Queue, schema, content, technology, seeded-random, and architecture scripts check repository-wide contracts. They complement behavior tests and are all invoked by `bash verify.sh`.

## Verification contract

Run from `ukrainian-front-rts/`:

```bash
bash verify.sh
```

The command is fail-fast and preserves the first non-zero stage status. It runs shell syntax, stable recursive JavaScript syntax checks, all unit/simulation/tooling tests, queue fixtures and queue validation, schema/content/technology validation, seeded-random checks, and architecture checks. See `docs/VERIFICATION.md`.

Browser playtesting remains required for affected player-visible flows; the Node verifier does not simulate canvas rendering, browser event delivery, autoplay policy, accessibility, or visual readability.

## Extension rules

Use `docs/CHANGE_GUIDE.md` for task-oriented routing. The non-negotiable rules are:

- identify one authoritative owner before editing;
- keep data, simulation, input, presentation, and verification concerns separate;
- preserve the public command and fixed-step boundaries;
- add same-seed deterministic coverage for replay-relevant behavior;
- update schema code and human-readable schema docs together;
- add new domain-event types to the central taxonomy rather than using ad-hoc strings;
- register every new production layer in the architecture verifier;
- keep navigation policy browser-independent and runtime mutation in systems;
- extend the unified verification stage list in one place only;
- run focused tests first and `bash verify.sh` before completion.

## Gate A closure

Gate A is closed when the following remain true on `main`:

- versioned content contracts and content validation are executable;
- seeded randomness and the headless harness reproduce deterministic scenarios;
- the browser runtime uses fixed-step simulation phases;
- the domain-event contract is dependency-free and one-directional;
- architecture boundaries and browser ownership are executable checks;
- navigation policies are declared, browser-independent, and consumed only through systems;
- one verification command owns syntax, tests, and repository contracts;
- this architecture document and `docs/CHANGE_GUIDE.md` match those owners.
