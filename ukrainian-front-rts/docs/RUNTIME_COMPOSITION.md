# Runtime composition and simulation ownership

## Purpose

This document is the architecture and change-routing contract for recovery issue #111. It records how the browser application installs adapters, how authoritative fixed-step work is ordered, how teardown is performed, and how restricted browser capabilities degrade safely.

The recovery preserves the dependency-free browser baseline and existing gameplay outcomes. It replaces implicit installer-order behavior with named, executable ownership.

## Composition root

`src/main.js` remains the only browser composition root. It constructs `Game`, `UI`, `Renderer`, and the game runtime, then supplies a stable ordered module list to `src/app/composition-registry.js`.

The registry:

- requires a unique stable name for every module;
- installs modules in declaration order;
- records each returned disposer automatically;
- exposes the installed module order for diagnostics;
- disposes in exact reverse order;
- rolls back already-installed modules in reverse order when a later installer fails;
- rejects re-entrant installation/disposal and installation after final disposal.

The page lifecycle owns one call to `composition.dispose()`. `src/main.js` must not maintain a second hand-written disposer chain.

## Installed module order

The current browser application installs these ownership groups in this order:

1. authoritative command and economy controllers;
2. transport and construction controllers;
3. worker, telemetry, drop-off, construction-progress, and building-lifecycle controllers;
4. stance and tactical-command controllers adapted to named simulation delegates;
5. veterancy and research controllers;
6. command-capacity controller adapted to its named simulation delegate;
7. combat-readability presentation observer;
8. command cards, HUD feedback, overlays, previews, and browser input adapters;
9. mission-card/endgame/objectives UI wiring;
10. animation-frame runtime.

`window.__fieldsOfResolveComposition.installedModules()` exposes the exact concrete names installed on a running page. It is diagnostic state only and must never become gameplay authority.

## Authoritative fixed-step order

`src/systems/simulation-phases.js` owns the complete fixed-step order:

```text
clock
→ camera
→ step-begin delegates
→ tactical-prepare delegates
→ stance-prepare delegates
→ units
→ projectiles
→ production
→ research
→ waves
→ destroyed-entity cleanup
→ objectives
→ outcome
→ building-lifecycle delegates
→ stance-reconcile delegates
→ tactical-reconcile delegates
→ command-capacity delegates
→ step-end delegates
```

The order intentionally preserves the previous nested-wrapper behavior:

```text
tactical prepare
→ stance prepare
→ base simulation
→ building capture reconciliation
→ stance reconcile
→ tactical reconcile
→ command-capacity reconcile
```

It is now visible through `SIMULATION_PHASES`, deterministic, testable, and independent of controller installation nesting.

## Simulation delegate registry

`src/core/simulation-delegates.js` owns named fixed-step extension points. A delegate registration declares:

- one published phase ID;
- one stable owner ID;
- a deterministic numeric order;
- one callback receiving the authoritative game and fixed step.

Delegates are sorted by numeric order and then stable ID. Duplicate ownership in the same phase fails immediately. Registration returns an exact idempotent remover, and snapshots are frozen inspection data.

Use delegates only for authoritative gameplay work that truly belongs in a fixed-step phase. UI refresh, rendering, audio playback, telemetry export, and browser event handling remain outside simulation authority.

## Legacy-controller adaptation

`src/app/controller-adapter.js` is a temporary compatibility boundary for merged controllers that still install an update wrapper internally.

The adapter:

1. records the authoritative `game.update` method and the lifecycle methods the controller owns;
2. installs the legacy controller so its non-update public commands and lifecycle wrappers remain active;
3. captures and removes only the installed update wrapper;
4. registers the controller's before/after work as named delegates;
5. restores the captured wrapper only while invoking the controller's own disposer;
6. restores the authoritative update and lifecycle boundaries exactly afterward.

The adapted gameplay owners are:

| Module | Former hidden work | Declared owner |
| --- | --- | --- |
| `src/systems/tactical-command-system.js` | prepare before update; reconcile after update | `tactical-prepare`, `tactical-reconcile` |
| `src/systems/stance-system.js` | prepare before update; reconcile after update | `stance-prepare`, `stance-reconcile` |
| `src/systems/building-lifecycle-system.js` | advance capture state after update | `building-lifecycle` |
| `src/systems/command-capacity-system.js` | reconcile after update | `command-capacity` |

`src/ui/combat-readability-runtime.js` still observes the public update boundary because it advances presentation/event-consumer state rather than authoritative gameplay. It remains explicitly inventoried and may not mutate combat outcomes through that observer.

New gameplay controllers must not copy this compatibility pattern. They register their fixed-step delegate directly or add a focused delegate called by an existing authoritative phase.

## Lifecycle-wrapper inventory

The current composition also installs controllers that wrap public commands or entity lifecycle methods without creating fixed-step phases. Their ownership remains narrow:

- attack-ground and queued-order controllers own command adaptation;
- production, exit, transport, construction, drop-off, and research controllers own their focused public APIs;
- veterancy owns unit/building initialization, stat projection, damage-source attribution, and death awards;
- resource-income telemetry observes worker deposits without changing resource rules;
- building lifecycle owns building transition commands, initialization, and cleanup adaptation; capture progression is the named `building-lifecycle` delegate;
- UI/input installers own presentation and browser listeners only.

A wrapper around `start`, `issue`, `addUnit`, `addBuilding`, `removeDestroyedEntities`, or another public method must restore the exact previous method on disposal. It must not create an undeclared simulation phase. New wrappers require an explicit entry in this inventory, integration tests, and verifier coverage.

## Browser capability acquisition

Browser properties can throw while being read, notably `localStorage` in restricted contexts. `src/app/browser-capabilities.js` acquires optional browser capabilities through a guarded function and returns an explicit fallback when acquisition fails.

The composition root passes the acquired storage object, or `null`, to combat-readability preferences. A storage restriction therefore disables persistence but cannot abort application startup.

Do not read `window.localStorage` directly in the composition root or simulation modules.

## Failure and teardown behavior

Installation is atomic at the module boundary. If module `N` fails, modules `N-1` through `1` are disposed in reverse order before the error escapes. Disposal attempts every installed module even when one disposer throws, then reports the collected failures.

A disposer must be idempotent and must remove exactly the listeners, delegates, method patches, diagnostics, or runtime handles created by its installer. Mission restart must reuse the installed composition; it must not install a second adapter graph.

## Change routing

| Change | Owner | Required coordination |
| --- | --- | --- |
| Add/remove/reorder browser module | `src/main.js`, `src/app/composition-registry.js` | composition tests and this document |
| Add authoritative per-tick work | existing phase owner or `src/core/simulation-delegates.js` | phase-order tests, determinism evidence |
| Migrate a legacy update wrapper | `src/app/controller-adapter.js` plus owning controller | exact before/after ordering and disposal test |
| Add browser capability | `src/app/browser-capabilities.js` | restricted-access fallback test |
| Add public-method wrapper | focused owning module | exact restoration test and inventory update |
| Add presentation observer | UI/render/audio adapter | prove it cannot influence simulation outcomes |

Never add gameplay behavior by replacing `game.update` in a new module. Never make correctness depend on module install order that is absent from the named composition list.

## Executable verification

`bash verify.sh` includes `scripts/verify-runtime-composition.mjs`. The verifier:

- scans production source for assignments to the authoritative update boundary;
- rejects assignments outside the explicit wrapper inventory;
- requires the named composition registry, controller adapter, and safe storage acquisition in `src/main.js`;
- requires every published delegate phase in the authoritative phase owner;
- rejects direct `window.localStorage` acquisition in the composition root;
- rejects a hand-written disposer call sequence in the composition root.

Focused coverage lives in:

- `tests/unit/composition-registry.test.mjs`;
- `tests/unit/controller-adapter.test.mjs`;
- `tests/unit/simulation-delegates.test.mjs`;
- `tests/unit/browser-capabilities.test.mjs`;
- `tests/unit/simulation-phases.test.mjs`;
- `tests/tooling/runtime-composition-verifier.test.mjs`.

The highest completion evidence must remain below `RUNTIME_INTEGRATED` until the assembled verifier and browser startup smoke pass on the PR head.
