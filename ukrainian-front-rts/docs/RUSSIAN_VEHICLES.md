# Russian mobility and armor branch

## Purpose

UFR-076 defines the declarative Russian vehicle-family contract used by later runtime, AI, art, balance, and campaign work. It completes the Echeloned Pressure mobility/armor branch without changing the current browser roster or duplicating authoritative transport, repair, combat, production, or technology-tree rules.

The executable contract is `src/content/russian-vehicles.js`. Focused coverage is in `tests/content/russian-vehicles.test.mjs`.

## Ownership and boundaries

- UFR-070 remains authoritative for stable roster node IDs, tiers, producers, and prerequisite ordering.
- UFR-026 remains authoritative for embark/disembark atomicity, blocked exits, cargo retention, and transport-destruction casualties.
- UFR-043 remains authoritative for repair legality, costs, contributor cooperation, field-repair caps, facility behavior, and AI repair priority.
- UFR-031 remains authoritative for damage, armor, resistance, splash, and target-domain identifiers.
- This module owns Russian vehicle variants beneath roster nodes, profile differentiation, massing descriptors, explicit counterplay, deterministic availability, and task-group summaries.
- Current runtime composition, `src/config.js`, simulation phases, input, UI, rendering, audio, missions, AI, and shared balance integration are intentionally unchanged.

## Stable unlock mapping

| UFR-070 roster node | Platform variant | Role | Tier | Producer |
| --- | --- | --- | --- | --- |
| `ru.apc` | `ru.apc-carrier` | Mass protected transport | 1 | `ru.armored-park` |
| `ru.apc` | `ru.apc-ifv` | Infantry fighting vehicle | 1 | `ru.armored-park` |
| `ru.tank` | `ru.tank-breakthrough` | Breakthrough main battle tank | 2 | `ru.armored-park` |
| `ru.repair-tractor` | `ru.repair-tractor` | Armored recovery | 2 | `ru.armored-park` |

The two `ru.apc` variants are production choices beneath one stable roster anchor. The carrier prioritizes protected seats, low unit cost, and batch massing. The IFV exchanges seats and replacement efficiency for autocannon and guided anti-armor firepower. This does not modify the UFR-070 graph or create a second technology-tree schema.

## Echeloned Pressure identity

The branch models Echeloned Pressure through explicit composition rather than a hidden faction-wide bonus:

- **Massed lift:** carriers are inexpensive relative to IFVs and are represented with a two-platform batch size.
- **Mounted fire support:** IFVs reinforce motor-rifle echelons with autocannon suppression and limited guided anti-armor ammunition.
- **Prepared breakthrough:** tanks are durable and powerful when concentrated, but impose the highest fuel burden and command load.
- **Replacement continuity:** repair tractors recover disabled vehicles and reduce recovery delay only when supported by a supply route.
- **Observable burden:** every profile exposes fuel burden, command load, production weight, replacement priority, and echelon role for later AI and balance systems.

`summarizeRussianVehicleTaskGroup` reports whether a selected formation has mass lift, mounted-echelon support, breakthrough power, recovery continuity, and all four components required for operational mass. It returns descriptors only; it does not mutate combat statistics or grant a global bonus.

## Counterplay

- Mass APC columns are vulnerable to mines, anti-armor ambushes, artillery, drones, and blocked routes.
- IFVs have useful direct fire but remain inefficient against prepared heavy armor and long-range anti-armor positions.
- Breakthrough tanks require concentration and recovery support; isolated vehicles are expensive and vulnerable to drones and shaped-charge weapons.
- Repair tractors are strategically valuable, lightly armed support assets. Destroying or separating them increases replacement pressure.
- High signatures and fuel demands make the branch dependent on reconnaissance, route security, air defense, and supply continuity.

## Transport and repair integration

Transport-capable profiles declare the UFR-026 policies `retain-cargo` for blocked exits and `catastrophic-loss` for transport destruction. These values are compatibility descriptors; runtime integration must call the existing transport system rather than reimplementing embark, disembark, placement, or casualty handling.

Repair profiles declare field caps, facility eligibility, repair-provider capability, and tow capacity. Runtime integration must consume UFR-043 for legal targets, resource costs, contributor limits, repair rates, cancellation, events, and AI prioritization.

## Verification

Focused verification for this contract:

```bash
node --check src/content/russian-vehicles.js
node --check tests/content/russian-vehicles.test.mjs
node --test tests/content/russian-vehicles.test.mjs
```

Later runtime integration must additionally run `bash verify.sh`, start affected missions, and exercise selection, movement, right-click orders, attack-move, minimap navigation, zoom, all four WASD directions, transport exits, destruction casualties, repair orders, and production unlocks.
