# Release balance baseline

`src/content/release-balance-baseline.js` is the reviewed release-candidate drift contract for UFR-149. It deliberately does **not** feed runtime mechanics. The authoritative runtime modules remain `src/config.js`, `src/game.js`, `src/skirmish/skirmish-catalog.js`, `src/content/economy-balance.js`, `src/ai/ai-difficulty-profiles.js`, and `src/content/campaign/campaign-balance.js`; the baseline exists so a later number or battlefield change cannot masquerade as an unrelated refactor.

## Baseline identity

- Baseline: `2026-08-rc1`
- Contract version: `1`
- Economy profile: `gate-b2-baseline-v1`
- Campaign balance version: `1`
- Campaign battlefield: `shared-campaign-battlefield-v1`
- Skirmish maps: `crossing-ground`, `shelterbelt-grid`, `industrial-basin`
- Batch simulation: `combat-mission`, `economy-window`, and `mission-timing` through `src/app/balance-simulation.js`

## Review rationale

### Counters and combat values

The baseline locks the five faction-paired line archetypes used by the current core roster: infantry, drones, IFVs, tanks, and self-propelled artillery. The Ukrainian roster pays the player-facing economy costs while the Russian campaign force is authored by mission/AI budgets, hence the intentional zero-cost Russian campaign entries in `src/config.js`. Skirmish faction production uses its own explicit paired costs in the skirmish catalog and remains covered by the skirmish framework tests.

The pairings preserve readable trade-offs instead of exact mirror stats: Ukrainian infantry/tanks trade higher durability/range for their resource cost; Russian drones/artillery retain their authored profile differences. No release change should flatten those differences without a new baseline review and deterministic batch evidence.

### Structures, income, and build pacing

The release contract freezes depot, barracks, and workshop costs/build times plus the economy profile's starting-force, affordability, and mission-completion windows. These values are already exercised by the economy evaluator and verification suite. They are kept in one drift contract so a cost/build-time edit and its pacing consequence are reviewed together.

### Research progression

All six modernization entries are part of the RC baseline: tier, prerequisite edge where present, applicable archetypes, resource/intelligence cost, and mechanical modifiers. Tier-one upgrades establish the initial durability/sight/artillery branches; `activeProtection` and `digitalC2` retain their explicit prerequisite chains, while `mineRoller` remains an independent tier-two mobility choice. Locking both cost and modifier payload prevents an apparently harmless research-price or effect edit from silently changing the campaign/economy curve.

### AI difficulty

Difficulty remains a decision-quality curve, not a hidden-stat curve. `recruit` through `commander` change observation/reaction delay, planning quality, risk tolerance, and economy efficiency. Every profile must retain observed-only information and `1.0` resource/damage/health multipliers, with no full-map vision or fog bypass.

### Campaign difficulty

Story/standard/veteran campaign pressure is authored through resources, pressure/reinforcement timing, objective/checkpoint timing, and recovery windows. `combatStatMultiplier` stays `1` at every tier. Late-campaign pressure may continue to be derived by `resolveCampaignBalance`; changing the tier anchors requires an explicit baseline update.

### Campaign battlefield review

All three campaign missions run on the same authored `2560 x 1664` battlefield created by `Game.start()`, while mission objectives, starting resources, heroes, and wave pressure vary through `MISSIONS`. The versioned review locks the six-point southwest-to-northeast road/operational axis, all five resource sites, deterministic terrain-class distribution, both headquarters and support-building positions, and every fixed non-hero starting unit. The same regression executes for every mission, and the three objective sets, starting resource packages, and wave schedules are also locked.

The campaign battlefield is intentionally asymmetric PvE rather than mirrored PvP. Ukraine begins in the southwest near the Salvage Yard and Fuel Point; Russia begins in the northeast near the Industrial Site and Forward Fuel Base; the Signals Relay lies between them. This advantage model is visible and authored. It is not compensated with hidden combat modifiers: the AI fairness contract separately requires `1.0` resource/damage/health multipliers, observed-only information, and no fog bypass.

### Skirmish map review

The release also includes all three authored competitive battlefields from `src/skirmish/skirmish-catalog.js`: Crossing Ground, Shelterbelt Grid, and Industrial Basin. The baseline versions each map's deterministic terrain seed, player/enemy start positions, complete road geometry, resource coordinates/types/amounts, and equal starting wallet.

The skirmish fairness regression checks more than exact-data drift. Opposing starts must be rotationally paired through the world center. Each resource has a counterpart on the opposing side with the same resource kind and amount, and paired start-to-resource distances may differ by at most one world unit. Crossing Ground contains small authored coordinate offsets but remains within that distance budget; Shelterbelt Grid and Industrial Basin are exact pairs. The shared skirmish objective remains destruction of the opposing command post, so neither faction receives an objective-side shortcut.

Road geometry is version-locked for campaign and every skirmish map as the authored operational/chokepoint axis. A road, spawn, resource, terrain-seed/distribution, objective, or wave-pressure change must therefore be reviewed explicitly rather than entering the release as incidental data churn. The release baseline accepts no unresolved P0/P1 placement exploit; intended advantages must be attributable to explicit placement, resources, objectives, timing, or documented scenario rules.

## Batch-simulation evidence

The authoritative deterministic balance tooling is `src/app/balance-simulation.js` plus `src/core/balance-snapshot.js`. The default suite produces three seeded batches:

1. `combat-mission` — exercises attack-move and resulting combat outcome/attrition.
2. `economy-window` — exercises a real production order and resource delta.
3. `mission-timing` — advances the authored scenario without injecting a player command and records mission pressure/timing metrics.

`tests/balance/balance-simulation.test.mjs` verifies deterministic aggregation and the suite contract. `tests/balance/release-balance-baseline.test.mjs` adds the release drift gate for combat, structures, research, economy pacing, AI fairness/difficulty, campaign pressure, the complete shared campaign battlefield, and all three skirmish maps/fairness invariants.

## Change protocol

A post-baseline balance change must be intentional. Update the authoritative runtime value first, then update `RELEASE_BALANCE_BASELINE_ID` and the corresponding locked value in the same PR. The PR should state what player-facing problem is being corrected, show deterministic before/after batch evidence, and call out any deliberate map/campaign asymmetry. Do not change the baseline merely to make a drift test green when the runtime change was unrelated or accidental.

For subjective tuning, deterministic headless results are necessary but not sufficient. Player-facing headed/browser playtests should be attached when the conclusion depends on readability, feel, or human decision time; the baseline test itself remains deterministic evidence.
