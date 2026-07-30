# Ukrainian mobility and armor branch

## Purpose

UFR-072 defines the declarative Ukrainian vehicle-family contract used by later runtime, AI, art, balance, and campaign work. It completes the Networked Maneuver mobility/armor branch without changing the current browser roster or duplicating the authoritative transport, repair, combat, and tech-tree policies.

The executable contract is `src/content/ukrainian-vehicles.js`. Focused coverage is in `tests/content/ukrainian-vehicles.test.mjs`.

## Ownership and boundaries

- UFR-070 remains the authority for stable roster node IDs, tiers, producers, and prerequisite ordering.
- UFR-026 remains the authority for embark/disembark atomicity, blocked-exit behavior, and transport-destruction casualties.
- UFR-043 remains the authority for repair legality, costs, cooperation, field-repair caps, and AI repair priority.
- UFR-031 remains the authority for damage, armor, resistance, splash, and target-domain identifiers.
- This module owns Ukrainian vehicle profiles, variant identity beneath roster nodes, role differentiation, explicit counterplay, support links, deterministic availability, and task-group summaries.
- Current runtime composition, `src/config.js`, simulation phases, input, UI, rendering, audio, maps, and balance integration are intentionally unchanged.

## Stable unlock mapping

| UFR-070 roster node | Platform variant | Role | Tier | Producer |
| --- | --- | --- | --- | --- |
| `ua.protected-mobility` | `ua.protected-mobility.apc` | protected transport | 1 | `ua.motor-pool` |
| `ua.protected-mobility` | `ua.protected-mobility.ifv` | infantry fighting vehicle | 1 | `ua.motor-pool` |
| `ua.tank` | `ua.tank.main-battle` | main battle tank | 2 | `ua.motor-pool` |
| `ua.recovery-vehicle` | `ua.recovery-vehicle.armored-recovery` | armored recovery | 2 | `ua.motor-pool` |
| `ua.breaching-section` | `ua.breaching-section.engineering-vehicle` | combat engineering vehicle | 2 | `ua.engineer-park` |

The two protected-mobility variants intentionally share one UFR-070 roster unlock. This supplies distinct transport and IFV battlefield choices without changing the frozen tech-tree node set or inventing a second producer. Runtime integration may expose those variants as a production choice, mission override, or faction loadout, but must preserve the roster-node relationship.

## Role design

### Protected carrier

The carrier maximizes protected lift and road mobility. It has the largest passenger capacity, limited direct fire, smoke, and explicit vulnerability to armor and mines. Its purpose is moving infantry safely, not replacing an IFV.

### Infantry fighting vehicle

The IFV trades passenger capacity and cost for an autocannon, better armor, optics, and a fighting-dismount screen. It counters infantry and light vehicles but must hand heavy armor to tanks or anti-armor teams.

### Main battle tank

The tank provides premium direct fire against armor and fortifications. Shared contacts, hull-down use, reverse disengagement, and recovery support express Networked Maneuver doctrine. Drones, mines, and fires punish unsupported concentration.

### Armored recovery vehicle

The recovery vehicle restores disabled platforms, provides bounded field-repair support, and extracts damaged vehicles under pressure. It is a preservation asset, not a hidden global repair bonus or frontline tank.

### Combat engineering vehicle

The engineering vehicle opens marked lanes through mines, obstacles, and fortifications. It is slow, conspicuous, and dependent on tanks and recovery support. Its breaching effects are declarative integration hooks for UFR-048, navigation, and mission scripting owners.

## Transport and repair contracts

Transport profiles declare passenger capacity, timings, accepted passenger domains, `retain-cargo` blocked-exit policy, and `catastrophic-loss` destruction policy. These values describe content intent; UFR-026 continues to execute authoritative embark, disembark, blocked placement, cargo removal, and destruction outcomes.

Every vehicle declares repairability, recovery eligibility, and a field-repair cap. UFR-043 remains authoritative for whether a repair order is legal, how resources are spent, how multiple repairers combine, and how repair facilities differ from field work.

## Counterplay and support links

The branch uses explicit counter domains rather than hidden faction modifiers:

- protected lift is vulnerable to armor and mines;
- IFVs defeat infantry and light vehicles but lose to heavy armor and indirect fires;
- tanks defeat armor and fortifications but are exposed to drones, mines, and fires;
- recovery vehicles preserve logistics but are poor combat investments;
- engineering vehicles defeat obstacles and fortifications but are slow, visible, and vulnerable to armor and drones.

Support links are descriptive composition relationships. They do not apply passive bonuses. `summarizeUkrainianVehicleTaskGroup` reports role coverage, transport capacity, counter coverage, and doctrine readiness as immutable inspection data for tests, AI planning, UI previews, and future balance tools.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/content/ukrainian-vehicles.js
node --check tests/content/ukrainian-vehicles.test.mjs
node --test tests/content/ukrainian-vehicles.test.mjs
bash verify.sh
```

Because this task is declarative and is not wired into the current runtime, browser mission interaction checks are not directly affected. Later runtime integration must repeat transport, repair, production, selection, command, minimap, zoom, and WASD verification.
