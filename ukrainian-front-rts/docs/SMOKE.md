# Smoke system

`src/systems/smoke-system.js` owns deployable smoke lifecycle and the renderer-neutral cloud state consumed by combat, visibility, AI, and future presentation code.

## State and lifecycle

- Smoke state uses deterministic monotonic IDs and contains active cloud records.
- A cloud records position, radius, base density, duration, remaining time, fixed drift vector, team, source, and kind.
- The fixed-step simulation advances smoke after units and before projectile resolution, so movement, drift, expiry, and shot accuracy have a stable order.
- Drift is fixed at deployment and capped at 24 world units per second; no random wind changes occur inside the simulation.
- Clouds fade during the final 25% of their duration and are removed when remaining time reaches zero.

## Shared combat policy

`src/core/smoke-policy.js` defines the common density model:

- density clamps to `0..1`;
- overlapping clouds add and clamp at `1`;
- line of sight is blocked at density `0.65` or higher;
- projectile accuracy scales continuously with the same sampled density, down to the bounded minimum multiplier;
- projectile effects expose sampled density and adjusted accuracy for UI or renderer feedback.

`smokeCellsForVisibility` samples active clouds into the visibility grid. `sampleSmokeLineDensity` samples the firing lane for projectile resolution. Consumers must not create separate smoke thresholds or accuracy formulas.

## Deployment and AI

- `deploySmoke` operates on an explicit smoke state.
- `deployGameSmoke` lazily creates `game.smokeState` for command, ability, mission, or AI callers without adding smoke-specific ownership to `Game`.
- `chooseSmokeDeployment` deterministically scores caller-provided candidate points by friendly protection, threat-line screening, enemy concealment risk, and duplicate existing smoke.

## Presentation boundary

`snapshotSmokeClouds` returns immutable renderer-neutral records with effective density and remaining duration. Rendering may choose particles, sprites, opacity, and animation, but must not change smoke position, density, expiry, stacking, or combat effects.
