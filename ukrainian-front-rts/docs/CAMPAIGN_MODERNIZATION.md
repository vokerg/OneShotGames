# Campaign modernization choices

UFR-091 defines the persistent campaign policy for spending modernization points on a bounded set of upgrade-backed choices. It is a campaign progression contract, not a second upgrade engine.

## Ownership

- `src/core/campaign-profile.js` (UFR-084) remains the authoritative persistent profile and revision owner.
- `src/systems/upgrade-modifier-system.js` (UFR-062) remains the authoritative active modifier and stat-resolution owner.
- `src/core/campaign-modernization.js` owns modernization choice validation, point accounting, unlock state, refund/respec policy, persistence snapshots, and presentation summaries.

The modernization module writes one versioned value to `profile.choices.modernization`. Selected choices project to stable `activeUpgradeIds` that can be passed to UFR-062. `profile.unlockedUpgradeIds` is additive history: refunding or respecing a current choice does not erase that an upgrade was previously unlocked.

## Default catalog

The initial catalog maps six existing stable upgrade IDs into campaign choices:

- counter-UAS roof protection (`cageArmor`);
- thermal fire-control sights (`thermal`);
- NATO 155 mm ammunition (`natoAmmo`);
- active protection (`activeProtection`);
- digital battle management (`digitalC2`);
- mine-roller kit (`mineRoller`).

Choice definitions contain presentation text, category, tier, point cost, prerequisite choices, reciprocal exclusions, and explicit campaign unlock requirements. Catalog creation can receive UFR-062 upgrade definitions and fails closed when any referenced upgrade ID is unknown.

## Balance constraints

The versioned policy independently bounds:

- lifetime modernization points;
- simultaneous selected choices;
- category-specific selection counts;
- prerequisite and exclusion graphs;
- campaign-operation and medal unlock requirements;
- full, partial, or locked refund windows.

State stores `earnedPoints`, `availablePoints`, and selected IDs. Active cost is derived from the catalog. The difference between earned points, available points, and active cost is reported as `sunkPoints`, so a partial refund cannot silently recreate forfeited currency.

## Refund and respec behavior

Refund policy is resolved from completed-operation count:

1. the early campaign window can refund the full active cost;
2. later refunds can return a configured integer ratio, rounded down;
3. an optional late-campaign threshold can lock refunds entirely.

A prerequisite cannot be removed while dependent choices remain selected unless the caller explicitly requests deterministic cascade removal. Whole-roster respec uses the same policy and may apply a configured fee.

## Persistence and UI integration

Use `writeModernizationToCampaignProfile()` after awards, selections, refunds, or respecs. Use `readModernizationFromCampaignProfile()` when loading a profile. `createModernizationPresentation()` returns an immutable, reference-free model with budget totals, active upgrade IDs, refund values, status, and reason codes for each choice.

A later UI should display those reason codes rather than reimplementing affordability, prerequisite, campaign-unlock, category-cap, or refund rules. Runtime stat composition should pass `activeModernizationUpgradeIds()` to UFR-062 rather than applying modifiers from campaign code.

## Verification

```bash
node --check src/core/campaign-modernization.js
node --check tests/campaign/campaign-modernization.test.mjs
node --test tests/campaign/campaign-modernization.test.mjs
bash verify.sh
```

The focused tests cover catalog/upgrade-ID validation, immutable ordering, point caps, selection constraints, campaign unlocks, profile persistence, additive unlock history, dependency cascades, partial sunk cost, full/partial/locked respec windows, presentation output, serialization, graph cycles, reciprocal exclusions, and malformed state.
