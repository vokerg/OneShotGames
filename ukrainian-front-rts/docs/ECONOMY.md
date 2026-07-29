# Worker gathering and resource orders

`src/systems/worker-gather-system.js` owns explicit Ukrainian worker gathering behavior. It is installed at the browser composition root and exposes resource nodes through normal battlefield hit-testing.

## Player command contract

- Select one or more Ukrainian engineers and right-click an active metal, fuel, or intelligence node.
- The command replaces queued movement/combat orders and records the assigned resource type on each worker.
- Idle workers do not choose resources automatically.
- A later move, attack, Stop, or construction order cancels the persistent gather assignment.
- Reassigning a worker that carries another resource sends that cargo to a valid drop-off before the new assignment begins.

## Deterministic execution

Workers gather at the existing rate and carry capacity, return full loads, deposit them, and resume the assigned resource type. Source and drop-off selection use distance followed by stable identity/collection order, so equivalent fixed-tick runs choose the same targets.

When a source is depleted, the worker selects the nearest active source of the same assigned type. If none remains, carried resources are returned when possible and the order ends safely.

## Drop-off ownership

The Ukrainian HQ accepts all current resource types as the compatibility default. The gather system also honors `dropOffKinds` on a building instance or its `BUILDING_TYPES` definition. UFR-053 owns adding those capabilities to eligible building data and replacing straight-line proximity with travel-cost selection; this task does not assign new drop-off capabilities.

Destroyed, enemy, and unfinished structures are never valid drop-offs. Multi-worker assignments are preflighted before mutation so one invalid worker does not leave a partially reassigned selection.

## Verification

Focused deterministic coverage lives in `tests/economy/worker-gather-system.test.mjs`. Run:

```bash
node --test tests/economy/worker-gather-system.test.mjs
bash verify.sh
```

Browser verification should select engineers, right-click each resource type, observe full-load return and resume, deplete a source, issue a different order, press Stop, and begin construction.
