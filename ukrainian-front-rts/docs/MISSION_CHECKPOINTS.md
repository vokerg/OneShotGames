# Mission checkpoints

UFR-090 defines versioned mission checkpoints, per-mission opt-out, bounded checkpoint history, restart-from-checkpoint, and trigger-safe restoration. Persistence remains owned by UFR-085; mission scripting remains owned by UFR-086.

## Envelope and compatibility

A checkpoint records stable checkpoint and operation IDs, creation time, fixed tick, simulation seed, campaign profile revision, mission-script contract version, and a canonical JSON-compatible mission snapshot. Restore may require exact operation, profile-revision, and mission-script-version matches. A mismatch returns `incompatible` without touching live state.

`checkpointToMissionState()` wraps a checkpoint in the existing UFR-085 `{ operationId, tick, simulationSeed, snapshot }` shape. `checkpointFromMissionState()` restores the full checkpoint envelope. This keeps storage, slots, autosave, corruption handling, and migrations in the campaign save service while checkpoint schema migration remains here.

## Trigger-safe runtime

The application runtime restores one immutable transaction:

```text
pause mission
  → clear transient input/presentation queues
  → atomically replace mission + trigger state
  → resume mission
```

The captured snapshot must include UFR-086 trigger enabled/fired state, cooldowns, delayed actions, variables, objectives, weather, and any authoritative entity/resource state needed by the mission owner. No trigger is evaluated against partially restored state. Resume occurs in `finally`, including failed application.

## Policy and retention

`policyForOperation()` may disable checkpoints for authored missions. Disabled capture returns `disabled` without mutation. Enabled missions retain a bounded number of checkpoints; eviction is deterministic by tick, creation time, and checkpoint ID.

## Verification

Run:

```bash
node --check src/core/mission-checkpoint-service.js
node --check src/app/mission-checkpoint-runtime.js
node --check tests/campaign/mission-checkpoint-service.test.mjs
node --check tests/campaign/mission-checkpoint-runtime.test.mjs
node --test tests/campaign/mission-checkpoint-service.test.mjs tests/campaign/mission-checkpoint-runtime.test.mjs
bash verify.sh
```

No browser checkpoint controls are added by this task. Interactive menu wiring and mission-specific checkpoint placement remain later UI/content composition work.
