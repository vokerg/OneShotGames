# Russian infantry branch

## Purpose

UFR-075 defines the declarative Russian infantry-family contract used by later runtime, AI, art, balance, and campaign work. It completes the Echeloned Pressure infantry branch without changing the current browser roster or duplicating authoritative combat, suppression, repair, production, or tech-tree rules.

The executable contract is `src/content/russian-infantry.js`. Focused coverage is in `tests/content/russian-infantry.test.mjs`.

## Ownership and boundaries

- UFR-070 remains authoritative for stable roster nodes, tiers, producers, prerequisite ordering, and the `echeloned-pressure` doctrine identifier.
- UFR-031 remains authoritative for damage, armor, resistance, splash, and target-domain identifiers.
- UFR-035 remains authoritative for live suppression and morale accumulation and recovery.
- UFR-043 remains authoritative for repair legality and resource mutation.
- This module owns Russian infantry profiles, variants beneath stable roster nodes, role differentiation, replacement descriptors, counterplay, support links, deterministic availability, and task-group summaries.
- Current runtime composition, `src/config.js`, simulation phases, input, UI, rendering, audio, missions, AI planning, and shared balance values are intentionally unchanged.

## Stable unlock mapping

| UFR-070 roster node | Profile | Role | Tier | Producer |
| --- | --- | --- | --- | --- |
| `ru.engineer-sappers` | `ru.engineer-sappers` | Engineering | 0 | `ru.regimental-command` |
| `ru.command-group` | `ru.command-group` | Command support | 0 | `ru.regimental-command` |
| `ru.motor-rifle-squad` | `ru.motor-rifle-squad` | Line infantry | 1 | `ru.motor-rifle-barracks` |
| `ru.assault-group` | `ru.assault-group.shock` | Close assault | 1 | `ru.motor-rifle-barracks` |
| `ru.assault-group` | `ru.assault-group.anti-armor` | Anti-armor reserve | 1 | `ru.motor-rifle-barracks` |
| `ru.scout-section` | `ru.scout-section` | Reconnaissance | 1 | `ru.motor-rifle-barracks` |
| `ru.medical-team` | `ru.medical-team` | Medical support | 1 | `ru.motor-rifle-barracks` |

The two `ru.assault-group` profiles are explicit production variants under one stable UFR-070 roster node. They do not add a new tech-tree identity or silently change the shared schema.

## Echeloned Pressure identity

The branch expresses doctrine through bounded unit interactions rather than global bonuses:

- **Line depth:** motor-rifle squads are relatively affordable, personnel-heavy line units with favorable replacement weighting, but they remain vulnerable to armor and indirect fire.
- **Prepared assault:** shock groups tolerate suppression better at close range and exploit cleared routes; they do not replace engineers, reconnaissance, or line screens.
- **Committed anti-armor reserve:** guided anti-armor teams are strongest from prepared positions after command release and reconnaissance support. They are vulnerable when exposed or flanked.
- **Sector command:** command groups prepare a maximum of two sectors, release eligible reserves, and route replacements only while command and supply relationships exist.
- **Sufficient reconnaissance:** scout sections screen routes and register targets but do not provide perfect information or precision-strike authority.
- **Replacement continuity:** medical teams improve recovery from protected collection points and cannot sustain the formation while fighting on the front line.
- **Route preparation:** engineer-sappers clear and prepare corridors for following echelons without becoming disposable assault troops.

## Counterplay

The branch is deliberately strong when command, reconnaissance, prepared routes, reserves, line units, and casualty support remain connected. Its main weaknesses are:

- disruption of command groups and registered sectors;
- reconnaissance and indirect fire against dense prepared positions;
- flanking or suppressing exposed anti-armor teams;
- armored attacks against unsupported line infantry;
- route, depot, and replacement-path disruption;
- forcing repeated displacement before preparation completes.

No profile grants hidden stat bonuses to unrelated units. Task-group summaries only report whether the required roles and links are present; later simulation owners decide how a legal command or support effect is executed.

## Deterministic helpers

- `validateRussianInfantryBranch` reports stable, sorted validation errors.
- `getRussianInfantryUnit` resolves one immutable profile by variant ID.
- `getRussianInfantryVariants` resolves the production variants beneath a stable roster node.
- `availableRussianInfantryUnits` resolves profiles from completed UFR-070 prerequisites in branch order.
- `summarizeRussianInfantryTaskGroup` returns immutable role, counter, capability, cost, personnel, replacement-demand, reserve, and doctrine-readiness descriptors.

## Later integration

Runtime integration should consume these profiles rather than recreate their IDs or doctrine in `src/config.js`, AI code, or UI branches. UFR-076 owns Russian vehicles, UFR-077 owns Russian UAS/EW/fires/air defense, and UFR-078 owns shared support mechanics. AI planners may read the summaries but must not treat them as automatic combat modifiers.
