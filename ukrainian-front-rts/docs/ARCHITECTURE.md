# Fields of Resolve architecture

## Goals

The architecture is optimized for incremental game development: balance edits, bug fixes, new mechanics, and visual passes should touch the smallest responsible module. The project intentionally remains dependency-free and browser-native.

## Runtime composition

```text
index.html
  └─ src/main.js                         composition root
      ├─ src/app/runtime.js              mission start + animation-frame lifecycle
      ├─ src/input/                      baseline browser input adapters
      ├─ src/production-rally-input.js   rally-point input adapter
      ├─ src/ui.js                       base HUD and command presentation
      ├─ src/production-ui.js            production queue and rally commands
      ├─ src/render.js                   base renderer
      ├─ src/production-render.js        production and rally overlays
      ├─ src/art-pass.js                 additive unit/portrait art override
      ├─ src/game.js                     authoritative base simulation facade
      └─ src/production-game.js          production/rally simulation extension
          ├─ src/config.js               content and balance data
          ├─ src/core/                   pure reusable helpers
          └─ src/systems/                focused simulation policies
```

## Dependency direction

Dependencies point inward toward data and pure logic:

```text
main → app/input/ui/render/game extensions
app/input → public Game/UI/Renderer interfaces supplied at construction
ui/render extensions → game state + config
ProductionGame → Game + config/core
Game → config/core/systems
systems → config/core only
core → no project modules
```

A lower layer must not import a higher layer. In particular, simulation systems do not import DOM modules, and renderer code does not own combat or objective rules.

## Module ownership

### `src/main.js`

The composition root. It resolves required DOM elements, installs explicit gameplay/presentation extensions, constructs the game/UI/renderer, installs adapters, and starts the runtime. Keep it readable enough to understand startup at a glance.

### `src/app/runtime.js`

Owns mission startup and the animation-frame loop. Scheduling is injectable so lifecycle behavior can be tested without a real browser loop.

### Input adapters

`src/input/battlefield-input.js` translates baseline browser events into game commands and camera state. It owns selection gestures, orders, attack-move arming, zoom, keyboard state, minimap navigation, blur cleanup, and listener disposal.

`src/production-rally-input.js` owns rally-point placement gestures, direct building right-click rally assignment, the `R` shortcut, cancellation, and listener disposal. It invokes public production-game commands and does not mutate queue or unit state directly.

### Simulation

`src/game.js` is the authoritative base state container and gameplay facade. It owns entities, resources, baseline production, unit behavior, commands, and update sequencing. Large independent policies are delegated to `src/systems/` through compatibility methods.

`src/production-game.js` extends the base game with production-building rally points, exterior spawn selection, automatic post-production move orders, and queue cancellation/refunds. This keeps the production UX mechanic authoritative in simulation while avoiding presentation logic in the game layer.

### `src/systems/`

Focused policies that operate on explicit game state:

- `objective-system.js` — mission completion conditions;
- `projectile-system.js` — projectile travel, impact, damage, and cleanup;
- `wave-system.js` — enemy composition and spawn orders.

New systems should expose functions that accept state explicitly. Avoid hidden globals and circular imports.

### `src/core/`

Pure helpers with no browser or game-object dependencies. These modules are the easiest to unit test and safest to reuse.

### `src/config.js`

The content database: factions, units, buildings, missions, abilities, upgrades, costs, and statistics. Content additions should remain declarative until they require a genuinely new rule.

### Rendering and UI

`render.js` and `art-pass.js` translate state into pixels. `production-render.js` adds read-only rally markers and production progress overlays.

`ui.js` translates state into baseline HUD information and invokes public game commands. `production-ui.js` adds the stable five-slot queue strip and rally command card. Presentation modules may read game state and call commands, but must not independently mutate combat outcomes, resources, objectives, or queue accounting.

## Update lifecycle

1. Input adapters update key/mouse state or call a public game command.
2. `runtime.js` computes a capped delta time.
3. `Game.update` dispatches to the active `ProductionGame` production override while advancing unit behavior, projectiles, waves, cleanup, and objectives in a stable order.
4. The renderer draws the resulting state, followed by read-only production/rally overlays.
5. The UI refreshes baseline HUD state, then updates stable production-queue nodes from the same state snapshot.

Changing this order is an architectural change and should be documented because it can affect combat timing and presentation consistency.

## Extension patterns

### Add a unit

1. Add the unit definition to `config.js`.
2. Add it to the appropriate production list and roster data.
3. Give it a renderer/art-pass implementation.
4. Validate it in `art-lab.html` and a mission.
5. Add a system only when the unit introduces a rule that existing archetype flags cannot express.

### Add a mission

1. Add declarative mission data in `config.js`.
2. Register an objective updater in `objective-system.js`.
3. Add a wave policy only when composition differs from existing mission rules.
4. Keep mission-specific UI copy in mission data rather than branching in the UI.

### Add a mechanic

1. Identify one authoritative owner.
2. Implement the rule in a focused system or game extension when it is independently testable.
3. Keep a small public game command as the input/UI interface.
4. Render feedback from state; do not duplicate the rule in the renderer.
5. Use stable DOM nodes for controls whose state updates every animation frame.

## Verification

Run:

```bash
bash verify.sh
```

The verifier checks JavaScript syntax, key dependency boundaries, interaction regressions, and production/rally accounting. It is intentionally small and dependency-free; it complements, rather than replaces, browser playtesting.
