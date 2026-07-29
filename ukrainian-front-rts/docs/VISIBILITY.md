# Authoritative visibility

`src/visibility/line-of-sight.js` owns deterministic visibility queries for combat, fog, and later spotting consumers.

## Contract

- World positions are traced through grid cells using deterministic integer traversal.
- Intermediate opaque terrain, building cells, smoke cells, or elevation above the interpolated sight ray block visibility.
- The origin and target cells do not block their own query.
- `resolveLineOfSight` returns both the boolean result and the first blocking reason/cell.
- `createVisibilityQuery` exposes the shared `canSee`, `inspect`, and `visibleEntities` interface. Fog and combat systems must consume this interface rather than implement separate visibility rules.

## Ownership boundaries

This task does not define cover bonuses, concealment percentages, suppression, target priorities, artillery spotting, or smoke lifecycle. Those systems may consume the visibility result but must not redefine line-of-sight traversal.
