# Fields of Resolve content schema v1

## Purpose

`src/content-schema.js` is the executable contract for declarative content stored in or beside
`src/config.js`. It defines identity, required fields, defaults, references, and compatibility rules
for the eight content families used by the implementation queue:

- factions;
- units;
- buildings;
- abilities;
- upgrades;
- missions;
- maps;
- AI profiles.

The schema describes content shape. It does not implement map loading, AI behavior, mission triggers,
or cross-reference validation; those remain assigned to later queue tasks.

## Version and compatibility policy

The current schema version is `1`. Every family carries the same explicit version.

A change is compatible within v1 when it only:

- adds an optional field with an explicit default;
- broadens documentation without changing runtime meaning;
- adds a reference or numeric constraint that existing valid content already satisfies;
- adds a new content record using the existing contract.

Increment the schema version when a change:

- adds a required field to existing records;
- removes or renames a field;
- changes a field type or identity source;
- changes the meaning of an existing value;
- changes a default in a way that alters existing content behavior.

A breaking version must include a migration plan before saves, replays, editors, or external content
packs depend on the schema.

All v1 families set `allowExtensions: true`. Feature tasks may add task-specific fields without
silently making them part of the stable baseline. A later schema task must promote widely used
extensions into documented required or defaulted fields.

## Identity and collection rules

A `record` collection is an object keyed by stable content ID. A collection-key identity means the
registry key is the canonical ID even when the stored value has no `id` property.

An `array` collection stores its stable ID in a required field.

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

References are string IDs. Fields that contain multiple references use string arrays. The future
content validator must report missing targets and cycles with the source family, source ID, and field.

## Required and defaulted fields

`applyContentDefaults(family, value)` returns a new object and fills only absent optional fields.
It does not mutate source content, validate required fields, or overwrite explicitly supplied falsy
values. Array and object defaults are cloned for every call.

### Factions

Required:

- `id: string`
- `name: string`
- `short: string`
- `primary: color`
- `secondary: color`
- `marking: string`

Defaults:

- `description = ""`
- `playable = true`
- `aiProfile = null` — optional reference to an AI profile

### Units

The collection key is the unit ID.

Required:

- `faction: string` — faction reference
- `archetype: string`
- `name: string`
- `short: string`
- `role: string`
- `hp: number >= 0`
- `speed: number >= 0`
- `range: number >= 0`
- `damage: number >= 0`
- `rate: number > 0`
- `sight: number >= 0`
- `cost: resource-cost`
- `pop: number >= 0`
- `size: number > 0`
- `visual: string`
- `abilities: string[]` — ability references

Defaults:

- `title = null`
- `worker = false`
- `air = false`
- `medic = false`
- `armor = false`
- `vehicleClass = null`
- `hero = false`

### Buildings

The collection key is the building ID.

Required:

- `name: string`
- `desc: string`
- `hp: number > 0`
- `w: number > 0`
- `h: number > 0`
- `sight: number >= 0`

Defaults:

- `ruName = null`
- `pop = 0`
- `cost = {}`
- `buildTime = 0`
- `produces = []` — unit references

A zero build time documents the current immediate/non-constructible fallback. Construction tasks may
add stronger production rules as compatible optional fields or through a later schema version.

### Abilities

The collection key is the ability ID.

Required:

- `name: string`
- `key: string`
- `desc: string`

Defaults:

- `cooldown = 0`
- `target = "none"`
- `range = 0`
- `radius = 0`
- `cost = {}`

These defaults describe metadata only. Ability execution remains authoritative in simulation systems
until a later task defines a data-driven effect contract.

### Upgrades

The collection key is the upgrade ID.

Required:

- `name: string`
- `tier: integer >= 0`
- `applies: string[]`
- `cost: resource-cost`
- `desc: string`
- `mods: modifier-map`

Defaults:

- `requires = null` — optional upgrade reference
- `researchTime = 0`

A zero research time preserves the current immediate-research behavior.

### Missions

Required:

- `id: string`
- `region: string`
- `title: string`
- `story: string`
- `objectives: string[]`
- `start: resource-state`
- `heroes: string[]` — unit references
- `trainableHeroes: string[]` — unit references
- `enemyHeroes: string[]` — unit references
- `waves: wave-policy`

Defaults:

- `map = null` — current hard-coded battlefield fallback
- `playerFaction = "ukraine"`
- `enemyFaction = "russia"`
- `aiProfile = null`
- `briefing = []`
- `debriefing = []`
- `triggers = []`

The `objectives` field remains presentation text in v1. Later campaign/objective tasks may add
structured objective records without changing the meaning of this field in existing missions.

### Maps

Required:

- `id: string`
- `name: string`
- `width: number > 0`
- `height: number > 0`
- `tileSize: number > 0`
- `terrain: terrain-data`
- `spawns: spawn-map`

Defaults:

- `resources = []`
- `roads = []`
- `blockers = []`
- `decorations = []`
- `metadata = {}`

`terrain-data` and `spawn-map` are deliberately opaque v1 payload types. UFR-018 and the authored-map
tasks own their concrete tile, movement-layer, footprint, and spawn semantics.

Example shape:

```js
{
  id: 'donbas-crossing',
  name: 'Siverskyi Donets Crossing',
  width: 2560,
  height: 1664,
  tileSize: 32,
  terrain: { encoding: 'rows', rows: [] },
  spawns: { player: [], enemy: [] },
}
```

### AI profiles

Required:

- `id: string`
- `name: string`

Defaults:

- `faction = null`
- `difficulty = "normal"`
- `scouting = {}`
- `economy = {}`
- `production = {}`
- `combat = {}`
- `missionOverrides = {}`

The policy objects are versioned extension bags, not implemented behavior. AI tasks must document
their owned keys and promote stable cross-profile keys into a future schema revision when necessary.

Example shape:

```js
{
  id: 'wave-default',
  name: 'Default assault-wave profile',
  faction: 'russia',
  combat: { aggression: 1 },
}
```

## Shared payload types

The v1 descriptors use named payload types so later validators can centralize their detailed rules:

- `color` — a renderer-compatible color string;
- `resource-cost` — non-negative resource amounts keyed by resource ID;
- `resource-state` — mission starting resource values;
- `modifier-map` — numeric or policy modifiers keyed by stat/rule ID;
- `wave-policy` — mission wave timing and cap data;
- `terrain-data` — authored or generated terrain payload;
- `spawn-map` — named spawn groups and placement data;
- `point[][]` — one or more ordered paths;
- `object[]` / `object` — extension payloads whose stable keys are owned by later tasks.

## Extension workflow

1. Identify the owning family and whether the change is compatible within v1.
2. Add an explicit default for every new optional field.
3. Add required/reference/range metadata to `src/content-schema.js`.
4. Update this document with the field and its runtime owner.
5. Run `bash verify.sh`.
6. Leave cross-record validation and migration behavior in their dedicated queue tasks unless the
   current task explicitly owns them.
