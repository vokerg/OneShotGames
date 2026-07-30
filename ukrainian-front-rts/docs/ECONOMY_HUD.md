# Economy HUD overview

UFR-067 adds an operational ledger that exposes the economy systems already owned by production, research, rally, worker, and command-capacity modules. The HUD is a consumer: simulation mutation continues through public game commands.

## Player-facing coverage

- all Ukrainian production facilities, active progress, ordered queue contents, pause/repeat state, blocked exits, and facility focus;
- cancellation and deterministic reordering through the existing production queue commands;
- rally waypoint coordinates and rally clearing;
- live timed research queues, facility focus, pause/resume, cancellation/refunds, current modernization availability, and exact prerequisite/resource explanations;
- resource stockpiles and delivered income normalized to per-minute rates over the trailing simulation minute;
- fielded, reserved, used, and available command capacity, including capacity sources still under construction.

## Ownership

`src/core/economy-hud-model.js` normalizes and freezes presentation data. `src/ui/economy-hud-overview.js` adapts live game state and owns DOM rendering/event delegation. `src/systems/resource-income-telemetry.js` records positive resource deliveries without changing gather rates, worker orders, resource balances, or spending. `src/systems/research-queue-runtime.js` composes UFR-061 queue contracts into the authoritative game facade and fixed-step research phase.

Queue buttons focus the relevant facility and invoke public `Game` commands. The HUD never edits production arrays, research state, rally arrays, resources, upgrades, or capacity fields directly.

## Deterministic composition

Research uses the declared `production → research → waves` phase order. Production occupancy is snapshotted before queue advancement so a workshop that completes production during a tick remains research-blocked for that tick under the `researchPauses` contention policy. Completed technologies synchronize across every research facility before new prerequisite validation.
