# Mission scripting

`src/systems/mission-script-system.js` owns the deterministic trigger/action contract introduced by UFR-086. Mission content remains declarative; the system validates and executes it during the existing fixed-step objectives phase.

## Mission data entry points

A mission may provide an explicit script:

```js
{
  id: 'operation-id',
  objectiveMode: 'scripted',
  objectiveIds: ['secure-crossing', 'extract'],
  script: {
    version: 1,
    id: 'operation-id.script',
    regions: [
      { id: 'crossing', shape: 'rect', x: 640, y: 420, width: 240, height: 160 },
      { id: 'reserve-spawn', shape: 'circle', x: 180, y: 1320, radius: 80 },
    ],
    initialVariables: { phase: 0 },
    triggers: [],
  },
}
```

For compatibility with the existing optional mission `triggers` field, the runtime also accepts:

```js
{
  id: 'operation-id',
  regions: [...],
  scriptVariables: {...},
  triggers: [...],
}
```

That form is wrapped as script version 1 with ID `<mission-id>.script`.

`objectiveMode` defaults to legacy behavior. Set it to `scripted` only when trigger actions own objective completion. Legacy missions continue to call their existing objective updater after mission-script evaluation.

## Trigger contract

Each trigger has:

- a stable unique `id`;
- one `when` condition;
- one or more ordered `actions`;
- `enabled`, defaulting to `true`;
- `once`, defaulting to `true`;
- optional `maxActivations`;
- optional `cooldownTicks`;
- optional trigger-wide `delayTicks`.

Example:

```js
{
  id: 'reinforce-after-crossing',
  once: true,
  when: {
    kind: 'region',
    regionId: 'crossing',
    event: 'enter',
    selector: { collection: 'units', team: 0 },
    operator: 'gte',
    value: 2,
  },
  actions: [
    {
      kind: 'dialogue',
      speaker: 'command',
      text: 'The crossing is secure. Reserve elements are moving.',
      durationSeconds: 5,
    },
    {
      kind: 'reinforcement',
      team: 0,
      label: 'mechanized-reserve',
      delayTicks: 30,
      entities: [
        {
          kind: 'unit',
          type: 'uaInfantry',
          count: 3,
          regionId: 'reserve-spawn',
          spacingX: 24,
          scriptIdPrefix: 'reserve-infantry',
          tag: 'reserve',
        },
      ],
    },
  ],
}
```

Triggers are evaluated in declaration order against the same pre-action state for that tick. All due actions execute afterward in due-tick and stable sequence order. An action cannot create an accidental same-tick cascade into another trigger.

Repeating triggers may fire every eligible tick or use `cooldownTicks`. Trigger control actions take effect after evaluation, so an enabled trigger is first eligible on the next fixed tick.

## Condition kinds

### Composition

- `all`: every child condition must be true.
- `any`: at least one child condition must be true.
- `not`: negates one child condition.

All children are evaluated deterministically; composition does not skip transition bookkeeping.

### Timer

```js
{ kind: 'timer', clock: 'seconds', operator: 'gte', value: 45 }
{ kind: 'timer', clock: 'ticks', operator: 'gte', value: 900 }
```

Mission seconds use authoritative `game.time`. Script ticks count objective-phase executions.

### Region

```js
{
  kind: 'region',
  regionId: 'crossing',
  event: 'enter', // present | enter | exit
  selector: {
    collection: 'units', // units | buildings | entities
    team: 0,
    type: 'uaInfantry',
    tag: 'assault-group',
  },
  state: 'alive', // exists | alive | completed
  operator: 'gte',
  value: 1,
}
```

Regions support rectangles and circles. Entry and exit conditions compare current occupancy with the previous fixed tick.

### Entity

Entity selectors support runtime `id`, authored `scriptId`, `type`, `team`, `tag`, and collection. Entity states are:

- `exists`;
- `alive`;
- `destroyed`;
- `damaged`;
- `underConstruction`;
- `completed`.

A `destroyed` condition requires `id` or `scriptId`. The script state records observed identities so an absent entity is not mistaken for one that never existed.

### Resource

```js
{ kind: 'resource', resource: 'intel', operator: 'gte', value: 250 }
```

### Objective

```js
{ kind: 'objective', id: 'secure-crossing', state: 'complete' }
{ kind: 'objective', index: 1, state: 'incomplete' }
```

ID-based objective references require a mission `objectiveIds` array aligned with `player.objectives`.

### Variable

```js
{ kind: 'variable', id: 'phase', operator: 'eq', value: 2 }
```

Variables begin with `initialVariables` and are mutated only by script actions.

Supported comparisons are `eq`, `neq`, `gt`, `gte`, `lt`, and `lte`.

## Action kinds

### State

- `setVariable`: replace a JSON-compatible script variable.
- `addVariable`: add a finite number.
- `setResource`: set a non-negative player resource.
- `addResource`: add or remove a resource, clamped at zero.
- `setObjective`: complete or reopen an objective by index or stable ID.
- `enableTrigger` / `disableTrigger`: control another validated trigger.

### Dialogue and camera

`dialogue` appends an immutable cue to `game.dialogueQueue`.

`camera` appends a renderer-neutral world-space cue to `game.cameraCues` and exposes the latest cue as `game.cameraCue`. UFR-089/UFR-092 presentation code may consume these queues; gameplay does not depend on a consumer.

### Weather

`weather` sets deterministic authoritative weather state:

```js
{
  kind: 'weather',
  weatherId: 'rain',
  intensity: 0.7,
  transitionSeconds: 3,
  durationSeconds: 90,
}
```

A finite duration expires during mission-script evaluation. `weatherId: null` clears the current scripted weather. Visual, audio, movement, or visibility consequences remain owned by their focused systems and must read this state rather than duplicate script timing.

### Reinforcements

A reinforcement action adds units or buildings through the existing `game.addUnit` and `game.addBuilding` boundaries. Spawns use explicit coordinates or a region center and deterministic linear spacing. Optional `scriptIdPrefix` and `tag` values make later entity/region conditions stable.

No random scatter is applied by the scripting layer. Any later authored random choice must use the seeded random service and document draw order.

### Outcome

`finish` resolves an explicit `victory` or `defeat` through `game.finish`. Scripted objective completion can also rely on the existing outcome phase after all objectives become complete.

## Fixed-step ownership and ordering

The authoritative phase list remains:

```text
clock → camera → units → projectiles → production → waves
      → destroyed-entity cleanup → objectives → outcome
```

Inside the objectives phase:

1. mission scripts initialize lazily for the active mission;
2. the script tick advances;
3. timed weather expiry is applied;
4. every eligible trigger is evaluated against pre-action state;
5. region transition memory is committed;
6. due actions execute in stable order;
7. legacy objective evaluation runs unless `objectiveMode === 'scripted'`;
8. the existing outcome phase resolves ordinary all-objectives victory or force-loss defeat.

This means destroyed-entity conditions observe cleanup-complete state while retaining identity history from earlier ticks.

## Runtime state and save boundaries

`game.missionScriptState` contains only deterministic, JSON-compatible runtime data:

- script and mission IDs;
- script tick and sequence;
- variables;
- per-trigger enabled/activation/cooldown state;
- delayed action queue;
- region transition state;
- observed entity and authored script identities.

`game.missionScriptRecords` is a drainable ordered diagnostic/replay log, not a domain-event stream or gameplay command bus. Dialogue and camera queues are presentation requests. Simulation outcomes remain identical when those queues are never consumed.

UFR-085 owns campaign-profile storage. UFR-090 owns checkpoint-safe mission-state restoration and must include mission script state, pending actions, weather, dialogue/camera queue policy, and record-drain policy in its snapshot contract.

## Validation and failure policy

Validation is fail-fast and path-qualified. It rejects:

- unsupported script versions;
- malformed or duplicate IDs;
- unknown condition/action kinds;
- unknown region or trigger references;
- invalid comparisons and transition modes;
- destroyed checks without stable identity;
- invalid spawn definitions;
- non-JSON variables or metadata;
- empty action lists;
- invalid cooldown, delay, count, or duration values.

Invalid authored content must fail before mission execution rather than partially mutating the game.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/mission-script-system.js
node --check src/systems/simulation-phases.js
node --check tests/campaign/mission-script-system.test.mjs
node --test tests/campaign/mission-script-system.test.mjs
bash verify.sh
```

Browser mission checks become required when an authored mission begins using script cues or actions. UFR-086 itself adds the deterministic contract and phase integration without changing existing mission content.
