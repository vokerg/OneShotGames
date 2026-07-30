# Repair system contract

`src/combat/repair-system.js` owns deterministic repair eligibility, order state, resource charging, cooperative repair rates, field limits, facility behavior, and AI target ranking. It does not move repairers, spend live economy state, mutate entities, draw effects, or bind hotkeys.

## Ownership boundaries

- **Command/input owners** create or cancel a repair order and keep movement/range state current.
- **Repair policy** validates the target and sources, resolves one fixed-step repair slice, and returns immutable snapshots, costs, completion state, and a reference-free event descriptor.
- **Economy owners** commit the returned resource delta atomically with the HP update.
- **Presentation owners** consume the event and blocked reason; they do not infer repair legality.
- **AI owners** use the stable ranking result and then issue the same repair order contract as the player.

UFR-043 deliberately does not modify `game.js`, queued-order representation, navigation, production, destruction/wreck lifecycle, campaign serialization, UI layout, or renderer code. Later integration work must consume this module rather than duplicate its rules.

## Policy defaults

- Base rate: 12 HP/second.
- Additional repairers contribute geometrically at 60% efficiency per position after stable ID sorting.
- At most four field repairers contribute.
- Field repair stops at 75% maximum HP.
- Facilities repair to 100%, run at 150% base rate, and charge 80% of normal resource cost.
- Default cost: 0.5 metal per HP.
- Ground, air, and structure domains are repairable unless a policy narrows them.

All values are versioned policy fields and may be overridden by validated content or mission rules.

## Resolution order

1. Validate policy, order, target snapshot, resources, and elapsed time.
2. Reject non-active orders and ineligible targets with reason-specific feedback.
3. Select eligible field repairers by stable ID, or validate the assigned facility.
4. Resolve effective HP/second and the context cost multiplier.
5. Bound repair by elapsed time, context HP cap, and every required resource.
6. Return immutable next order, target, resources, contributors, cost, and event snapshots.

The resolver never mutates caller-owned objects and never carries live entity references in events.

## AI support

`rankRepairTargets` filters candidates through the same eligibility and context-cap rules used by player orders. It then ranks disabled state, repairable HP deficit, strategic value, travel distance, and incoming-damage risk. Equal scores use stable target-ID ordering. `chooseRepairTarget` returns the first ranked descriptor or `null`.

## Verification coverage

Focused tests cover policy validation, order normalization, cooperative diminishing returns, exact field caps, partial repairs under multi-resource shortages, facility rate/cost behavior, target and source rejection, order-independent results, cancellation, deterministic AI ranking, zero-duration behavior, and invalid elapsed time.
