# Release balance baseline

`src/content/release-balance-baseline.js` is the reviewed release-candidate drift contract for UFR-149. It deliberately does **not** feed runtime mechanics. The authoritative runtime modules remain `src/config.js`, `src/content/economy-balance.js`, `src/ai/ai-difficulty-profiles.js`, and `src/content/campaign/campaign-balance.js`; the baseline exists so a later number change cannot masquerade as an unrelated refactor.

## Baseline identity

- Baseline: `2026-08-rc1`
- Contract version: `1`
- Economy profile: `gate-b2-baseline-v1`
- Campaign balance version: `1`
- Batch simulation: `combat-mission`, `economy-window`, and `mission-timing` through `src/app/balance-simulation.js`

## Review rationale

### Counters and combat values

The baseline locks the five faction-paired line archetypes used by the current core roster: infantry, drones, IFVs, tanks, and self-propelled artillery. The Ukrainian roster pays the player-facing economy costs while the Russian scenario force is authored by mission/AI budgets, hence the intentional zero-cost Russian entries in `src/config.js`. The release gate therefore compares combat capability and pacing directly rather than pretending both sides share the same production economy.

The pairings preserve readable trade-offs instead of exact mirror stats: Ukrainian infantry/tanks trade higher durability/range for their resource cost; Russian drones/artillery retain their authored profile differences. No release change should flatten those differences without a new baseline review and deterministic batch evidence.

### Structures, income, and build pacing

The release contract freezes depot, barracks, and workshop costs/build times plus the economy profile's starting-force, affordability, and mission-completion windows. These values are already exercised by the economy evaluator and verification suite. They are kept in one drift contract so a cost/build-time edit and its pacing consequence are reviewed together.

### Research progression

All six modernization entries are part of the RC baseline: tier, prerequisite edge where present, applicable archetypes, resource/intelligence cost, and mechanical modifiers. Tier-one upgrades establish the initial durability/sight/artillery branches; `activeProtection` and `digitalC2` retain their explicit prerequisite chains, while `mineRoller` remains an independent tier-two mobility choice. Locking both cost and modifier payload prevents an apparently harmless research-price or effect edit from silently changing the campaign/economy curve.

### AI difficulty

Difficulty remains a decision-quality curve, not a hidden-stat curve. `recruit` through `commander` change observation/reaction delay, planning quality, risk tolerance, and economy efficiency. Every profile must retain observed-only information and `1.0` resource/damage/health multipliers, with no full-map vision or fog bypass.

### Campaign difficulty

Story/standard/veteran campaign pressure is authored through resources, pressure/reinforcement timing, objective/checkpoint timing, and recovery windows. `combatStatMultiplier` stays `1` at every tier. Late-campaign pressure may continue to be derived by `resolveCampaignBalance`; changing the tier anchors requires an explicit baseline update.

### Map symmetry and authored asymmetry

The release rule is fairness rather than geometric mirroring. A map/scenario may be intentionally asymmetric, but it must not grant a hidden starting-side combat-stat modifier. Advantage must be legible in placement, objectives, starting resources, timing, terrain, or explicit scenario rules. The default deterministic scenario is exercised by all three headless batches, so changes to authored map pressure are reviewed together with combat/economy/mission timing output.

## Batch-simulation evidence

The authoritative deterministic balance tooling is `src/app/balance-simulation.js` plus `src/core/balance-snapshot.js`. The default suite produces three privacy-safe, seeded batches:

1. `combat-mission` — exercises attack-move and resulting combat outcome/attrition.
2. `economy-window` — exercises a real production order and resource delta.
3. `mission-timing` — advances the authored scenario without injecting a player command and records mission pressure/timing metrics.

`tests/balance/balance-simulation.test.mjs` verifies deterministic aggregation and the suite contract. `tests/balance/release-balance-baseline.test.mjs` adds the release drift gate for combat, structures, research, economy pacing, AI fairness/difficulty, campaign pressure, and batch tooling.

## Change protocol

A post-baseline balance change must be intentional. Update the authoritative runtime value first, then update `RELEASE_BALANCE_BASELINE_ID` and the corresponding locked value in the same PR. The PR should state what player-facing problem is being corrected, show deterministic before/after batch evidence, and call out any deliberate map/campaign asymmetry. Do not change the baseline merely to make a drift test green when the runtime change was unrelated or accidental.

For subjective tuning, deterministic headless results are necessary but not sufficient. Player-facing headed/browser playtests should be attached when the conclusion depends on readability, feel, or human decision time; the baseline test itself remains Level 1 deterministic evidence.
