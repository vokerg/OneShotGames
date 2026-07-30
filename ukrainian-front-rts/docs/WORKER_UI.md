# Worker task overview and idle-worker controls

`src/ui/worker-overview.js` owns the browser-independent presentation and selection policy for worker task counts, carried-resource meters, idle-worker cycling, and selection filters. It is a UI-layer module and does not import or mutate `Game`, simulation systems, active input adapters, DOM nodes, renderer objects, resource nodes, drop-off structures, or economy balances.

## Presentation snapshot

`createWorkerOverviewSnapshot(workers, options)` consumes a caller-filtered array of living worker-like records and produces an immutable selection-region snapshot. Callers remain responsible for identifying faction-specific worker entities from authoritative game state.

The snapshot exposes:

- stable worker ordering by ID;
- current task classification for idle, gathering, returning, building, repairing, moving, combat, and other activity;
- task counts and idle-worker count;
- resource-assignment counts for metal, fuel, intel, and unassigned workers;
- per-worker carried kind, amount, capacity, fill ratio, full-load state, and display label;
- total carried resources by kind;
- selected-worker state;
- reference-free position data for optional camera focus;
- immutable button/action descriptors owned by the selection HUD region.

Destroyed, dead, or explicitly unavailable workers are omitted. The module does not infer whether an arbitrary unit is a worker; composition supplies the worker roster after applying the authoritative UFR-051 worker predicate.

## Task and resource classification

Task classification follows current order state:

- `gather` → gathering;
- `return` → returning;
- build/construction orders → building;
- repair and return-for-repair orders → repairing;
- move/patrol/guard/follow orders → moving;
- attack-family orders → combat;
- no order and no target → idle;
- other active state → other.

A caller may provide an explicit recognized `workerTask` or `task` value for integration contracts that already normalize task state.

Resource assignment uses the first valid value from explicit `resourceKind`, current order resource, persistent `gatherKind`, or carried-resource kind. This preserves UFR-051 assignments while allowing the active UFR-053 and UFR-054 branches to extend drop-off and extraction policy without changing UI selection semantics.

## Idle-worker button and hotkey

`WORKER_UI_COMMANDS.idleWorker` defines the selection-region button descriptor. Its named action is `worker.cycleIdle`, and its default hotkey is period (`.`), a conventional RTS idle-worker key.

`createWorkerUiBindings()` and `resolveWorkerUiAction()` provide a focused configurable binding map without editing the active shared tactical-command action map. Application composition may merge this named action into the global input adapter after UFR-027 releases the command-representation hotspot.

Both button clicks and hotkey resolution dispatch through `WorkerOverviewController.handleAction()`, preventing separate UI and keyboard behavior.

## Selection controller

`WorkerOverviewController` receives explicit callbacks:

- `workers()` returns the current worker roster;
- `selectedIds()` returns current selection IDs;
- `applySelection(ids, metadata)` applies a complete stable selection set;
- optional `focusWorker(snapshot)` focuses the camera using reference-free worker presentation data.

The controller supports:

- cycling through idle workers in stable ID order with wraparound;
- recovering safely when the previously cycled worker dies or disappears;
- selecting all workers by task;
- selecting all workers assigned to a resource kind;
- narrowing task selection by resource kind;
- additive selection or full replacement;
- optional focus of the first selected worker;
- explicit `no-idle-workers`, `no-workers`, and `unknown-action` outcomes.

Selection results contain IDs and immutable metadata only. The controller does not mutate unit `selected` fields or the game selection collection directly.

## UI architecture integration

The snapshot declares the canonical `selection` HUD region from UFR-133. A selection-panel presenter may write it through `UiStateCoordinator.setRegionState('selection', snapshot)` and suppress unchanged refreshes through the existing semantic equality contract.

Later live integration should:

1. obtain workers through UFR-051's authoritative worker predicate;
2. map the game selection collection to stable IDs;
3. apply controller selections through the public selection command boundary;
4. register the period-key action after active tactical-command work releases shared input ownership;
5. render the idle-worker button, task counts, carried-load meters, and task/resource filters in the selection HUD.

## Ownership boundaries

- UFR-051 owns gathering orders, persistent resource assignment, cargo mutation, delivery, and depletion retargeting.
- UFR-052 owns worker presentation snapshots, UI selection filters, idle-worker cycling, and focused binding descriptors.
- UFR-053 owns drop-off capabilities and deterministic drop-off selection.
- UFR-054 owns extraction, carry, depletion, salvage, regeneration, and mission-override policy.
- UFR-027 and the input owner retain the shared action map and live keyboard registration.
- UFR-133 and later selection-UI tasks own DOM presentation, focusable controls, styling, and refresh composition.
- Camera/input owners apply optional focus requests; this module only supplies a stable point.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/ui/worker-overview.js
node --test tests/ui/worker-overview.test.mjs
bash verify.sh
```

The focused suite covers immutable summaries, task/resource counts, carried-resource presentation, destroyed-worker cleanup, deterministic task/resource filters, idle cycling and wraparound, disappearance recovery, no-match behavior, append/replacement semantics, period-key binding, unified button/hotkey dispatch, and validation failures.
