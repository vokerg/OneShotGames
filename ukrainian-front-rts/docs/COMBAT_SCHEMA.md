# Combat schema and counter matrix

`src/combat/combat-schema.js` is the authoritative versioned contract for damage, armor, target-domain, splash, penetration, and resistance classification. UFR-031 defines data semantics only; projectile resolution, accuracy, line of sight, targeting AI, and balance tuning belong to later tasks.

## Rules

- Every weapon profile declares one damage class, at least one target domain, one splash class, and optional normalized penetration.
- Every damageable entity declares one armor class and one resistance class.
- A weapon that does not include the target domain resolves to a zero multiplier.
- The penetration matrix supplies the baseline class matchup. Resistance and optional penetration multiply that result.
- Consumers must use the exported constructors and validators rather than inventing new string literals.
- Schema changes require incrementing `COMBAT_SCHEMA_VERSION` and migration notes for saved or replayed content once those systems exist.

## Counter matrix

Values are relative effectiveness multipliers, not final balance numbers.

| Damage class | Soft | Light | Medium | Heavy | Structure | Intended role |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| small arms | 1.00 | 0.35 | 0.08 | 0.02 | 0.20 | Infantry and exposed crews |
| heavy machine gun | 1.00 | 0.70 | 0.22 | 0.08 | 0.30 | Infantry, light vehicles, suppression |
| autocannon | 1.10 | 1.00 | 0.65 | 0.30 | 0.55 | Infantry and light/medium vehicles |
| shaped charge | 0.80 | 1.15 | 1.10 | 1.00 | 0.75 | Anti-vehicle guided or handheld weapons |
| kinetic | 0.65 | 1.00 | 1.10 | 1.15 | 0.65 | Tank guns and direct armor defeat |
| high explosive | 1.25 | 0.80 | 0.50 | 0.28 | 1.00 | Area damage and structures |
| drone strike | 0.90 | 1.10 | 1.00 | 0.80 | 0.75 | Precision top-attack profile |

## Target domains

- `ground`: infantry and ground vehicles.
- `air`: drones and future aircraft.
- `structure`: buildings, fortifications, and static objectives.

## Splash classes

`none`, `point`, `small`, `medium`, and `large` classify effect footprint. They do not define radius or falloff; UFR-042 owns those policies.

## Resistance classes

- `none`: no additional modifier.
- `infantry`: normal dismounted target behavior.
- `vehicle`: minor systemic reduction.
- `fortified`: protected or hardened position.
- `airframe`: aerial platform durability behavior.
