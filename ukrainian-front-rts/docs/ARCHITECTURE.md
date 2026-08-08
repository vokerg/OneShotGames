# Fields of Resolve architecture

## Purpose

Fields of Resolve is a dependency-free browser RTS. The architecture keeps authoritative gameplay deterministic, content declarative, browser concerns at the edge, and verification executable through one command. Changes should touch the smallest responsible owner and preserve explicit dependency direction.

This document records the Gate A foundation established by UFR-003 through UFR-011. Later feature lanes may add focused modules, but they must preserve these contracts or update this document and the architecture verifier in the same pull request.

## Gate A invariants

1. `src/main.js` is composition only.
2. `Game`, `src/systems/`, and the focused simulation namespaces own authoritative simulation state and rules.
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
      ├─ src/ui/economy-hud-overview.js  economy presentation + public commands
      ├─ src/render.js                   base renderer
      ├─ src/art-pass.js                 additive visual override
      └─ src/game.js                     authoritative simulation facade
          ├─ src/config.js               content and balance instances
          ├─ src/content/                focused declarative content modules
          ├─ src/content-schema.js       versioned content contracts/defaults
          ├─ src/core/
          │   ├─ random.js               seeded simulation random stream
          │   ├─ fixed-step-clock.js     fixed-tick accumulator
          │   └─ events.js               domain-event taxonomy and stream
          ├─ src/navigation/             grid, path, cache, formation/recovery policies
          ├─ src/ai/                     deterministic AI planning contracts
          ├─ src/combat/                 focused combat policies and systems
          ├─ src/status/                 authoritative unit-status policies
          ├─ src/visibility/             authoritative visibility policies
          ├─ src/skirmish/               skirmish catalog, mode policy, runtime integration
          └─ src/systems/
              ├─ simulation-phases.js    authoritative phase order
              ├─ navigation-movement-system.js runtime navigation integration
              ├─ tactical-ai-system.js   observed knowledge + tactical command projection
              ├─ research-queue-system.js pure shared research contract
              ├─ research-queue-runtime.js live facility research commands/state
              ├─ objective-system.js
              ├─ projectile-system.js
              └─ wave-system.js
```

`src/content-schema.js` is not a second content database. It describes the stable shape, defaults, identities, and references of content held in `src/config.js` and focused declarative modules under `src/content/`.

`src/navigation/` is a pure policy layer. It owns deterministic passability, bounded search, waypoint translation, route-template caching, repath cadence, and local recovery contracts. Runtime state synchronization and physical unit movement remain in `src/systems/` and `Game`.

`src/ai/` is a planning boundary, not an alternate simulation. It owns deterministic doctrine, knowledge, goal, budget, cadence, inspection, and tactical-plan contracts. `src/systems/tactical-ai-system.js` adapts permitted observations and own-side snapshots into ordinary validated order shapes during the declared tactical-prepare phase.

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

The harness is a deterministic driver, not a second implementation of combat, economy, objectives, waves, production, commands, AI, or simulation phases.

### Verification composition

```text
bash verify.sh
  └─ scripts/run-verification.mjs
      └─ scripts/lib/verification-runner.mjs
          ├─ shell and JavaScript syntax checks
          ├─ tests/**/*.test.mjs
          │   ├─ tests/unit/
          │   ├─ tests/navigation/
          │   ├─ tests/ai/
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
main → app/input/ui/render/game/navigation/ai/systems
runtime → injected Game/UI/Renderer interfaces + core fixed-step clock
simulation harness → Game/core only
ui/render → config + shared contracts + read-only game state + public game commands
Game → config/schema/contracts/core/ai/systems
systems, combat, status, visibility, skirmish → config/schema/contracts/core/navigation/ai/sibling systems
navigation → core/sibling navigation modules only
ai → config/schema/contracts/core/sibling ai modules
config (including src/content/) → schema/core/shared contracts only when needed
shared contracts → schema/core/sibling shared contracts only
schema → core only when needed
core → sibling core modules only
production → never tests
```

The architecture verifier enforces the declared production layers: `core`, `schema`, `contract`, `config`, `navigation`, `ai`, `systems`, `game`, `app`, `input`, `ui`, `render`, `audio`, and `main`. Focused modules under `src/content/` are classified as the declarative `config` layer. The top-level `src/combat/`, `src/status/`, `src/visibility/`, and `src/skirmish/` namespaces are classified as focused `systems` modules, except `src/skirmish/skirmish-catalog.js`, which is deliberately classified as declarative `config` so UI may consume immutable map/faction/default descriptors without importing simulation policy. `src/navigation/` remains a distinct inward-only policy layer.

A small set of dependency-free public contracts is classified as `contract` because it is consumed from more than one outward layer without transferring mutation ownership:

- `src/combat/air-defense-system.js`;
- `src/combat/combat-schema.js`;
- `src/systems/research-queue-system.js`;
- `src/ui/combat-readability.js`.

These modules may expose immutable schemas, normalization, deterministic policies, descriptors, and snapshots. Their consumers may not use them to create a second simulation path. All other modules retain their directory layer. A new top-level source directory or shared-contract exemption is an architecture change: add its ownership and allowed imports to the verifier, add accepted and rejected tooling fixtures, and update this document.

### Browser ownership

Direct DOM access is restricted to browser-owned modules such as composition, runtime, input, UI, rendering, and dedicated audio adapters. `src/art-lab.js` is a secondary browser composition entry point and is classified with `main`; it may own DOM access but not gameplay rules. Simulation, navigation, AI, schema, contracts, config, core, and headless code must remain browser-independent.

Direct `Audio`, `AudioContext`, media-source construction, and decoding belong in `src/audio/`. Other layers request sound through domain events or a dedicated injected service; they do not construct browser audio objects.

## Authoritative owners

### `src/main.js` and `src/art-lab.js`

`src/main.js` resolves DOM elements, constructs top-level objects, installs adapters, and starts the runtime. It must remain readable as wiring and must not contain gameplay rules or complex input handling.

`src/art-lab.js` is a secondary composition-only browser entry point for renderer and roster inspection. It may construct `Game` and `Renderer`, query its own document surface, and export screenshots, but it must consume the same authoritative game and render owners rather than duplicate them.

### `src/app/runtime.js`

Owns mission startup and animation-frame scheduling. It derives the mission seed, resets the random service and fixed-step clock, and converts variable render-frame elapsed time into zero or more fixed simulation ticks followed by one render and UI refresh.

### `src/app/simulation-harness.js`

Owns deterministic Node-side scenario driving. It calls public `Game` methods and the same fixed-step update boundary used by the browser runtime. It never creates DOM, renderer, UI, input, or wall-clock dependencies.

### `src/input/`

Translates browser gestures and configurable key bindings into public commands and camera state. Listener disposal, key release, blur cleanup, selection gestures, and cursor modes belong here—not in `main.js` or simulation phases.

### `src/game.js`

Owns authoritative state and provides the public gameplay facade. Existing callers may use small public methods, but independently testable policies should be delegated to focused systems. `Game.update(stepSeconds)` is the only public simulation-tick boundary.

### `src/navigation/`

Owns deterministic, browser-independent navigation policy:

- grid coordinates, terrain costs, movement layers, footprints, and blocker queries;
- bounded deterministic A* and waypoint-route translation;
- revision-keyed immutable route-template caching;
- fixed-tick repath throttling and deterministic path-search counters;
- pure stuck-progress tracking and bounded local-detour selection.

Navigation modules may import core and sibling navigation modules only. They must not import `Game`, simulation systems, AI, shared contracts, config, input, UI, rendering, app/runtime, audio, DOM, or browser APIs. `src/systems/navigation-movement-system.js` adapts these policies to live terrain, buildings, orders, formations, unit statistics, collision, and the authoritative units phase. See `docs/NAVIGATION.md`.

### `src/ai/`

Owns deterministic, browser-independent AI planning contracts. UFR-079 establishes:

- immutable doctrine profiles with observed-only information policy;
- blackboard state for scouting knowledge, ordered goals, exact budgets, cadence, and bounded history;
- explicit contact observations and deterministic stale/forget aging;
- fixed-tick decision scheduling that is independent of render-frame chunking;
- deeply frozen, reference-free inspection snapshots.

UFR-081 adds pure tactical posture and bounded command-plan selection for scouting, defense, assembly, attack, retreat, reinforcement, and flanking. AI modules may import core, schema, shared contracts, declarative config/content, and sibling AI modules. They must not import `Game`, simulation systems, navigation policy, input, UI, rendering, app/runtime, or audio.

`src/systems/tactical-ai-system.js` owns the live adapter: bounded line-of-sight observations, own-side snapshots, blackboard lifecycle, entity validation, and projection into existing `move`, `attackMove`, and `attack` order contracts. It runs as an ordered `TACTICAL_PREPARE` simulation delegate before tactical-command projection and unit movement; it never wraps `game.update`. Navigation, combat, resource charging, and outcome owners remain authoritative. See `docs/AI_ARCHITECTURE.md` and `docs/TACTICAL_AI.md`.

### Focused simulation namespaces

`src/combat/`, `src/status/`, `src/visibility/`, and `src/skirmish/` are focused simulation namespaces. They are part of the executable `systems` layer even though their directory names are domain-specific. They may import core, schema, shared contracts, declarative config/content, navigation policy, AI planning contracts, and sibling simulation modules. They must not import browser app/runtime, input, UI, rendering, audio, or composition modules.

The skirmish namespace has one deliberate declarative exception: `src/skirmish/skirmish-catalog.js` is immutable config-layer data containing authored maps, faction-facing roster/cost descriptors, difficulty IDs, and defaults. `src/skirmish/skirmish-config.js` validates that catalog against authoritative AI difficulty contracts and projects normalized mission setup, while `src/skirmish/skirmish-runtime.js` owns live mode initialization, fair AI economy/tactical cadence composition, side-vs-faction separation, and public skirmish commands through declared simulation delegates. UI reads only the catalog plus public Game commands; it does not import skirmish runtime policy.

The exact shared-contract modules listed in the dependency section are deliberately narrower. A content or presentation module may import those public contracts, but it may not import an arbitrary combat, status, visibility, skirmish, navigation, or systems runtime module.

### `src/systems/simulation-phases.js`

Owns the fixed-step order, including the explicit delegate points:

```text
clock → camera → step-begin delegates → tactical-prepare delegates
      → stance-prepare delegates → units → projectiles → production
      → research → waves → destroyed-entity cleanup → objectives → outcome
      → building-lifecycle delegates → stance-reconcile delegates
      → tactical-reconcile delegates → command-capacity delegates → step-end delegates
```

A phase may call a focused owner, but runtime, UI, renderer, input, AI modules, and tests must not create alternate phase orders. Tactical AI planning is owned by the `TACTICAL_PREPARE` delegate and must complete before the units phase consumes projected orders.

### `src/systems/research-queue-system.js` and `research-queue-runtime.js`

`research-queue-system.js` owns the immutable UFR-061 queue, contention, progress, cancellation, refund, and completion contracts. It is a shared `contract` module because UI and simulation runtime both consume its immutable descriptors and transition functions. `research-queue-runtime.js` adapts those contracts to live Ukrainian workshop facilities, public research commands, player resources, completed upgrades, facility loss, and existing-unit stat reconciliation. It exposes a narrow `updateResearch(stepSeconds)` delegate, and authoritative progress occurs only in the `research` simulation phase immediately after production. UI reads queue descriptors and invokes public commands; it never edits research state directly.

### `src/core/random.js`

Owns the process-global seeded simulation stream, seed normalization/derivation, deterministic draws, and snapshot/restore. Authoritative state changes must not use `Math.random`. Draw order is replay-relevant behavior.

### `src/core/fixed-step-clock.js`

Owns the default 30 Hz step, frame accumulator, maximum accepted frame delta, tick index, reset behavior, and interpolation fraction. It schedules callbacks but never imports or mutates game state.

### `src/core/events.js`

Owns the stable domain-event taxonomy and deterministic stream semantics: type, tick, monotonic sequence, source, immutable payload snapshot, subscriptions, peek, and drain.

Simulation producers emit only after the authoritative mutation succeeds. UI, audio, telemetry, replay, and AI observation adapters may consume events, but gameplay outcomes must not depend on a presentation consumer being attached. Event payloads contain stable IDs and values—not DOM nodes, renderer objects, or mutable entity references. See `docs/DOMAIN_EVENTS.md`.

### `src/config.js` and `src/content/`

Own declarative content and balance instances: factions, units, buildings, missions, abilities, upgrades, costs, statistics, and focused content contracts assigned by queue tasks. A content addition should remain data-only until it requires a genuinely new rule. Content may import only the exact shared-contract modules admitted by the executable architecture registry; importing a simulation or navigation runtime remains forbidden.

### `src/content-schema.js`

Owns schema version, content families, identity source, required fields, explicit defaults, references, and default materialization. `docs/CONTENT_SCHEMA.md` is the human-readable contract.

New required fields, identity changes, renames, type changes, and semantic changes require a schema-version decision. Cross-record validation remains in focused scripts rather than the schema registry itself. The `tech-nodes` reference target is a polymorphic identity namespace spanning building and upgrade technology nodes; it is a valid reference target without being a standalone content collection family.

### Rendering and UI

`render.js` and visual-pass modules translate state into pixels. `ui.js` and focused UI modules translate state into information and invoke public commands. Neither layer owns combat outcomes, resources, objectives, path decisions, production completion, research completion, or AI planning decisions. Shared read-only contracts such as combat-readability snapshots and research-queue descriptors may cross into these layers without transferring mutation ownership.

## State, command, and event flow

```text
browser input
  → named action / public Game command
  → authoritative state mutation during command handling or fixed phase
  → optional domain event after successful mutation
  → read-only consumers (UI/audio/telemetry/replay/AI observation adapter)

permitted AI observations + own-side state
  → AI blackboard
  → fixed-cadence tactical planner proposal
  → tactical-prepare system validation and existing order projection
  → navigation/combat owners consume the projected orders
  → authoritative mutation and normal domain event flow

animation frame
  → fixed-step accumulator
  → zero or more Game.update(fixedStep) calls
  → one renderer draw
  → one UI refresh
```

Events are observation and integration records. They do not replace authoritative state, command validation, fixed-step ordering, or fog-of-war restrictions. AI must produce the same plan from the same permitted observations, doctrine, seed, and tick sequence regardless of render-frame chunking.

## Browser update lifecycle

1. `runtime.startMission` derives and resets the mission seed.
2. `Game.start` initializes authoritative mission state.
3. Installed system adapters initialize facility-scoped research, tactical AI, and other feature state.
4. The fixed-step accumulator is reset.
5. Input adapters update held actions or invoke public commands.
6. Each animation frame contributes a capped elapsed duration.
7. The clock invokes `Game.update(FIXED_SIMULATION_STEP_SECONDS)` once per complete tick.
8. `Game.update` runs the documented phase order, including tactical-AI planning before unit movement and production before research contention/progress.
9. The tactical AI evaluates only due fixed-tick cadence points and projects bounded ordinary orders from observed-only knowledge.
10. Seeded random draws and domain-event sequence order follow authoritative execution order.
11. The renderer draws the latest completed state once.
12. The UI refreshes from that same state.

Changing tick duration, phase order, random draw order, event ordering, AI decision cadence, navigation revision/cadence behavior, or command validation is deterministic-behavior work and requires corresponding tests and documentation.

## Test layers

### `tests/unit/`

Fast deterministic tests for pure functions, focused systems, and public state transitions. They use `node:test` and `node:assert`, construct explicit fixtures, and avoid DOM/canvas/network/wall-clock dependencies.

### `tests/navigation/`

Focused deterministic tests for grid, pathfinding, waypoint, cache, formation, collision, terrain, transport, and movement-recovery contracts. Integration fixtures must exercise current runtime adapters when structure revision, fixed-tick repath cadence, or cross-navigation ownership changes.

### `tests/ai/`

Deterministic tests for doctrine, knowledge, goals, budgets, cadence, inspection, tactical posture, command planning, runtime observation, and command projection. They use explicit observations, stable IDs, exact ticks, and reference-free snapshots. Frame-chunking equivalence and repeated-input equality belong here whenever planner cadence changes. Runtime integration fixtures must verify that projected ground orders flow through authoritative navigation rather than bypassing it.

### `tests/sim/`

Whole-scenario tests driven through `src/app/simulation-harness.js`. They issue structured commands, advance exact ticks, and compare reference-free snapshots. Cross-system sequencing and frame-chunking equivalence belong here.

### `tests/tooling/`

Temporary-project fixtures for executable development contracts such as architecture and unified verification. They may create isolated filesystem trees but must not mutate the repository checkout or weaken a rule merely to make current production code pass.

### Specialized verifiers

Queue, schema, content, technology, seeded-random, and architecture scripts check repository-wide contracts. They complement behavior tests and are all invoked by `bash verify.sh`.

## Verification contract

Run from `ukrainian-front-rts/`:

```bash
bash verify.sh
```

The command is fail-fast and preserves the first non-zero stage status. It runs shell syntax, stable recursive JavaScript syntax checks, all unit/simulation/tooling tests, queue fixtures and queue validation, schema/content/technology validation, seeded-random checks, and architecture checks. See `docs/VERIFICATION.md`.

The authoritative GitHub workflow invokes the same command with `pipefail`, preserves its combined output as `artifacts/assembled-verifier.log`, runs active-claim diagnostics, starts a real mission in headless Chromium, writes browser failure diagnostics, generates the completion-evidence audit, and uploads all diagnostics on every result.

Browser playtesting remains required for affected player-visible flows; the Node verifier does not simulate every canvas interaction, browser event delivery, autoplay policy, accessibility, or visual-readability judgment. The automated startup smoke verifies that the application loads, mission selection becomes interactive, the first mission starts, the game canvas is valid, and no fatal runtime or application-resource failure occurs.

## Extension rules

Use `docs/CHANGE_GUIDE.md` for task-oriented routing. The non-negotiable rules are:

- identify one authoritative owner before editing;
- keep data, simulation, navigation policy, AI planning, input, presentation, and verification concerns separate;
- preserve the public command and fixed-step boundaries;
- keep AI information observed-only unless an authored mission explicitly grants stable intelligence;
- add same-seed deterministic coverage for replay-relevant behavior;
- update schema code and human-readable schema docs together;
- add new domain-event types to the central taxonomy rather than using ad-hoc strings;
- register every new production layer and shared-contract exemption in the architecture verifier;
- extend the unified verification stage list in one place only;
- run focused tests first and `bash verify.sh` before completion.

## Gate A closure

Gate A is closed when the following remain true on `main`:

- versioned content contracts and content validation are executable;
- seeded randomness and the headless harness reproduce deterministic scenarios;
- the browser runtime uses fixed-step simulation phases;
- navigation policy remains deterministic, bounded, and isolated from runtime/browser ownership;
- the domain-event contract is dependency-free and one-directional;
- architecture boundaries and browser ownership are executable checks;
- one verification command owns syntax, tests, and repository contracts;
- this architecture document and `docs/CHANGE_GUIDE.md` match those owners and new focused layers.
