# Building lifecycle

`src/systems/building-lifecycle-system.js` owns deterministic building-level lifecycle transitions introduced by UFR-057. It composes existing construction, repair, destruction, and command-capacity owners rather than redefining their algorithms.

## Lifecycle phases

Version 1 uses stable immutable state with these phases:

- `construction`
- `operational`
- `capturing`
- `sold`
- `scuttled`
- `destroyed`
- `rubble`
- `cleared`

Every state includes the stable building ID, owner team, capture state, capacity activity, terminal action metadata, sequence, and last transition.

## Repairable construction stages

Construction progress maps to four deterministic stages:

- foundation: below 25%, repairable up to 25% maximum HP;
- frame: 25–64%, repairable up to 65%;
- fitout: 65–99%, repairable up to 95%;
- complete: repairable up to full HP.

`buildingRepairEnvelope` exposes the stage, current HP, stage repair ceiling, missing HP, and whether the repair is construction-limited. UFR-043 remains authoritative for repair rate, resource cost, multiple repairers, facility behavior, and AI prioritization.

## Capture

A building may be captured only when it is alive, complete, explicitly capturable, owned by another team, and has no active production queue. Capture uses stable capturer IDs, a default eight-second duration, a 72-unit radius, deterministic contesting, and progress decay when capturers leave.

All eligible capturers and contesters are evaluated from authoritative fixed-step unit state. Contested capture pauses. Missing capturers decay progress by 0.5 seconds per elapsed second. Exact threshold completion changes ownership once and invokes command-capacity reconciliation.

`game.beginBuildingCapture(building, team, units)` is the browser-facing command boundary. Targeting/cursor presentation may consume this method without duplicating eligibility or progression rules.

## Sell and scuttle

Selling requires a living, complete, friendly, non-capturing building with an empty production queue. Refunds are deterministic per resource:

```text
floor(original cost × 0.50 × max(0.25, current HP / maximum HP))
```

Selling removes the building, grants the exact refund once, clears selection, releases capacity through UFR-063 reconciliation, and emits a reference-free event.

Scuttling is allowed for friendly operational buildings and construction sites, but not buildings with active production. It grants no refund, creates a UFR-044-compatible structure destruction descriptor, materializes wreck/rubble through the injected destruction API, removes the building, and reconciles capacity exactly once.

## Destruction and rubble

Before legacy destroyed-building cleanup removes a zero-HP building, the lifecycle controller creates a structure-domain destruction descriptor containing stable identity, team, position, footprint, radius, maximum HP, and original cost. When UFR-044 functions are injected, `createDestructionState` and `materializeWreck` remain authoritative for wreck HP, salvage, and obstruction state.

Materialized wrecks are stored in `game.buildingWrecks`. The lifecycle controller does not implement salvage work, burning, bailout, obstruction clearance, or destruction probability.

## Capacity ownership

Capture, sale, scuttle, and destruction call `game.reconcileCommandCapacity(reason)` when UFR-063 is installed. The lifecycle system does not maintain a parallel fielded/reserved/source ledger. A small fallback recomputes only visible building-source capacity for isolated fixtures.

## Runtime composition

`createBuildingLifecycleController` wraps the existing boundaries:

- `addBuilding` initializes lifecycle state;
- `start` resets events/wrecks and initializes authored buildings;
- `update` advances capture after the ordinary fixed simulation step;
- `removeDestroyedEntities` materializes rubble before legacy removal;
- public snapshot, capture, sell, scuttle, and event-drain methods expose the contract.

Install it after construction-progress composition and before command-capacity composition. Dispose in reverse order.

`installBuildingLifecycleControls` extends the existing selected-building production card with Sell Structure and Scuttle Structure. It imports no systems-layer module and reads all legality through public game methods.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/building-lifecycle-system.js
node --check src/input/building-lifecycle-controls.js
node --check src/main.js
node --check tests/economy/building-lifecycle-system.test.mjs
node --test tests/economy/building-lifecycle-system.test.mjs
bash verify.sh
```

Browser checklist:

1. Damage a construction site and confirm repair never exceeds its stage ceiling.
2. Capture an empty hostile capturable building; verify contesting pauses and leaving decays progress.
3. Capture a capacity source and verify capacity changes once.
4. Sell a damaged empty structure and verify the integrity-scaled refund.
5. Confirm a building with a production queue cannot be sold or scuttled.
6. Scuttle a completed building and a construction site; verify no refund and one wreck each.
7. Destroy a capacity source normally; verify rubble is recorded and capacity reconciles once.
8. Restart the mission and verify lifecycle events and wreck records do not leak.
