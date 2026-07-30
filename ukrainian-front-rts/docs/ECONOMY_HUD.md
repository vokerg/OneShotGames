# Economy HUD overview

UFR-067 adds an operational ledger over the production, research, rally, worker, and command-capacity systems. Presentation remains a consumer: simulation mutations occur through public game commands and the authoritative fixed-step phase order.

## Player-facing coverage

- all Ukrainian production facilities, active progress, ordered queue contents, pause/repeat state, blocked exits, and facility focus;
- cancellation and deterministic reordering through the existing production queue commands;
- rally waypoint coordinates and rally clearing;
- live timed modernization queues, progress, production contention, pause/resume, cancellation, proportional refunds, and completed-upgrade application;
- exact production and research availability explanations for resources, prerequisites, capacity, queue limits, facility construction, already-completed work, and already-queued work;
- resource stockpiles and normalized delivered income per minute over the trailing 60 simulation seconds;
- fielded, reserved, used, available, and forecast command capacity, including capacity sources still under construction.

## Ownership

`src/core/economy-hud-model.js` normalizes and deeply freezes presentation data. `src/ui/economy-hud-overview.js` adapts live state, renders the browser panel, and delegates player actions to public commands. `src/systems/resource-income-telemetry.js` observes positive worker-delivery deltas without changing gather rates, worker orders, balances, or spending.

`src/systems/research-queue-runtime.js` consumes the immutable UFR-061 queue contract. It owns facility-scoped live state, resource charges/refunds, cross-facility prerequisite synchronization, facility-loss refunds, and completion application. It exposes public queue commands and a narrow update delegate. `src/systems/simulation-phases.js` invokes that delegate only in the authoritative `production → research → waves` order.

Queue buttons focus the relevant facility and invoke public `Game` commands. The HUD never edits production arrays, research state, rally arrays, resources, upgrades, or capacity fields directly.

## Research timing and contention

Upgrade records may provide an explicit positive `researchTime`. Existing upgrade records without that field use the deterministic fallback `12 + tier × 8` seconds. Repair workshops use UFR-061's `researchPauses` contention policy. The production phase snapshots active facility occupancy before advancing queues; the following research phase consumes that snapshot, so a workshop cannot finish production and also receive a full research tick in the same fixed step. Paused or empty production permits research progress. Completion is synchronized across every Ukrainian research facility before later prerequisite validation.

## Verification focus

Automated coverage includes immutable HUD normalization, facility identity, queue command descriptors, DOM rendering and public-command delegation, normalized delivered-income telemetry, research charging/progress/contention/pause/cancellation/refunds/facility loss/restarts, multi-facility prerequisite synchronization, and the fixed-step phase-order assertion. Browser verification must additionally exercise panel opening/closing, facility focus, every queue control, rally visibility, prerequisite text, responsive layout, and mission continuity.
