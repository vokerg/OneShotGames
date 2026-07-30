# Worker overview and selection controls

`src/input/worker-overview.js` owns the player-facing worker summary, filtered worker selection, idle-worker cycling, and the compact top-bar adapter introduced by UFR-052. It reads authoritative worker state but does not change gathering rates, resource nodes, drop-off rules, construction progress, production, combat, or simulation order.

## Worker task classification

Living Ukrainian units whose resolved unit stats contain `worker: true` are classified into one visible task:

- `idle` — no active order or target;
- `gathering` — executing a `gather` order;
- `returning` — delivering carried resources through a `return` order;
- `building` — assigned to the active pending construction or a build/construction order;
- `other` — moving, fighting, or executing any other order.

Workers and selection results use stable unit-ID ordering. Destroyed, hostile, and non-worker units never appear in the overview.

## Resource assignment and carried amounts

A worker's displayed resource assignment is resolved from the active order, persistent `gatherKind`, then current `carryKind`. The overview exposes counts for metal, fuel, and intel assignments and the total amount of each resource currently being carried.

When exactly one worker is selected, the selection description gains its current task and carried load, including the 40-unit carry-capacity reference. This presentation is derived only; delivery and capacity remain owned by `src/systems/worker-gather-system.js`.

## Controls

The top bar adds task and resource buttons:

- **Idle** selects the next idle worker; **Shift-click** selects every idle worker.
- **Gathering**, **Returning**, **Building**, and **Other** select all workers in that task.
- **Metal**, **Fuel**, and **Intel** select all workers assigned to that resource. Their counters show `worker count · carried amount`.

The named input action `selectIdleWorker` is bound to **I** by default. Pressing **I** cycles idle workers in stable ID order and wraps to the first. **Shift+I** selects all idle workers. The action uses the shared configurable action map and may be rebound through the existing key-binding override boundary.

Every non-empty filtered selection replaces the prior selection and synchronizes the primary selected entity. Empty filters and idle cycles preserve the current selection and provide explicit feedback.

## Ownership boundaries

- `src/systems/worker-gather-system.js` remains authoritative for assignment, gathering, return, delivery, retargeting, and resource mutation.
- `src/input/worker-overview.js` owns browser event registration, derived summaries, filtered selection, and the HUD adapter.
- `src/ui.js` remains unchanged; the adapter wraps and restores `ui.refresh` at composition time.
- The merged veterancy work owns rank/progress indicators and selection-panel progression presentation.
- Later economy UI tasks may consume `workerOverviewSnapshot()` rather than re-deriving task and carried-resource counts.
