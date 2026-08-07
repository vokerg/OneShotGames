# Skirmish framework

UFR-083 adds a skirmish mode by composing the existing `Game`, simulation delegate, tactical-AI, economy-planner, objective, renderer, input, and UI owners. It does not introduce a second simulation loop or reinterpret the authoritative `TEAM.UA` / `TEAM.RU` side semantics: `TEAM.UA` remains the human/player side and `TEAM.RU` remains the AI side, while `playerFactionId` and `enemyFactionId` select the faction identity presented on those sides.

## Setup contract

`src/skirmish/skirmish-config.js` owns the immutable setup/catalog data. A match selects:

- one of three authored battlefields: Crossing Ground, Shelterbelt Grid, or Industrial Basin;
- Ukraine or Russia for the player, with the opposite faction assigned to the AI;
- one of the shared fair AI difficulty profiles (`recruit`, `regular`, `veteran`, `commander`);
- an equal starting wallet for both sides.

Every battlefield has explicit start positions, road geometry, resource placement, and deterministic terrain seed. Resource layouts are paired around the two starts so neither side receives a hidden economy multiplier.

## Runtime ownership and fairness

`src/skirmish/skirmish-runtime.js` installs public skirmish commands on the authoritative `Game` instance and a named `STEP_BEGIN` delegate for the AI economy adapter. Campaign wave spawning is disabled in skirmish.

AI economy workers are separated from tactical control and use the same physical gathering constraints as player workers: they must travel to a finite map node, be within the 35-unit interaction radius, gather at 18 resource units per second into a 40-unit carry limit, then return within 70 units of their command post before the cargo becomes spendable. Resources are never credited remotely. Depleted nodes are shared authoritative objects, so either side can exhaust them.

AI command capacity is computed from the same base capacity, live unit population costs, queued population costs, and operational building capacity grants used by the player-side model. A planned unit is rejected if it would exceed that capacity, and AI resources are only spent when the unit is actually accepted into an existing production queue.

Difficulty changes observation/reaction cadence, planning quality, risk, and economy utilization through the shared UFR-082 profile contract. It does not multiply resources, unit stats, costs, build time, gathering rate, carry capacity, or command capacity. The skirmish adapter also prevents the legacy Russian auto-acquisition path from bypassing the tactical reaction window; economy workers never use that combat-acquisition path.

Russia-as-player uses a narrow faction production adapter because the legacy campaign production command assumes Ukrainian unit IDs. The adapter still pays the player's authoritative resource wallet, reserves command capacity, and appends to existing building queues; it does not spawn units directly.

## Victory and results

Skirmish matches use the existing objective/outcome pipeline. The authored victory condition is destruction of the opposing command post. Losing the player command post continues to use normal player-side loss semantics. `src/ui/skirmish-setup.js` adds setup, retry/return behavior, skirmish status text, and an after-action summary containing match duration, objective completion, and both sides' gathered-resource totals.

## Verification

`tests/skirmish-framework.test.mjs` checks the map/faction/difficulty catalog, generic victory contract, Russia-as-player team ownership, equal starting resources, faction-aware production, mirrored command-capacity accounting, and the physical gather/carry/drop-off requirement for AI resources. The repository browser-startup smoke must show the skirmish card alongside campaign operations without warnings.
