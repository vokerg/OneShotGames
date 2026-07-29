# Fields of Resolve content schema v1

## Purpose

`src/content-schema.js` is the executable contract for declarative content stored in or beside
`src/config.js`. It defines identity, required fields, defaults, references, and compatibility rules
for factions, units, buildings, abilities, upgrades, missions, maps, and AI profiles.

The schema describes content shape. General cross-record validation is implemented by
`scripts/content-validator.mjs`, while shared building/upgrade technology validation is implemented by
`scripts/verify-tech-graph.mjs`. Runtime production, research, campaign, and mission-lock behavior
remains owned by the queue tasks that implement those systems.

## Version and compatibility policy

The current schema version is `1`. Every family carries the same explicit version.

A change is compatible within v1 when it only:

- adds an optional field with an explicit default;
- broadens documentation without changing runtime meaning;
- adds a reference or numeric constraint that existing valid content already satisfies;
- adds a new content record using the existing contract.

Increment the schema version when a change adds a required field to existing records, removes or
renames a field, changes a type or identity source, changes an existing value's meaning, or changes a
default in a way that alters existing content behavior.

All v1 families set `allowExtensions: true`. Feature tasks may add task-owned fields without silently
making them part of the stable baseline. Stable additions must be promoted into this contract and
human-readable document.

## Identity and collection rules

A `record` collection is an object keyed by stable content ID. A collection-key identity means the
registry key is the canonical ID even when the value has no `id` property. An `array` collection stores
its stable ID in a required field.

| Family | Collection | Canonical identity |
| --- | --- | --- |
| factions | record | required `id` field |
| units | record | collection key |
| buildings | record | collection key |
| abilities | record | collection key |
| upgrades | record | collection key |
| missions | array | required `id` field |
| maps | record | required `id` field |
| AI profiles | record | required `id` field |

References are string IDs. Fields containing multiple references use string arrays. The virtual
`tech-nodes` reference target is the union of building and upgrade collection keys; those IDs share one
namespace and therefore must not collide.

## Defaults

`applyContentDefaults(family, value)` returns a new object and fills only absent optional fields. It
does not mutate source content, validate required fields, or overwrite explicitly supplied falsy
values. Array and object defaults are cloned for every call.

## Family contracts

### Factions

Required: `id`, `name`, `short`, `primary`, `secondary`, and `marking`.

Defaults:

- `description = ""`;
- `playable = true`;
- `aiProfile = null`, optionally referencing an AI profile.

### Units

The collection key is the unit ID.

Required: `faction`, `archetype`, `name`, `short`, `role`, `hp`, `speed`, `range`, `damage`, `rate`,
`sight`, `cost`, `pop`, `size`, `visual`, and `abilities`.

Numeric constraints: `hp`, `speed`, `range`, `damage`, `sight`, and `pop` are non-negative; `rate` and
`size` are greater than zero. `faction` references factions and `abilities` references abilities.

Defaults: `title = null`, `worker = false`, `air = false`, `medic = false`, `armor = false`,
`vehicleClass = null`, and `hero = false`.

### Buildings

The collection key is both the building ID and its technology-node ID.

Required: `name`, `desc`, `hp`, `w`, `h`, and `sight`.

Defaults:

- `ruName = null`;
- `pop = 0`;
- `cost = {}`;
- `buildTime = 0`;
- `produces = []`, referencing units;
- `requires = []`, referencing building or upgrade tech nodes;
- `factions = []`, meaning unrestricted;
- `missionLocks = []`, referencing missions where the node is unavailable;
- `exclusiveGroup = null`, meaning the node is not a mutually exclusive choice;
- `techRoot = false`.

The canonical prerequisite representation is a string array. A single legacy string remains accepted
while existing runtime content is migrated.

### Abilities

The collection key is the ability ID. Required: `name`, `key`, and `desc`.

Defaults: `cooldown = 0`, `target = "none"`, `range = 0`, `radius = 0`, and `cost = {}`.

These defaults describe metadata only. Ability execution remains authoritative in simulation systems.

### Upgrades

The collection key is both the upgrade ID and its technology-node ID.

Required: `name`, `tier`, `applies`, `cost`, `desc`, and `mods`. `tier` is a non-negative integer.

Defaults:

- `requires = []`, referencing building or upgrade tech nodes;
- `factions = []`, meaning unrestricted;
- `missionLocks = []`, referencing missions where the node is unavailable;
- `exclusiveGroup = null`;
- `techRoot = false`;
- `researchTime = 0`.

The canonical prerequisite representation is a string array. A single legacy string remains accepted
for compatibility with the current configuration. A zero research time preserves immediate-research
behavior until the research-system task owns execution.

### Missions

Required: `id`, `region`, `title`, `story`, `objectives`, `start`, `heroes`, `trainableHeroes`,
`enemyHeroes`, and `waves`.

Defaults:

- `map = null`;
- `playerFaction = "ukraine"`;
- `enemyFaction = "russia"`;
- `aiProfile = null`;
- `availableTech = []`;
- `lockedTech = []`;
- `briefing = []`;
- `debriefing = []`;
- `triggers = []`.

`availableTech` lists technology nodes a mission explicitly expects to be reachable. The validator
checks those nodes against faction restrictions, node-level mission locks, mission `lockedTech`, and
prerequisite closure. An empty list makes no explicit reachability assertion. `lockedTech` always blocks
the listed nodes for that mission.

The `objectives` field remains presentation text in v1. Later campaign/objective tasks may add structured
records without changing existing objective text.

### Maps

Required: `id`, `name`, `width`, `height`, `tileSize`, `terrain`, and `spawns`. Dimensions and tile size
must be greater than zero.

Defaults: `resources = []`, `roads = []`, `blockers = []`, `decorations = []`, and `metadata = {}`.

`terrain-data` and `spawn-map` are opaque v1 payloads. Navigation and authored-map tasks own their
concrete semantics.

### AI profiles

Required: `id` and `name`.

Defaults: `faction = null`, `difficulty = "normal"`, `scouting = {}`, `economy = {}`,
`production = {}`, `combat = {}`, and `missionOverrides = {}`.

Policy objects are versioned extension bags, not implemented behavior.

## Technology graph contract

Buildings and upgrades form one directed graph. Each node may declare:

- `requires`: prerequisite tech-node IDs;
- `factions`: factions allowed to use the node; an empty list means all factions;
- `missionLocks`: missions where the node is blocked;
- `exclusiveGroup`: a named set of mutually exclusive choices;
- `techRoot`: an explicit root marker for documentation and future presentation.

Nodes with no prerequisites are implicit roots for v1 compatibility. An explicit `techRoot` may not
also declare prerequisites. The validator rejects:

- building/upgrade ID collisions;
- missing, duplicate, self, or circular prerequisite references;
- unknown faction or mission references;
- single-member exclusivity groups;
- a node requiring two choices from the same exclusivity group, directly or transitively;
- a node requiring a member of its own exclusivity group;
- faction-visible nodes that cannot be reached through faction-compatible prerequisites;
- mission `availableTech` entries blocked or made unreachable by mission/faction restrictions.

This contract validates declarative possibility. It does not execute research, consume resources,
apply upgrades, serialize progression, or change command-card availability.

## Shared payload types

- `color`: renderer-compatible color string;
- `resource-cost`: non-negative resource amounts keyed by resource ID;
- `resource-state`: mission starting resource values;
- `modifier-map`: numeric or policy modifiers keyed by stat/rule ID;
- `wave-policy`: mission wave timing and cap data;
- `terrain-data`: authored or generated terrain payload;
- `spawn-map`: named spawn groups and placement data;
- `point[][]`: one or more ordered paths;
- `object[]` / `object`: extension payloads owned by later tasks.

## Extension workflow

1. Identify the owning family and whether the change is compatible within v1.
2. Add an explicit default for every new optional field.
3. Add required/reference/range metadata to `src/content-schema.js`.
4. Update this document and the focused validator when legal cross-record combinations change.
5. Add deterministic success and failure fixtures.
6. Run `node scripts/verify-content-schema.mjs`, `node scripts/verify-tech-graph.test.mjs`,
   `node scripts/verify-tech-content.mjs`, and `bash verify.sh`.
7. Keep runtime migration/loading/execution work in its assigned task unless explicitly included.
