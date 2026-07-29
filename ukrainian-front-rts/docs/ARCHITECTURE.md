# Fields of Resolve architecture

## Goals

The architecture is optimized for incremental game development: balance edits, bug fixes, new mechanics, and visual passes should touch the smallest responsible module. The project intentionally remains dependency-free and browser-native.

## Runtime composition

```text
index.html
  └─ src/main.js                 composition root
      ├─ src/app/runtime.js      mission start + animation-frame lifecycle
      ├─ src/input/              browser input adapters
      ├─ src/ui.js               HUD and command presentation
      ├─ src/render.js           base renderer
      ├─ src/art-pass.js         additive unit/portrait art override
      └─ src/game.js             authoritative simulation facade
          ├─ src/config.js       content and balance instances
          ├─ src/content-schema.js
          │                     versioned content contracts and defaults
          ├─ src/core/           pure reusable helpers
          │   └─ random.js       seeded simulation random stream
          └─ src/systems/        focused simulation policies
```

`content-schema.js` is not a second content database. It describes the stable shape of content held in
`config.js` and future map/AI content modules. Runtime migration to schema-backed loaders is owned by
later queue tasks.

## Dependency direction

Dependencies point inward toward data and pure logic:

```text
main → app/input/ui/render/game
app/input → public Game/UI/Renderer interfaces supplied at construction
ui/render → game state + config
Game → config/core/systems
config/content-schema → no browser, UI, renderer, or Game modules
systems → config/core only
core → sibling core modules only; never browser, UI, renderer, Game, or systems
```

A lower layer must not import a higher layer. In particular, simulation systems do not import DOM modules, and renderer code does not own combat or objective rules.

## Module ownership

### `src/main.js`

The composition root. It resolves required DOM elements, constructs the game/UI/renderer, installs adapters, and starts the runtime. Keep it readable enough to understand startup at a glance.

### `src/app/runtime.js`

Owns mission startup and the animation-frame loop. Scheduling is injectable so lifecycle behavior can be tested without a real browser loop. Mission startup derives a mission-specific seed from the configured simulation seed, resets the authoritative random stream, and records the active numeric seed on `game.simulationSeed` before `Game.start` runs.

### `src/input/battlefield-input.js`

Translates browser events into game commands and camera state. It owns selection gestures, orders, attack-move arming, zoom, keyboard state, minimap navigation, blur cleanup, and listener disposal.

### `src/game.js`

The authoritative state container and gameplay facade. It owns entities, resources, production, unit behavior, commands, and update sequencing. Large independent policies are delegated to `src/systems/` through compatibility methods.

Simulation code must request random ranges through `src/core/math.js` or use the seeded service directly. It must not call `Math.random`. Existing hero placement, production exits, and initial weapon cooldowns therefore consume the same mission stream as system-level random decisions.

### `src/systems/`

Focused policies that operate on explicit game state:

- `objective-system.js` — mission completion conditions;
- `projectile-system.js` — projectile travel, seeded impact damage rolls, and cleanup;
- `wave-system.js` — enemy composition, seeded deployment jitter, and spawn orders.

New systems should expose functions that accept state explicitly. Avoid hidden globals and circular imports. Random draws are the exception only in that they consume the explicitly reset mission stream owned by `src/core/random.js`; systems must never create private unseeded streams.

### `src/core/`

Pure helpers with no browser or game-object dependencies. These modules are the easiest to unit test and safest to reuse. Core modules may import sibling core modules but no higher project layer.

`random.js` owns the single authoritative simulation random stream for the current mission. It provides stable string/number seed normalization, mission-stream derivation, range/integer/pick operations, and snapshot/restore. `math.js` keeps the compatibility `randomBetween` helper but delegates every draw to that service.

Presentation-only deterministic patterns may continue to derive values from coordinates or entity state. Any random value that changes entities, resources, waves, combat, objectives, AI, or replay-relevant effects belongs to the simulation stream.

### `src/config.js`

The content database: factions, units, buildings, missions, abilities, upgrades, costs, and statistics. Content additions should remain declarative until they require a genuinely new rule.

### `src/content-schema.js`

The executable schema registry for factions, units, buildings, abilities, upgrades, missions, maps, and
AI profiles. It owns schema version, identity source, required fields, explicit defaults, reference
metadata, and default materialization. It must remain dependency-free and must not import runtime,
renderer, UI, or simulation modules.

`docs/CONTENT_SCHEMA.md` is the human-readable contract. Adding a required field, changing identity,
renaming a field, or changing field meaning is a schema-version change rather than an ordinary balance
edit.

### Rendering and UI

`render.js` and `art-pass.js` translate state into pixels. `ui.js` translates state into HUD information and invokes public game commands. Neither layer should independently mutate combat outcomes, resources, or objectives.

## Update lifecycle

1. `runtime.startMission` derives and resets the mission seed before initialization.
2. Input adapters update key/mouse state or call a public game command.
3. `runtime.js` computes a capped delta time.
4. `Game.update` advances unit behavior, projectiles, production, waves, cleanup, and objectives in a stable order.
5. Simulation random draws are consumed in that same deterministic call order.
6. The renderer draws the resulting state.
7. The UI refreshes from the same state snapshot.

Changing update order or the order/number of random draws is a deterministic-behavior change. Document it and update deterministic fixtures because it can affect combat timing, wave geometry, later draws, replays, and presentation consistency.

## Extension patterns

### Add a unit

1. Check the unit contract in `docs/CONTENT_SCHEMA.md`.
2. Add the unit definition to `config.js`.
3. Add it to the appropriate production list and roster data.
4. Give it a renderer/art-pass implementation.
5. Validate it in `art-lab.html` and a mission.
6. Add a system only when the unit introduces a rule that existing archetype flags cannot express.

### Add a mission

1. Check the mission contract in `docs/CONTENT_SCHEMA.md`.
2. Add declarative mission data in `config.js`.
3. Register an objective updater in `objective-system.js`.
4. Add a wave policy only when composition differs from existing mission rules.
5. Keep mission-specific UI copy in mission data rather than branching in the UI.
6. Verify restarting the mission with the same seed reproduces initialization and early random outcomes.

### Add or change a content field

1. Identify the schema family and authoritative runtime owner.
2. Prefer an optional field with an explicit default for a compatible v1 addition.
3. Treat new required fields, identity changes, renames, type changes, and semantic changes as a schema-version change.
4. Update `src/content-schema.js` and `docs/CONTENT_SCHEMA.md` together.
5. Leave cross-record validation and migrations to their dedicated owners unless the assigned task includes them.

### Add a random simulation decision

1. Confirm the value changes authoritative or replay-relevant state.
2. Use `randomBetween` or the seeded service; never call `Math.random` in `game.js` or `src/systems/`.
3. Keep draw order stable and avoid consuming random values in renderer/UI code on behalf of simulation.
4. Add a same-seed fixture and a different-seed divergence assertion.
5. Include random state in any future checkpoint, save, replay, or rollback boundary.

### Add a mechanic

1. Identify one authoritative owner.
2. Implement the rule in a focused system when it is independently testable.
3. Keep a small `Game` method as the public/delegating interface if callers already use it.
4. Render feedback from state; do not duplicate the rule in the renderer.

## Verification

Run:

```bash
bash verify.sh
```

The verifier checks JavaScript syntax, task-queue integrity, the executable content-schema contract, seeded placement/wave/combat reproducibility, forbidden direct simulation randomness, and key dependency boundaries. It is intentionally dependency-free; it complements, rather than replaces, browser playtesting.
