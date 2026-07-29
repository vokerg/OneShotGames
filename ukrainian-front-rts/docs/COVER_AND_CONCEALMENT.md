# Cover and concealment

UFR-034 introduces an authoritative, deterministic modifier policy for terrain and fortifications.

## Levels

| Level | Accuracy multiplier | Damage multiplier | Source |
| --- | ---: | ---: | --- |
| exposed | 1.00 | 1.00 | open ground |
| concealed | 0.82 | 1.00 | concealment terrain |
| light | 0.88 | 0.90 | rough/rubble terrain |
| heavy | 0.70 | 0.72 | explicit fortification state |

Terrain values are sampled at the target position when a projectile is prepared. An explicit `coverLevel` or `fortificationCover` on the target overrides terrain. The resolved state is stored on `target.coverState`, `projectile.coverState`, and the impact effect so HUD and renderer consumers can present the same authoritative result without reimplementing combat policy.

Cover affects projectile hit probability and direct impact damage exactly once. It does not alter weapon base statistics, line-of-sight ownership, splash policy, suppression, or morale.
