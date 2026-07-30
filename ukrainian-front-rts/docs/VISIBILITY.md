# Authoritative visibility

`src/visibility/line-of-sight.js` owns deterministic visibility queries for combat, fog, and later spotting consumers.

## Contract

- World positions are traced through grid cells using deterministic integer traversal.
- Intermediate opaque terrain, building cells, smoke cells at or above the shared density threshold, or elevation above the interpolated sight ray block visibility.
- Multiple smoke contributions in one cell stack additively and clamp to the shared maximum density.
- The origin and target cells do not block their own query.
- `resolveLineOfSight` returns both the boolean result and the first blocking reason/cell; smoke blockers also expose their effective density.
- `createVisibilityQuery` exposes the shared `canSee`, `inspect`, and `visibleEntities` interface. Fog and combat systems must consume this interface rather than implement separate visibility rules.

## Smoke integration

`src/core/smoke-policy.js` owns the density threshold shared by visibility and projectile accuracy. `src/systems/smoke-system.js` converts active smoke clouds into density-bearing visibility cells. Visibility code does not own deployment, duration, stacking, drift, AI scoring, or renderer presentation.

## Ownership boundaries

This module does not define cover bonuses, concealment percentages, suppression, target priorities, artillery spotting, or smoke lifecycle. Those systems may consume the visibility result but must not redefine line-of-sight traversal.
