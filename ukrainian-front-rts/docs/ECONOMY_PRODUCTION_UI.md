# Economy and production UI ownership

## Scope

UFR-137 extends the UFR-067 economy overview into the player-facing global economy and production panel. It remains a presentation and command-routing layer: simulation state stays authoritative in the worker, resource-income, production-queue, production-exit, research-queue, and command-capacity systems.

The implementation owns:

- `src/core/economy-hud-model.js` for immutable presentation normalization;
- `src/ui/economy-hud-overview.js` for snapshot assembly, rendering, action routing, and lifecycle;
- `economy-hud.css` for panel-specific presentation;
- focused tests under `tests/ui/`.

It does not own `src/ui.js`, the application composition root, economy balance, queue semantics, worker orders, research rules, the command card, minimap, settings, or the dedicated technology-tree screen.

## Presentation contract

The panel derives one deeply frozen model containing:

- current resources and delivered income per minute;
- worker totals, task allocation, resource assignment, and carried resources;
- command-capacity use and forecast;
- one deterministic global view of production and research queues;
- facility-scoped production and research controls;
- prerequisite and affordability explanations;
- a bounded recent-completion ledger;
- a stable technology-tree navigation handoff.

The global queue is sorted deterministically by active state, facility label and stable source identity, queue position, and item identity. UI refreshes compare the complete immutable model signature and suppress unchanged DOM work.

## Command routing

All mutations use existing public game commands. The panel may select or focus a facility before invoking queue cancellation, reorder, pause, repeat, research cancellation, or research pause commands. It never mutates queue records directly.

Rally controls call `game.setProductionRally()` and `game.clearProductionRally()`:

- **Rally to view** replaces the facility rally queue with the battlefield point currently at the viewport center.
- **Append view** appends that point through the production-exit system's bounded rally contract.
- **Focus rally** moves the camera to the final rally waypoint without changing simulation state.
- **Clear rally** delegates to the authoritative production-exit controller.

## Completion navigation

The panel retains at most eight recent completion records. A queue item is considered naturally complete only when it disappears from position zero after being observed at 99 percent or within 1.25 seconds of completion. Explicit UI cancellations are excluded before the next observation. The tracker resets when the mission changes or simulation time moves backward on restart.

This is a deterministic presentation ledger, not save state or simulation authority. It supports immediate navigation to the originating live facility and does not persist across reloads.

## Technology-tree handoff

UFR-137 owns only the access point. Activation uses the first available integration seam:

1. `ui.openScreen('techTree')`;
2. `ui.requestScreen('techTree')`;
3. an installed `#techTreeToggle` control;
4. a cancelable `ufr:open-tech-tree` document event.

UFR-138 owns the dedicated technology-tree screen, its state model, navigation, and comparison tooltips. This handoff allows that screen to integrate without modifying the economy panel.

## Verification

Focused verification:

```bash
node --check src/core/economy-hud-model.js
node --check src/ui/economy-hud-overview.js
node --check tests/ui/economy-hud-model.test.mjs
node --check tests/ui/economy-hud-overview.test.mjs
node --test tests/ui/economy-hud-model.test.mjs tests/ui/economy-hud-overview.test.mjs
```

Repository acceptance remains:

```bash
bash verify.sh
```

The browser startup smoke must confirm the assembled installer can mount and dispose the panel without startup errors.
