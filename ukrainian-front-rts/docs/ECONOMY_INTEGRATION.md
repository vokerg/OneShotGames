# Economy integration scenarios

UFR-068 closes the Gate B2 economy integration boundary by exercising the assembled runtime from the first worker order through expansion, production, research, capacity loss, repair, and recovery.

## Authoritative composition

The deterministic fixture in `tests/fixtures/economy-integration-runtime.js` constructs the normal `Game` facade through `src/app/simulation-harness.js` and installs the same focused economy owners used by the browser composition:

- production queue and production exits;
- construction placement and progress;
- worker gathering, drop-off selection, and income telemetry;
- building lifecycle and capture delegates;
- tactical commands;
- research queues and upgrade application;
- command-capacity reconciliation.

The fixture drives public commands and fixed simulation ticks. It does not reimplement resource mutation, construction, production, research, repair, navigation, or capacity rules.

## Gate scenarios

### Worker order through expansion

The Donbas scenario assigns a live engineer to metal, constructs a workshop through placement and construction-progress owners, gathers enough metal for a line squad, and produces that squad through a real barracks and rally point. Assertions cover:

- bounded construction and production completion;
- live income telemetry;
- production acknowledgements and rally orders;
- command-capacity reservation and release;
- conservation of source, delivered, carried, construction, and production metal;
- exact fuel and intelligence preservation.

### Production and research contention

The Zaporizhzhia scenario queues a drone and a workshop research choice concurrently. Production retains the facility until completion, research then advances through its normal phase, and the completed upgrade reconciles existing units. The scenario is run twice with the same seed and compared as a reference-free summary.

### Loss, repair, and recovery

The recovery scenario destroys the starting depot, verifies wreck creation and over-cap preservation, confirms new reservations are blocked, routes a damaged tank through the public Return-for-Repair command, and rebuilds capacity through construction of a replacement depot. Assertions cover exact repair, rebuilding, and resumed-production costs.

## Facility repair integration

UFR-043 defined deterministic repair orders and resource policy, while UFR-027 supplied Return-for-Repair routing and workshop waiting state. Before UFR-068, the live fixed-step runtime did not consume those two contracts to apply HP and resource mutation.

`src/systems/repair-runtime.js` is the narrow adapter. It:

- considers only live Ukrainian damaged units waiting at an operational repair workshop;
- consumes the immutable UFR-043 facility-repair policy;
- applies repair HP and exact player-resource debits in stable unit-ID order;
- leaves blocked units waiting with an actionable reason;
- clears the tactical command on full repair;
- emits bounded, frozen diagnostic records.

Facility repair runs in the explicit `repairs` phase after unit movement and before projectile, production, and research work. It does not replace or wrap `Game.update`.

## Verification

Focused tests:

```bash
node --test \
  tests/economy/repair-runtime.test.mjs \
  tests/economy/economy-integration-scenarios.test.mjs \
  tests/unit/simulation-phases.test.mjs
```

Authoritative verification:

```bash
bash verify.sh
```

The required GitHub Actions workflow also executes browser startup and first-mission smoke plus completion-evidence and active-claim diagnostics.

## Ownership boundaries

UFR-068 does not introduce new economy mechanics or retune the UFR-066 balance baseline. It integrates already merged contracts and fixes only the demonstrated missing facility-repair runtime seam.

Later owners retain:

- UFR-080: economy AI planning using public commands and the UFR-066 baseline;
- campaign tasks: authored resource placement, pacing, and mission-specific scripting;
- UI tasks: repair, queue, research, and capacity presentation;
- release/performance tasks: larger stress budgets, telemetry, and cross-browser qualification.
