# Formation navigation

`src/core/formation.js` owns deterministic formation geometry shared by input and simulation. It does not own path search, collision, terrain cost, rendering, or command presentation.

## Order assignment

Move and attack-move commands create one group anchor from the selected units' centroid and the clicked destination. Units are projected onto travel-forward and lateral axes, sorted deterministically, and assigned centered grid slots without depending on selection-array order.

Spacing uses the largest selected unit footprint diameter plus clearance, with the previous 34-pixel spacing retained as the minimum. Each queued order stores immutable formation metadata:

- stable group ID;
- start and destination anchors;
- slot offset and index;
- spacing;
- ordered choke-compression factors.

Shift-appended waypoints receive independent anchors and slots, so each queued leg can preserve the group layout.

## Path following

Ground units request routes to the shared anchor destination. At every anchor waypoint, `navigation-movement-system.js` applies the unit's slot offset.

The candidate slot is checked against the authoritative navigation grid. If the full offset is blocked or outside the map, the offset is retried at 75%, 50%, 25%, and finally 0%. This compresses the group toward the route anchor through narrow cells. The full offset is attempted again at every later waypoint, so units automatically re-form after clearing the obstacle.

`order.formationState` and `order.formationCompression` expose the current read-only movement state for later renderer, telemetry, and debugging work. They do not change path-search ownership.

## Ownership boundaries

- `src/input/queued-orders.js` attaches formation metadata to accepted move and attack-move commands.
- `src/core/formation.js` owns pure anchor, slot, and compression policy.
- `src/systems/navigation-movement-system.js` consumes the policy while following existing routes.
- UFR-022 remains the owner of path caching, invalidation, repath throttling, request lifecycle, and path-service diagnostics.
- UFR-024 remains the owner of stuck detection, local detours, unreachable-order recovery, and safe cancellation.
- UFR-049 or later renderer work may visualize formation state; this task adds no renderer dependency.

## Verification

Automated coverage checks deterministic input-order independence, common anchors, unique slots, lateral preservation, route-anchor selection, full-width travel, partial and complete choke compression, post-obstacle re-forming, map-edge compression, queued-order integration, and Shift-appended formation legs.

Browser playtest checklist:

1. Select mixed infantry and vehicles and issue a long move across open terrain; confirm stable relative slots.
2. Route the group through a bridge or narrow base gap; confirm the group compresses rather than scattering or stopping.
3. Continue into open terrain; confirm normal spacing returns.
4. Repeat with attack-move.
5. Queue multiple Shift waypoints around obstacles; confirm every leg keeps its own formation destination.
6. Confirm Stop, direct attack, selection, right-click orders, minimap navigation, mouse zoom, and all four WASD directions remain functional.
