# Technology graph contract

Buildings and upgrades are technology nodes. Their collection keys are stable node IDs.

- `requires`: prerequisite node IDs. New content uses an array; legacy upgrade scalar values remain accepted during migration.
- `factions`: factions allowed to access the node. An empty array means unrestricted.
- `missionLocks`: missions in which the node is disabled. An empty array means no mission restriction.
- `exclusiveGroup`: a non-empty group ID for mutually exclusive choices. A group must contain at least two nodes.
- `techRoot`: explicitly marks a root. Nodes without prerequisites are also treated as roots for backward compatibility.
- mission `availableTech` and `lockedTech`: optional node lists; the same node cannot appear in both.

`node scripts/verify-tech-graph.test.mjs` runs focused invalid-graph fixtures. `node scripts/verify-tech-content.mjs` validates production content. Both run through `bash verify.sh`.

Validation rejects missing references, unknown factions or missions, prerequisite cycles, unreachable nodes, malformed or singleton exclusive groups, and contradictory mission availability. This task defines the graph only; timed research, queue contention, stat modifiers, UI presentation, and balance remain owned by later tasks.
