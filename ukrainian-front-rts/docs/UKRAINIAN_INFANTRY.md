# Ukrainian infantry branch

## Purpose and ownership

UFR-071 implements the Ukrainian infantry and close-support branch defined by the UFR-069 Networked Maneuver doctrine and the stable UFR-070 technology-tree IDs. The executable owner is `src/content/ukrainian-infantry.js`.

The module is declarative and browser-independent. It defines initial roster statistics, weapons, capabilities, counter domains, vulnerabilities, support relationships, unlock resolution, and a pure task-group summary. It does not install units into the current prototype runtime, mutate `src/config.js`, or implement another combat, healing, air-defense, repair, AI, input, UI, or rendering authority.

Later composition work may adapt these records into runtime entities through the authoritative systems already assigned by the queue. UFR-066 and UFR-149 retain broad balance-number ownership. UFR-110 retains Ukrainian infantry art. UFR-074 retains artillery, rocket, and wider air-defense network integration.

## Contract

The branch has schema version `1`, faction `ukraine`, and doctrine `networked-maneuver`. It contains exactly seven records and uses the corresponding UFR-070 stable roster IDs:

| Role | Stable ID | Producer | Tactical purpose |
| --- | --- | --- | --- |
| Engineer | `ua.combat-engineers` | `ua.command-post` | Construction, field repair, route and obstacle work. |
| Line infantry | `ua.line-infantry` | `ua.infantry-center` | Terrain contest, screening, cover discipline, and local suppression. |
| Anti-armor | `ua.anti-armor-team` | `ua.infantry-center` | Prepared armor denial with limited guided ammunition and displacement. |
| Reconnaissance | `ua.recon-team` | `ua.infantry-center` | Low-signature observation, contact quality, and forward observer links. |
| Medical | `ua.casevac-team` | `ua.infantry-center` | Casualty stabilization, evacuation, and premium-force preservation. |
| Air defense | `ua.mobile-sam` | `ua.air-defense-site` | Mobile short-range drone and low-altitude protection for dispersed groups. |
| Command support | `ua.command-team` | `ua.command-post` | Distributed command links, shared spotting, and support routing. |

Every record repeats its UFR-070 tier, producer, and ordered prerequisites. `validateUkrainianInfantryBranch()` rejects drift from those values, missing/duplicate roles, unknown IDs, invalid statistics, malformed weapons, duplicate capabilities, unknown support links, and missing counterplay.

## Air-defense boundary

The queue requires an air-defense role in UFR-071 while UFR-070 exposes `ua.mobile-sam` as the stable Ukrainian air-defense roster node. UFR-071 therefore defines that node as a mobile short-range air-defense section suitable for infantry task groups: limited missiles, setup time, air search, target reservation, silent watch, and high ground vulnerability.

This does not absorb the UFR-074 fires branch. UFR-074 may add mortar, artillery, rocket, ammunition, spotting, counter-battery, and wider layered-air-defense interactions while consuming this stable short-range profile rather than redefining its infantry-task-group role.

## Networked Maneuver implementation

The branch avoids a mirrored seven-unit checklist by giving each role a different decision pattern and exploitable dependency.

### Combat Engineers

Combat Engineers are the opening worker/support section. They construct base and field-defense families, repair vehicles and structures up to a field limit, and clear mines or barriers. Their small-arms profile is defensive. They should open routes and preserve assets, not substitute for line infantry or assault engineers.

### Mechanized Squad

The line squad is the branch's screen. It combines ordinary small arms, scarce grenade ammunition, cover discipline, local suppression, and rapid dismount readiness. It contests terrain and protects specialists, but remains vulnerable to armor and sustained suppression.

### Anti-Armor Team

The anti-armor team establishes temporary denial lanes. Its guided shaped-charge weapon has minimum range, limited ammunition, setup time, and high reload. Prepared ambush and contact-quality bonuses reward observation and positioning; suppression and close infantry attacks remain direct counters.

### Recon Team

The Recon Team has the branch's highest sight and lowest signature. It creates bounded contact quality, shares observer links, and can enter emission control at the cost of weapon use. It enables precision action but is deliberately fragile and cannot hold terrain alone.

### CASEVAC Team

The CASEVAC Team stabilizes casualties, accelerates suppression recovery, extracts critically damaged squads, and prioritizes premium specialists. Its weapon is strictly defensive. The role converts timely withdrawal into force preservation rather than granting passive regeneration during any engagement.

### Mobile SHORAD

Mobile SHORAD detects and engages drones and low-altitude targets. Its missile profile is air-only, ammunition-limited, and constrained by setup and minimum range. Engagement reservation prevents wasteful overkill. Silent watch lowers signature but also reduces detection and blocks fire. Armor, fortifications, and ground attack remain effective counters.

### Distributed Command Team

The Command Team synchronizes several small groups through bounded command range and group count. It lowers retask delays, shares a minimum contact quality only when an observer exists, and improves reinforcement/recovery routing. It is not a global aura, does not create information without reconnaissance, and is a high-signature target.

## Data fields

Each unit record contains:

- identity, role, display names, tier, producer, and prerequisites;
- squad size, command-capacity cost, and initial resource cost;
- hit points, soft/light armor classification, and suppression resistance;
- movement speed, transport slots, setup time, sight, signature, and preferred stance;
- one or more weapon profiles with damage class, target domains, range, minimum range, damage, reload, and optional ammunition;
- at least three named capabilities with immutable parameters;
- explicit counter and vulnerability domains;
- support links to other records in this branch;
- concise player-use guidance.

These values are an initial roster baseline for implementation and deterministic tests. They are not a final balance freeze.

## Unlock resolution

`availableUkrainianInfantryUnits(completedNodeIds)` returns branch IDs whose complete ordered UFR-070 prerequisite sets are present.

Examples:

- `ua.command-post` unlocks Combat Engineers and Command Team;
- adding `ua.infantry-center` unlocks line infantry, anti-armor, and CASEVAC;
- Recon Team also requires `ua.distributed-c2`;
- Mobile SHORAD requires both `ua.air-defense-site` and `ua.layered-air-defense`.

The helper is deterministic, preserves branch order, does not mutate the completed-node list, and does not independently complete technology nodes.

## Task-group summary

`summarizeUkrainianInfantryTaskGroup(unitIds)` produces a deeply frozen, reference-free summary for future UI, AI, campaign, and balance consumers. It reports role coverage, counter coverage, capabilities, capacity cost, support-link density, and four explicit doctrine checks:

- `distributedCommand` requires Command Team;
- `contactToAction` requires both command and reconnaissance;
- `casualtyPreservation` requires medical and line infantry;
- `combinedArmsReady` requires command, reconnaissance, line infantry, and an armor counter.

These checks are descriptors, not hidden stat bonuses. A later authoritative system must decide whether and how a described relationship affects simulation state.

## Verification

Focused coverage in `tests/content/ukrainian-infantry.test.mjs` verifies:

- exact seven-role and seven-ID coverage;
- UFR-070 tier, producer, and prerequisite alignment;
- distinct capability sets and readable vulnerabilities;
- deterministic unlock resolution;
- task-group doctrine summaries without global bonuses;
- immutable output;
- actionable validation failures and explicit input errors.
