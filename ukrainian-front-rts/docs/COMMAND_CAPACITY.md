# Command capacity policy

`src/systems/command-capacity-system.js` owns the deterministic command-capacity ledger introduced by UFR-063. The policy separates capacity supply, fielded force cost, and production reservations while preserving `player.pop` and `player.cap` as compatibility projections for existing production and HUD code.

## Capacity supply

Total capacity is:

```text
mission base capacity + active source capacity
```

The current mission base is inferred from the legacy projection at mission start. A building contributes its configured `BUILDING_TYPES[type].pop` value, or an explicit `building.commandCapacity` override, only when it:

- belongs to Ukraine;
- is alive;
- is not under construction;
- has not explicitly withheld `capacityGranted`.

This means a completed logistics depot contributes eight capacity under the current content data. Construction-progress and building-lifecycle owners remain responsible for changing `underConstruction`, `capacityGranted`, hit points, and collection membership; the capacity controller derives the result after the fixed simulation step.

## Usage ledger

Usage is the sum of two independent categories:

- **Fielded:** living Ukrainian units, including passengers currently embarked in transports.
- **Reserved:** queue items on living Ukrainian facilities whose reservation has not been released.

Unit costs use `unit.commandCapacityCost` when supplied, otherwise `UNIT_TYPES[type].pop`. Queue items use their recorded `pop` reservation before falling back to unit data. All source, unit, and reservation records are returned in stable identity order.

The immutable snapshot exposes:

- base, source, and total capacity;
- fielded, reserved, total used, available, and over-cap values;
- normal, near, full, or over state;
- a reference-free warning descriptor;
- an AI response directive;
- stable source, fielded-unit, and reservation records.

Snapshots are JSON-compatible, but command capacity is derived state. Save/load owners should restore authoritative units, buildings, construction state, and queues, then call reconciliation instead of treating the projection as independent truth.

## Reservation and source-loss behavior

New reservations are accepted only when:

```text
fielded + reserved + requested <= capacity
```

When a capacity source is lost:

- existing units remain active;
- existing reservations remain queued and may complete;
- no unit is killed, disabled, or debuffed solely because the force is over capacity;
- new reservations and population-creating actions remain blocked by the compatibility projection until usage is legal again;
- no queue is silently cancelled and no resource refund is manufactured by this policy.

Destroyed facilities no longer contribute capacity or valid reservations. Their queue cleanup and refunds remain owned by production/building lifecycle systems.

## Warning and AI contracts

At 85% utilization the snapshot enters `near`. Exact saturation is `full`; usage above capacity is `over`.

The HUD adapter keeps the compact `used/capacity` display, adds a persistent warning marker at full or over capacity, exposes fielded/reserved/available detail through the accessible label and title, and emits transition toasts when capacity is exceeded or restored.

The AI directive is advisory and deterministic:

- `maintain` under normal load;
- `prepare-capacity` near the limit;
- `expand-capacity` when full;
- `restore-capacity` when over.

It includes priority, requested additional capacity, whether new reservations should halt, whether existing queues remain preserved, and whether capacity sources should be protected. UFR-079 and later AI tasks own actual planning and construction decisions.

## Runtime ownership

- `src/systems/command-capacity-system.js`: derived ledger, reconciliation, reservation checks, transition records, and AI directives.
- `src/ui/command-capacity-feedback.js`: read-only HUD detail and transition warnings.
- `src/systems/production-queue-system.js`: queue mutation, reservation creation/release, refunds, repeat mode, and completion.
- construction/building lifecycle systems: capacity-source activation and loss.
- transport system: embark/disembark and passenger destruction; embarked passengers remain part of fielded usage.
- `src/main.js`: composition only.

The controller reconciles after each authoritative fixed-step update and records at most 32 immutable transition records for diagnostics and future replay consumers.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/command-capacity-system.js
node --check src/ui/command-capacity-feedback.js
node --check src/main.js
node --check tests/economy/command-capacity-system.test.mjs
node --test tests/economy/command-capacity-system.test.mjs
bash verify.sh
```

The focused benchmark used 150 active units, embarked passengers, 12 buildings, and active reservations. Ten thousand complete ledger snapshots took 765.99 ms in the local mirror, approximately 0.0766 ms per snapshot.

Browser checks should cover initial capacity, queue reservation detail, cancellation, production completion, transport embark/disembark, depot construction, depot destruction below and above the limit, persistent full/over warning markers, over-cap toasts, blocked new production, existing queue completion, and the capacity-restored toast.
