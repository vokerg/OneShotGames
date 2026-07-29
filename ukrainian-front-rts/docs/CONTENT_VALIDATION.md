# Content and technology validation

Run these focused commands from `ukrainian-front-rts/`:

```bash
node scripts/content-validator.test.mjs
node scripts/verify-content.mjs
node scripts/verify-tech-graph.test.mjs
node scripts/verify-tech-content.mjs
```

All four are included in `bash verify.sh`.

## General content validation

`scripts/content-validator.mjs` reports path-qualified errors for:

- missing faction, unit, ability, upgrade, region, and mission hero references;
- unknown, non-finite, or negative resource costs;
- missing and circular legacy upgrade prerequisites;
- objectives outside the currently implemented objective vocabulary and objective/config contradictions;
- duplicate ability hotkeys within one unit command card.

Hotkeys are intentionally scoped to a selected unit's command card. Reusing a key on unrelated units is valid. Runtime-only legacy abilities are temporarily allow-listed in `scripts/content-validator.mjs`; remove entries as those abilities become full `ABILITIES` records. This compatibility list does not permit unknown new ability IDs.

## Technology graph validation

`scripts/verify-tech-graph.mjs` owns the shared building/upgrade technology graph and reports:

- building/upgrade ID collisions in the shared technology namespace;
- malformed, duplicate, missing, self-referential, or circular prerequisites;
- unknown faction restrictions and mission locks;
- invalid technology-root declarations;
- invalid or undersized mutually exclusive groups, including transitive paths that require incompatible choices;
- technology nodes unreachable for a faction because their prerequisite chain is faction-incompatible;
- mission technology that is missing, faction-incompatible, simultaneously available and locked, or unreachable after mission and node locks.

`requires` is canonically a string array. A single string remains accepted for existing building and upgrade configuration. Nodes without prerequisites are implicit roots; `techRoot: true` is an explicit root marker and cannot be combined with prerequisites.

An empty `factions` list means unrestricted. `missionLocks` on a technology node and `lockedTech` on a mission both block that node. An empty mission `availableTech` list makes no explicit reachability assertion. Every named `exclusiveGroup` must contain at least two choices, and no prerequisite closure may require multiple members of the same group.

When adding content, run the focused fixture command first, then the corresponding production verifier and `bash verify.sh`. New objective forms require both runtime evaluation support and a validator rule or data-driven objective schema; adding display text alone is rejected as impossible content.
