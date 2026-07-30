# Production exits and rally points

`src/systems/production-exit-system.js` owns deterministic spawn placement, rally state, produced-unit order inheritance, and deployment acknowledgement records introduced by UFR-059. `src/systems/production-queue-system.js` continues to own queue time, reservations, repeat production, refunds, and deterministic completion order.

## Player flow

1. Select a Ukrainian production building.
2. Right-click the battlefield to replace its rally point.
3. Shift-right-click to append up to eight rally waypoints.
4. Newly completed units leave from the closest valid side when a rally point exists; without one, the legacy south-first preference is retained.
5. A deployment toast identifies the completed unit and facility. The selected-building status reports when every exit is blocked.

Setting a new non-Shift rally point replaces the existing waypoint queue. Rally orders are ordinary FIFO move orders, so the queued-order controller advances them using the same movement and stuck-recovery behavior as player-issued waypoints.

## Exit resolution

The controller consumes the synchronized runtime navigation grid. It derives the building footprint from UFR-055 placement metadata when available and otherwise from configured dimensions.

For the produced unit, it derives:

- movement layer;
- cell footprint from unit diameter;
- passability against terrain and dynamic blockers;
- live-unit occupancy clearance.

Candidates are generated in deterministic rings around the building. The first ring touches the structure perimeter. Later rings provide bounded fallback when immediate exits are blocked. Candidate ordering is:

1. lowest search ring;
2. shortest squared distance to the first rally waypoint, when present;
3. stable side order: south, east, north, west;
4. stable candidate order within the side.

Air units use the air movement layer but still avoid spawning directly on live units.

## Blocked completion contract

A queue item that reaches zero time does not disappear while all bounded exits are blocked:

- the item remains at the front of the queue with `left: 0`;
- its population reservation remains active;
- repeat production does not enqueue another copy;
- later simulation steps retry exit resolution;
- completion commits only after `game.addUnit` succeeds at a valid exit.

This keeps production deterministic and prevents units from spawning inside structures, impassable terrain, blockers, or occupied space.

## Acknowledgements

Successful deployment appends an immutable, globally sequenced record to `game.productionAcknowledgements`. Records include building/unit IDs, type, position, side, fallback status, rally waypoint count, and simulation time. The runtime retains the newest 32 records. The UI adapter emits each record once as a player-facing toast.

## Ownership boundaries

- `src/systems/production-queue-system.js`: time, queue ordering, reservations, repeat, cancellation/refunds, and completion transaction.
- `src/systems/production-exit-system.js`: exit candidates, passability/occupancy resolution, rally state, spawned-unit orders, and acknowledgement data.
- `src/input/production-rally-input.js`: capture-phase right-click and Shift-right-click rally commands.
- `src/ui/production-exit-feedback.js`: deployment toast and selected-building blocked-exit status.
- `src/systems/navigation-movement-system.js`: navigation-grid synchronization and later movement execution; unchanged by UFR-059.
- `src/navigation/path-service.js`: path caching and repath policy; unchanged by UFR-059.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/production-exit-system.js
node --check src/systems/production-queue-system.js
node --check src/input/production-rally-input.js
node --check src/ui/production-exit-feedback.js
node --check src/main.js
node --test tests/economy/production-queue-system.test.mjs tests/economy/production-exit-system.test.mjs
bash verify.sh
```

Browser checks should cover each production building, replacement and Shift-appended rally points, north/east/south/west side selection, occupied immediate exits, fully blocked exits that later clear, multiple queued completions, repeat production, deployment toasts, and rally movement through multiple waypoints.
