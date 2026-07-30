# Economy HUD contract

UFR-067 introduces a deterministic, DOM-free presentation boundary in `src/core/economy-hud-model.js`.

The model exposes production queues and manipulation affordances, research progress/cancellation, rally positions, prerequisite explanations, sorted resource income rates, and used/reserved/limit/forecast command capacity. Browser UI code may render this immutable model and dispatch the returned public command descriptors; it must not mutate simulation state directly.

The model deliberately owns presentation normalization only. Production, research, prerequisites, income accounting, rally execution, and capacity reconciliation remain authoritative in their existing simulation systems.
