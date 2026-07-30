# Area-damage policy

`src/combat/area-damage-policy.js` owns deterministic splash selection and damage calculation. It is a pure combat policy: callers provide an impact, source allegiance, candidate targets, and a validated policy; the module returns immutable damage applications, skipped-target reasons, and a presentation-safe effect descriptor.

## Ownership boundary

- The simulation owns candidate collection, invoking the policy, applying returned damage, entity lifecycle, events, and fixed-step ordering.
- The policy owns splash distance, falloff, minimum damage, friendly-fire filtering/scaling, structure filtering/scaling, and stable target ordering.
- Presentation owns rendering the returned effect descriptor. The descriptor contains stable target IDs and values, never live entity, renderer, or DOM references.
- Projectile travel, hit/dispersion resolution, smoke, cover, armor penetration, target acquisition, and visual effects remain in their existing owners.

UFR-042 deliberately does not wire splash into `projectile-system.js`; that integration must occur in the task that owns the projectile/damage application boundary and must consume this policy rather than duplicate it.

## Policy fields

Area-damage policies are versioned and immutable.

| Field | Meaning |
| --- | --- |
| `falloffCurve` | `constant`, `linear`, or `quadratic` damage decay outside the inner radius. |
| `innerRadiusRatio` | Fraction of the outer radius that receives full base damage. |
| `minimumDamageRatio` | Floor applied to distance falloff at or inside the outer boundary. |
| `friendlyFireMode` | `disabled`, `full`, or `scaled`. |
| `friendlyFireMultiplier` | Ally multiplier used only by `scaled` friendly fire. |
| `structureDamageMode` | `disabled`, `full`, or `scaled`. |
| `structureDamageMultiplier` | Structure multiplier used only by `scaled` structure damage. |
| `effectKind` | Stable presentation effect identifier returned with the result. |

All ratios and multipliers are finite values from `0` through `1`. Unknown modes, invalid ratios, negative radius/damage, duplicate target IDs, and unknown target domains fail before a partial result is returned.

## Resolution order

1. Normalize targets and sort them by stable string ID; caller array order never changes damage order.
2. Measure distance from the impact point to the nearest point of each target footprint using `collisionRadius`.
3. Reject targets strictly outside the outer radius. A target exactly on the boundary is eligible.
4. Apply friendly-fire mode. Disabled friendly fire rejects allied targets.
5. Apply structure-damage mode for the `structure` target domain.
6. Resolve full damage inside `innerRadiusRatio`, then apply the selected curve outside it.
7. Clamp distance falloff to `minimumDamageRatio`.
8. Multiply base damage by falloff, friendly-fire, and structure multipliers.
9. Return immutable applications and skipped reasons. No target hit points are mutated by the policy.

The minimum ratio is a distance-falloff floor, not a final-damage floor. Friendly-fire and structure multipliers apply after it and may reduce final damage below that ratio.

## Boundary rules

- Radius `0` behaves as point splash: only a footprint touching the impact point is eligible.
- Collision radius reduces measured distance but never below zero.
- `innerRadiusRatio: 1` makes every eligible target receive full falloff damage.
- `minimumDamageRatio: 0` allows damage to reach zero at the outer boundary.
- Disabled friendly fire and disabled structure damage reject targets instead of returning zero-damage applications.

## Verification

Focused coverage is in `tests/combat/area-damage-policy.test.mjs` and includes:

- policy validation and immutability;
- inner, middle, exact-boundary, and outside-radius falloff;
- footprint-aware distance;
- disabled, full, and scaled friendly fire;
- disabled, full, and scaled structure damage;
- deterministic ID ordering and duplicate rejection;
- zero-radius impacts;
- presentation-safe effect ownership without live target references.
