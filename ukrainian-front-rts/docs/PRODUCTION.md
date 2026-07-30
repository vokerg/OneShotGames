# Production queue controls

`src/systems/production-queue-system.js` owns deterministic unit-production queue state, reservation accounting, cancellation/refunds, reordering, pause, repeat, and fixed-step completion.

## Queue contract

- A Ukrainian production building may hold at most five items.
- Queueing pays the complete resource cost immediately and reserves the unit's command-capacity cost immediately.
- Each item stores a stable building-local ID, type, duration, remaining time, cost snapshot, population snapshot, reservation state, and whether work has started.
- Only the first item advances. Reordering moves the item and its exact remaining progress together.
- Paused queues retain all progress and reservations.
- The fixed-step production phase may complete more than one item when given a large deterministic step; elapsed time is never discarded.

## Cancellation and refunds

- An item that has not started receives a full refund.
- A started item receives the floor of each paid resource multiplied by its remaining-time fraction.
- Cancellation always releases the item's reserved command capacity exactly once.
- Destroyed buildings release all outstanding reservations but do not refund resources; destruction remains a loss rather than a free cancellation path.

## Repeat behavior

Repeat mode records the active unit type. When that type completes, the system attempts to append the same type using the normal cost, hero, queue-limit, and command-capacity checks.

If the repeat attempt is blocked, repeat remains armed and records the reason. An empty repeated queue retries deterministically on later production ticks, so newly available resources or capacity can restart it without another player command. Cancelling the last queued item disables pause and repeat state.

## Player controls

When a Ukrainian production building with a non-empty queue is selected, the command card exposes:

- pause/resume;
- repeat on/off;
- cancel current;
- promote the next item;
- send the current item to the back.

UFR-059 owns rally points and blocked-exit handling. UFR-061 owns research queues. UFR-063 owns the broader over-cap policy. UFR-067 owns the full production/research overview HUD.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/production-queue-system.js
node --check src/input/production-queue-controls.js
node --check src/systems/simulation-phases.js
node --check src/main.js
node --check tests/economy/production-queue-system.test.mjs
node --test tests/economy/production-queue-system.test.mjs
bash verify.sh
```

Browser checks should queue mixed units, reorder both directions, pause/resume, cancel waiting and active items, toggle repeat with and without available capacity, destroy a building with reservations, and confirm command-capacity accounting stays stable through completion.
