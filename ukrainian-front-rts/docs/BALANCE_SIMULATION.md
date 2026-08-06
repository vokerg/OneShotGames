# Balance simulation and telemetry

## Ownership

UFR-148 adds a dependency-free, deterministic balance-measurement pipeline. It does not change authoritative simulation rules or balance values.

- `src/core/balance-snapshot.js` owns privacy-safe trial normalization, aggregation, percentile summaries, snapshot versioning, canonical serialization, and personal-data rejection.
- `src/app/balance-simulation.js` adapts the existing headless simulation harness into combat, economy, and mission-timing trials.
- `scripts/run-balance-simulations.mjs` is the command-line entry point.

## Running a suite

From `ukrainian-front-rts/`:

```bash
node scripts/run-balance-simulations.mjs \
  --iterations 20 \
  --mission 1 \
  --ticks 1800 \
  --seed release-candidate-1 \
  --revision "$(git rev-parse HEAD)" \
  --output artifacts/balance-snapshot.json
```

Without `--output`, the canonical JSON snapshot is written to standard output. `--mission` is one-based for command-line use. Every trial seed is derived from the batch ID, base seed, and iteration index, so the same source revision and arguments reproduce the same trial stream.

## Recorded evidence

Each batch records:

- outcome counts and rates;
- duration minimum, maximum, mean, median, and p95;
- numeric metric summaries and per-trial values;
- the exact derived seed for every trial;
- non-personal scenario context such as mission index and tick budget.

The default suite produces three batches:

1. **Combat** — selects the current Ukrainian force, creates the normal hostile wave, issues attack-move toward the opposing force, and measures survivors, structures, kills, resources, and elapsed simulation time.
2. **Economy** — attempts a normal infantry production order and measures resource change, production, force size, and elapsed simulation time during the fixed observation window.
3. **Mission timing** — advances the assembled mission without adding a second simulation clock and records completion or timeout timing.

## Privacy boundary

The pipeline collects no player identity, account, network, device, cookie, session, or free-form event data. Snapshot construction recursively rejects keys associated with personal identifiers. Validation normalizes delimiter-separated and camelCase field names, so nested fields such as `user_email`, `emailAddress`, `userId`, and `sessionToken` are rejected consistently. Output is tied to a source revision rather than a person or workstation.

## Interpretation

Batch output is evidence, not an automatic balance decision. Compare snapshots produced from the same mission, tick budget, command policy, and iteration count. A deterministic headless result can identify regressions, matchup drift, economy pacing changes, or high variance, but player-facing balance changes still require repeatable playtests and rationale under UFR-149.

## Verification

Focused coverage validates deterministic seeds and output, outcome/rate aggregation, timing and metric summaries, recursive privacy rejection across common naming conventions, canonical serialization, real harness adapter behavior through a deterministic fake harness, and the three-batch default suite. The repository-wide verifier discovers the test automatically.
