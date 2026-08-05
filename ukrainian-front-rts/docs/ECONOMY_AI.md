# Economy AI Planner

`src/ai/economy-planner.js` is the deterministic macro-economic planning boundary for every playable faction.

## Inputs

The planner consumes a JSON-compatible strategic snapshot: resources, workers, resource sites, bases, production buildings, capacity, damaged structures, build options, unit options, research options, and target thresholds. Faction behavior is supplied through a doctrine object containing the faction ID, budget weights, and optional resource priorities.

No faction ID is used as a behavioral branch. Adding or tuning a faction changes doctrine data, not planner control flow.

## Decision order

Each decision tick:

1. Workers are assigned to active resource sites by resource priority, fill ratio, threat, distance, and stable ID tie-breaks.
2. The budget is reweighted toward construction and repair when a base or production building has been lost.
3. Damaged infrastructure is repaired when the reserve floor permits it.
4. Missing bases and production buildings are rebuilt.
5. Capacity is restored when the configured buffer is breached.
6. Saturated operations expand to the best unclaimed resource site.
7. Affordable unit production is selected.
8. Research is selected only when critical base and production recovery is complete.

All queues share one mutable resource wallet and preserve the configured reserve floor. Returned plans are canonical snapshots, so input ordering cannot change the result.

## Integration contract

Call `planEconomy(snapshot, doctrine)` from the strategic AI cadence. The returned object contains:

- `workerAssignments` and `resourceOperations`;
- a validated `budgetPlan`;
- ordered `actions`;
- explicit recovery flags;
- remaining resources after all queued actions.

The caller owns translation from plan actions into simulation commands. The planner does not read hidden world state, mutate simulation objects, or issue browser/runtime side effects.

## Verification

Run:

```sh
node --test tests/ai/economy-ai.test.mjs
./verify.sh
```

The focused suite covers normal allocation and expansion, base and production loss recovery, repair and capacity recovery, reserve constraints, faction-neutral behavior, and order-independent determinism.
