# Content validation

Run `node scripts/verify-content.mjs` for production content and
`node scripts/content-validator.test.mjs` for focused success/failure fixtures. Both are included in
`bash verify.sh`.

The validator reports path-qualified errors for:

- missing faction, unit, ability, region, mission-hero, and technology references;
- unknown, non-finite, or negative resource costs;
- building/upgrade technology ID collisions;
- malformed, duplicate, self-referential, missing, and circular technology prerequisites;
- unknown faction restrictions and mission locks;
- invalid or undersized mutually exclusive groups and impossible prerequisite combinations;
- technology nodes unreachable for a faction because required nodes are faction-incompatible;
- mission technology declared available while locked, faction-incompatible, or unreachable after locks;
- objectives outside the implemented vocabulary and objective/config contradictions;
- duplicate ability hotkeys within one unit command card.

Buildings and upgrades share the virtual `tech-nodes` namespace. `requires` is canonically a string
array; a single upgrade/building prerequisite string is temporarily accepted for legacy configuration
compatibility. Nodes without prerequisites are implicit roots. `techRoot: true` documents an explicit
root and cannot be combined with prerequisites.

An empty `factions` list means unrestricted. An empty `availableTech` mission list makes no explicit
mission reachability assertion. Node `missionLocks` and mission `lockedTech` both block a node.
`exclusiveGroup` names a choice set; every declared group must contain at least two nodes, and one node
cannot require multiple choices from the same group.

Hotkeys are scoped to a selected unit's command card. Reusing a key on unrelated units is valid.
Runtime-only legacy abilities are temporarily allow-listed in `scripts/content-validator.mjs`; remove
entries as those abilities become full `ABILITIES` records. This compatibility list does not permit
unknown new ability IDs.

When adding content, run the focused validator test first, then the production verifier and full
verification command. New objective forms require both runtime evaluation support and a validator rule
or data-driven objective schema; adding display text alone is rejected as impossible content.
