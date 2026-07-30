# Destruction and wreck lifecycle

`src/combat/destruction-system.js` owns deterministic condition thresholds, burning progression, crew bailout, wreck materialization, salvage work, wreck damage, and obstruction cleanup. It is a pure lifecycle reducer: callers remain responsible for mutating live entities, spawning crew, registering blockers, committing salvage resources, rendering effects, and emitting audio.

## State model

Operational entities use a separate condition and lifecycle phase:

- conditions: `healthy`, `damaged`, `disabled`;
- phases: `active`, `burning`, `destroyed`, `wreck`, `salvaged`, `cleared`.

Separating condition from phase allows a damaged or disabled entity to burn without losing the authoritative HP threshold result. Destroyed entities must be explicitly materialized into wrecks, so the simulation owner can sequence death events, roster removal, crew spawning, and blocker registration deterministically.

## Thresholds and burning

Damage and disabled thresholds are inclusive HP ratios. The default policy marks an entity damaged at or below 65% HP and disabled at or below 25% HP.

Burning starts only from an explicit ignition request or the optional `autoIgniteWhenDisabled` policy. Fixed-step burning applies damage only for the remaining burn duration. At expiry, policy either destroys the entity or returns it to the active phase with its current condition. No wall clock or random source is used.

## Crew bailout

Bailout may trigger at disabled, burning, or destroyed state. Eligible target domains, survivor ratio, burning penalty, and destroyed penalty are policy fields. Survivor counts use deterministic floor rounding.

A bailout descriptor is emitted at most once and contains only stable values: source ID, team, survivors, casualties, position, and trigger. It contains no live entity references.

## Wrecks and salvage

`materializeWreck` converts a destroyed entity into an immutable wreck descriptor containing:

- stable wreck and source IDs;
- position, radius, and optional footprint;
- wreck HP;
- salvage value;
- salvage work remaining;
- movement and line-of-sight obstruction flags.

Salvage values use an authored `salvageBase` when present. Otherwise, each positive resource cost is multiplied by the policy ratio and rounded down. Resource keys are sorted for deterministic snapshots.

Salvage work is bounded by the remaining requirement. Completion exposes the full immutable resource record exactly once. Policy may clear obstruction automatically on salvage or retain the empty wreck until explicit cleanup.

## Obstruction cleanup

A wreck reaches `cleared` when wreck HP reaches zero or `clearWreckObstruction` succeeds. Cleanup always disables both movement and line-of-sight obstruction. Destroying a wreck forfeits its unrecovered salvage.

Navigation owns blocker registration and removal. The destruction module only produces the authoritative obstruction descriptor and cleanup event.

## Ownership boundaries

This task does not integrate with `game.js`, navigation, renderer, UI, audio, veterancy, engineer abilities, campaign saves, or live economy mutation. Later integration owners should consume these lifecycle results instead of duplicating threshold, bailout, wreck, salvage, or cleanup rules.

## Focused verification

`tests/combat/destruction-system.test.mjs` covers policy validation, exact damaged/disabled boundaries, condition transitions, ignition, burn damage and expiry, extinguishing, bailout penalties and domain restrictions, wreck construction, authored and cost-derived salvage, salvage progress and completion, wreck destruction, manual cleanup, idempotence, invalid input, and phase guards.
