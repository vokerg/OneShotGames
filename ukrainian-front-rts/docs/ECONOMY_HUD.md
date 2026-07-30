# Economy HUD overview

UFR-067 adds an operational ledger that exposes the economy systems already owned by production, research, rally, worker, and command-capacity modules. The HUD is a consumer: simulation mutation continues through public game commands.

## Player-facing coverage

- all Ukrainian production facilities, active progress, ordered queue contents, pause/repeat state, blocked exits, and facility focus;
- cancellation and deterministic reordering through the existing production queue commands;
- rally waypoint coordinates and rally clearing;
- timed research descriptors when a facility exposes UFR-061 research queue state, plus current modernization availability and exact prerequisite/resource explanations;
- resource stockpiles and delivered income during the trailing 60 simulation seconds;
- fielded, reserved, used, and available command capacity, including capacity sources still under construction.

## Ownership

`src/core/economy-hud-model.js` normalizes and freezes presentation data. `src/ui/economy-hud-overview.js` adapts live game state and owns DOM rendering/event delegation. `src/systems/resource-income-telemetry.js` records positive resource deliveries without changing gather rates, worker orders, resource balances, or spending.

Queue buttons focus the relevant facility and invoke public `Game` commands. The HUD never edits production arrays, research state, rally arrays, resources, upgrades, or capacity fields directly.

## Compatibility

Timed research is rendered from either `building.researchQueueState` or `game.researchQueueStates`. Missions that have not yet composed the UFR-061 queue contract still receive modernization availability and prerequisite explanations through the existing upgrade data. Research cancellation is offered only when the composition layer exposes a public `game.cancelResearch(facilityId, itemId)` command.
