# Fields of Resolve architecture

## Goals

Fields of Resolve is a dependency-free browser RTS. The architecture favors deterministic simulation, explicit ownership, browser-independent policy modules, and small compatibility-preserving changes. A balance edit, bug fix, mechanic, input feature, or visual pass should touch the smallest authoritative owner rather than spreading corrective logic across UI, rendering, and simulation.

## Runtime composition

```text
index.html
  └─ src/main.js                         composition root
      ├─ src/app/runtime.js              mission startup + animation-frame lifecycle
      │   └─ src/core/fixed-step-clock.js
      ├─ src/input/battlefield-input.js  browser events → public game commands/state
      ├─ src/ui.js                       HUD/command presentation
      ├─ src/render.js                   base renderer
      ├─ src/art-pass.js                 additive unit/portrait art
      ├─ src/environment-art-pass.js     additive terrain/environment art
      └─ src/game.js                     authoritative simulation facade
          ├─ src/config.js               content and balance instances
          ├─ src/content-schema.js       executable content contracts/defaults
          ├─ src/core/                   pure helpers and cross-cutting contracts
          │   ├─ fixed-step-clock.js
          │   ├─ random.js
          │   └─ events.js
          ├─ src/navigation/             passability, path search, waypoint contracts
          ├─ src/combat/                 pure combat schema/policy contracts
          └─ src/systems/                explicit-state simulation policies
              ├─ simulation-phases.js
              ├─ navigation-movement-system.js
              ├─ unit-collision-system.js
              ├─ objective-system.js
              ├─ projectile-system.js
              └─ wave-system.js
```

`src/main.js` constructs and connects objects. It does not own gameplay rules. `Game` and focused systems own authoritative mutation; input and UI invoke public commands; renderers read state.

## Headless composition

```text
src/app/simulation-harness.js
  ├─ constructs Game through an injectable factory
  ├─ derives/resets the mission random stream
  ├─ supplies temporary numeric viewport globals only around Game calls
  ├─ dispatches structured commands to public Game methods
  ├─ advances exact fixed ticks
  └─ emits reference-free snapshots
```

The harness is not an alternate simulation. It must not duplicate phase order, combat, movement, economy, objectives, production, or wave rules.

## Verification composition

```text
bash verify.sh                         only supported top-level command
  └─ scripts/run-verification.mjs
      └─ scripts/lib/verification-runner.mjs
          ├─ stable syntax discovery for src/scripts/tests
          ├─ complete Node test suite
          ├─ queue/content/technology fixtures and production validation
          ├─ seeded-random verification
          └─ scripts/verify-architecture.mjs
              └─ scripts/lib/architecture-verifier.mjs
```

The verification runner is fail-fast and preserves the first failing stage's non-zero status. CI should run `bash verify.sh`; it must not maintain a second copy of the stage list.

## Dependency direction

Dependencies point inward toward contracts, data, and pure logic:

```text
main → app/input/ui/render/game
runtime → public Game/UI/Renderer interfaces + core fixed-step clock
simulation harness → Game/core; never DOM, renderer, UI, or input
ui/render → game state + config
Game → config/core/navigation/combat/systems
systems → config/core/navigation/combat/sibling systems where explicitly required
navigation → navigation + core-compatible data only
combat → combat + core-compatible data only
config/content-schema → no browser, UI, renderer, or Game modules
core → sibling core modules only
production → never tests or scripts
tests/scripts → public production modules and project files
```

A lower layer must not import a higher layer. Simulation systems do not import `Game`, UI, or renderer classes. Navigation and combat policy modules do not access DOM APIs. Renderer and UI code do not become authoritative merely because they display a result.

### Executable architecture policy

`scripts/lib/architecture-verifier.mjs` is the machine-enforced boundary contract. It currently declares the original Gate A layers (`core`, `schema`, `config`, `systems`, `game`, `app`, `input`, `ui`, `render`, `audio`, and `main`), checks required composition imports, rejects production imports outside `src/`, restricts DOM ownership, restricts direct audio construction to `src/audio/`, and enforces single content-schema ownership.

Current `main` also contains dedicated `src/navigation/` and `src/combat/` policy directories introduced after that original layer table. Their intended inward-only ownership is documented here and in their focused contracts. A future architecture-policy change must add those directories explicitly rather than treating unclassified modules as an informal exception. Documentation must not silently redefine the executable verifier.

## Module ownership

### `src/main.js`

Composition only: resolve required DOM elements, construct `Game`, UI, renderer, runtime, and input adapters, wire callbacks, and start the application. Startup should remain understandable at a glance.

### `src/app/runtime.js`

Owns mission startup and animation-frame scheduling. It derives and resets the mission seed, starts `Game`, resets the fixed-step accumulator, advances zero or more fixed ticks per frame, then renders and refreshes UI once. Display frame rate never changes simulation tick duration or phase order.

### `src/app/simulation-harness.js`

Owns deterministic Node-side scenario driving. It invokes public `Game` methods, advances configured ticks, and produces reference-free snapshots. It may supply temporary numeric `innerWidth`/`innerHeight` values because current camera initialization reads them, but it does not create browser objects.

### `src/input/battlefield-input.js`

Owns browser listener registration/disposal, selection gestures, commands, attack-move arming, zoom, keyboard state, minimap navigation, and blur cleanup. It translates browser events; it does not implement simulation outcomes.

### `src/game.js`

Authoritative state container and public gameplay facade. `Game.update(stepSeconds)` is the public tick boundary and delegates sequencing to `src/systems/simulation-phases.js`. Existing public delegates such as `updateProjectiles`, `spawnWave`, and `updateObjectives` remain compatibility boundaries until an assigned task deliberately migrates them.

Simulation randomness must use `src/core/random.js` directly or the compatibility helper in `src/core/math.js`. Authoritative code must not call `Math.random`.

### `src/systems/`

Focused policies operate on explicit game state and do not import the `Game` class:

- `simulation-phases.js` — authoritative order: clock, camera, units, projectiles, production, waves, cleanup, objectives, outcome;
- `navigation-movement-system.js` — runtime navigation-grid synchronization, route requests, waypoint sequencing, and post-movement collision invocation;
- `unit-collision-system.js` — deterministic footprint-aware unit separation only;
- `objective-system.js` — mission objective transitions;
- `projectile-system.js` — projectile travel/impact lifecycle owned by the currently merged runtime contract;
- `wave-system.js` — enemy composition, seeded deployment jitter, and spawn orders.

Adding, removing, or reordering a phase is an integration change. Update `SIMULATION_PHASES`, phase-order tests, deterministic scenario fixtures, and this document together.

### `src/navigation/`

Browser-independent navigation contracts:

- `navigation-grid.js` — movement layers, terrain costs, map-data ingestion, footprints, dynamic blockers, snapshots, and world/cell conversion;
- `pathfinder.js` — deterministic bounded A* with explicit diagonal policy and stable tie-breaking;
- `waypoint-route.js` — world-space request boundary and route/waypoint state.

Runtime systems may query these contracts; navigation modules do not import `Game`, UI, renderer, input, or browser services. See `docs/NAVIGATION.md`.

### `src/combat/`

Pure combat contracts introduced after Gate A. `combat-schema.js` owns damage, armor, target-domain, penetration, splash, and resistance vocabulary. Runtime projectile/targeting systems consume those contracts as their queue tasks merge. See `docs/COMBAT_SCHEMA.md`.

### `src/core/`

Pure reusable helpers with no browser or game-object dependencies.

- `fixed-step-clock.js` owns the frame accumulator, 30 Hz default tick, accepted frame cap, tick index, reset behavior, and interpolation fraction.
- `random.js` owns the single authoritative mission random stream, seed normalization/derivation, draws, and snapshot/restore.
- `events.js` owns the dependency-free domain-event type registry, ordered buffer, tick/sequence metadata, subscriptions, and drain/peek lifecycle.

`events.js` defines a contract; it does not make presentation consumers authoritative. Producers emit only after state mutation. Consumers observe immutable identifier/value payloads and must not feed presentation state back into simulation rules. See `docs/DOMAIN_EVENTS.md`.

### `src/config.js` and `src/content-schema.js`

`config.js` is the current content/balance instance database. `content-schema.js` is the executable schema registry: schema version, families, identity source, required fields, explicit defaults, reference metadata, and default materialization. It is not a second content database.

Required-field additions, identity changes, renames, type changes, and semantic changes are schema-version changes. Update `src/content-schema.js` and `docs/CONTENT_SCHEMA.md` together.

### Rendering and UI

`render.js`, art passes, and focused renderer modules translate state into pixels. `ui.js` translates state into HUD information and invokes public commands. Neither may independently mutate combat outcomes, path results, resources, production, or objectives.

## Fixed-step lifecycle

### Browser runtime

1. `runtime.startMission` derives/resets the mission seed, starts `Game`, and resets the accumulator.
2. Input adapters update transient input state or invoke a public command.
3. Each animation frame contributes a capped elapsed duration to the fixed-step clock.
4. The clock calls `Game.update(FIXED_SIMULATION_STEP_SECONDS)` once per complete accumulated tick.
5. `Game.update` runs clock, camera, units, projectiles, production, waves, cleanup, objectives, then outcome.
6. Within the units phase, all units advance through navigation/waypoints before deterministic unit separation is applied.
7. Authoritative random draws occur in deterministic tick and phase order.
8. The renderer draws the latest completed state once per animation frame.
9. UI refreshes from the same completed state.

### Headless scenario

1. The harness derives/resets the mission seed.
2. It calls `Game.start` with a numeric viewport and no browser object graph.
3. The test issues structured commands through public methods.
4. `advanceTicks(count)` calls `Game.update(tickSeconds)` exactly `count` times.
5. Each call uses the same phase runner as the browser runtime.
6. The harness converts mutable state/references into a deterministic snapshot.
7. The test asserts the snapshot or uses `assertState`.

Changing tick duration, phase order, unit iteration order, event emission order, or random draw count is a deterministic-behavior change and requires fixture/documentation review.

## Domain-event flow

The event stream is an optional decoupling boundary, not a second simulation loop:

```text
authoritative system mutation
  → emit registered event type with tick/sequence/source/immutable payload
    → synchronous focused subscribers and/or buffered drain
      → UI/audio/telemetry/replay adapters observe
```

Rules:

1. Mutate authoritative state first, then emit.
2. Use `DOMAIN_EVENT_TYPES`; ad-hoc strings are rejected.
3. Payloads contain stable IDs/values, never DOM nodes, renderer objects, or mutable entities.
4. Consumer presence or failure must not change gameplay rules.
5. Preserve emission order when adding replay, telemetry, or presentation adapters.

## Test layers

The repository uses Node's built-in `node:test` and `node:assert`:

- `tests/unit/` — focused logic and public state-transition tests;
- `tests/core/` — core contracts such as event-stream behavior;
- `tests/sim/` — deterministic whole-scenario tests through the harness;
- `tests/navigation/` — grid, A*, waypoint, movement, and collision fixtures;
- `tests/combat/` — pure combat-schema/policy fixtures;
- `tests/tooling/` — architecture and verification-runner temporary-project fixtures.

Test files are independent `*.test.mjs` modules. Production never imports tests. Use explicit fixtures, avoid wall-clock waits, and reset process-global deterministic services when relevant.

## Extension recipes

### Add or change declarative content

1. Read `docs/CONTENT_SCHEMA.md`.
2. Change the smallest content instance owner.
3. Add optional fields with explicit defaults where compatible.
4. Treat required/identity/type/meaning changes as schema-version work.
5. Run focused validation and `bash verify.sh`.

### Add a simulation mechanic

1. Name one authoritative owner.
2. Prefer a focused system accepting explicit state.
3. Keep a small `Game` delegate when public callers already depend on it.
4. Place mutation in the existing phase unless a new phase is genuinely required.
5. Emit domain events only after mutation when consumers need decoupled feedback.
6. Add focused tests and a headless scenario when sequencing crosses systems.

### Add a navigation rule

1. Put passability/cost/search contracts in `src/navigation/`.
2. Put runtime state synchronization and entity mutation in `src/systems/`.
3. Do not duplicate passability in input, renderer, or UI.
4. Add deterministic corridor/blocker/group fixtures and performance evidence where search or large groups are affected.

### Add a domain event

1. Extend `DOMAIN_EVENT_TYPES`.
2. Define the producer's authoritative mutation point.
3. Use stable payload IDs/values and explicit source metadata.
4. Add ordering, immutability, subscription, and drain/peek coverage as applicable.
5. Keep presentation consumers read-only.

### Add a verification stage

1. Add the project-wide command to `VERIFICATION_COMMANDS` in `scripts/lib/verification-runner.mjs`.
2. Add temporary-project runner coverage in `tests/tooling/verification-runner.test.mjs`.
3. Preserve stable ordering, fail-fast behavior, and exact exit-status propagation.
4. Update `docs/VERIFICATION.md`.
5. Do not add another top-level shell command.

### Add an architecture layer or import direction

1. Define the owner, allowed inward dependencies, and browser/DOM policy.
2. Update `layerOf`, `ALLOWED_IMPORTS`, and any required-import contracts in the architecture verifier.
3. Add fixture tests for allowed and forbidden edges.
4. Update this document and `docs/CHANGE_GUIDE.md` in the same PR.

## Verification

Run from `ukrainian-front-rts/`:

```bash
bash verify.sh
```

The unified runner validates shell/JavaScript syntax, runs all Node tests, executes queue/content/technology/randomness contracts, and then checks architecture boundaries. It complements browser playtesting; it does not replace mission startup and interaction checks for runtime changes.
