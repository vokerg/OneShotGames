# Resource extraction policy

`src/core/resource-policy.js` owns the browser-independent numeric policy for resource extraction, worker carry limits, source depletion, salvage bursts, optional regeneration, and mission-specific overrides.

## Resource rules

The versioned policy defines one rule for each supported resource kind: `metal`, `fuel`, and `intel`.

Each rule contains:

- `extractionRate` — units transferred per simulation second while a worker is in range;
- `carryCapacity` — maximum amount of that resource a worker may carry;
- `regenerationRate` — optional units restored to a source per simulation second;
- `salvageBurst` — maximum amount granted by one salvage interaction.

All values are validated as finite non-negative or positive numbers as appropriate. Policies, rule records, mission overrides, and results are frozen.

## Mission overrides

`createResourcePolicy()` accepts a `missionOverrides` record keyed by stable mission ID. Each mission may override any subset of fields for any supported resource kind. Missing fields inherit from the base rule, and missing resource kinds inherit the entire base rule.

The policy does not read mission content or mutate `config.js`. Authored mission data may construct a policy at the campaign or scenario composition boundary after the relevant schema owner exposes the field.

## Deterministic operations

- `extractResource()` limits transfer by elapsed fixed-step time, remaining source amount, and remaining carry capacity.
- `regenerateResource()` applies optional regeneration without exceeding `maxAmount`.
- `resolveSalvageBurst()` limits one-shot salvage by available amount, requested amount, and the authored burst limit.
- `resolveResourceRule()` selects the mission override when present, otherwise the base rule.

These functions return immutable next-state records. They do not select workers, sources, paths, or drop-off structures and do not mutate live game objects.

## Ownership boundaries

- UFR-051 owns gather orders, source selection, return/deposit flow, and worker reassignment.
- UFR-052 owns worker presentation and idle-worker controls.
- UFR-053 owns structure drop-off capabilities and travel-cost selection.
- UFR-054 owns extraction, capacity, depletion, salvage, regeneration, and mission numeric overrides.
- Later integration may replace the compatibility constants in `worker-gather-system.js` with resolved UFR-054 rules, but must preserve UFR-051 order behavior and UFR-053 drop-off ownership.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/core/resource-policy.js
node --check tests/economy/resource-policy.test.mjs
node --test tests/economy/resource-policy.test.mjs
bash verify.sh
```
