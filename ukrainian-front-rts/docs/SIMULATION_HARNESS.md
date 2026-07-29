# Headless simulation harness

`src/app/simulation-harness.js` provides deterministic scenario control for Node tests without creating a
DOM, canvas, renderer, UI, animation frame, or browser input adapter.

The harness is an app-layer adapter around the public `Game` facade. It does not duplicate simulation
rules. Scenario startup calls `Game.start`, commands call public `Game` methods, and tick advancement calls
`Game.update` with one configured duration.

## Create and start a scenario

```js
import { createSimulationHarness } from '../src/app/simulation-harness.js';

const harness = createSimulationHarness({
  tickSeconds: 1 / 30,
  viewport: { width: 1280, height: 720 },
  simulationSeed: 'campaign-regression',
});

const initial = harness.startScenario({ missionIndex: 0 });
```

The default game factory constructs `Game`. Tests that exercise a focused facade or future alternate game
construction may inject `gameFactory`.

`Game.start` and `Game.update` currently read `innerWidth` and `innerHeight` for camera bounds. The harness
supplies those numeric values only while invoking those methods and restores the previous global property
descriptors immediately afterward. It never creates `window`, `document`, a canvas, or rendering state.

## Issue commands

Use `issueCommand` with a structured command object:

| Type | Fields | Public game operation |
| --- | --- | --- |
| `select` | `entityIds` | `Game.select` |
| `move` | `x`, `y` | `Game.issue` |
| `attackMove` | `x`, `y` | `Game.armAttackMove`, then `Game.issue` |
| `attack` | `targetId` | `Game.issue` with the resolved target |
| `stop` | — | `Game.stopSelected` |
| `toggleAutoFire` | — | `Game.toggleAutoFire` |
| `research` | `upgradeId` | `Game.research` |
| `queue` | `unitType`, optional `buildingId` | optional selection, then `Game.queue` |
| `ability` | `abilityId` | `Game.useAbility` |
| `spawnWave` | — | `Game.spawnWave` |

The result has `{ ok, value, error }`. Invalid harness input, unknown command types, and unknown entity IDs
throw actionable errors. A valid game command that the simulation rejects returns `ok: false` and exposes
`game.lastError` when the game supplied one.

## Advance fixed ticks

```js
const afterOneSecond = harness.advanceTicks(30);
```

A harness has one immutable `tickSeconds` value. `advanceTicks(count)` calls `Game.update(tickSeconds)`
exactly `count` times and increments the harness tick counter. It does not reinterpret animation-frame
elapsed time.

This is a deterministic test driver, not the fixed-step runtime architecture. UFR-007 owns the later work
to split and document simulation phases and make browser-frame pacing independent of outcomes.

## Read and assert state

`snapshot()` returns a reference-free deterministic record containing:

- harness tick and tick duration;
- active mission and simulation seed;
- seeded-random snapshot;
- time, wave, outcome, camera, player, enemy, and selected IDs;
- units, buildings, resource nodes, projectiles, and effects;
- entity references converted to IDs.

Use ordinary Node assertions on snapshots or the convenience predicate:

```js
harness.assertState(
  (state) => state.units.some((unit) => unit.type === 'uaInfantry' && unit.x > 600),
  'Infantry must reach the eastern checkpoint.',
);
```

The live `game` is intentionally exposed for explicit scenario preparation that is not yet data-driven.
Prefer public commands for actions under test, and keep direct setup mutations small and visible.

## Determinism and isolation

- `startScenario` derives a mission-specific seed using the same seeded-random service as browser runtime.
- Starting a scenario resets the process-wide simulation stream.
- Identical seeds, scenario setup, commands, and tick counts must produce identical snapshots.
- Run only one actively advancing harness per process because the current simulation random stream is
  process-global.
- Test files must not depend on another file's global state or execution order.
- Snapshot schema is a testing contract, not the future save/replay serialization format.

## Test placement

Put scenario tests under `tests/sim/` and name them `*.test.mjs`. The existing dependency-free test runner
finds them automatically:

```bash
node scripts/run-tests.mjs sim
bash verify.sh
```
