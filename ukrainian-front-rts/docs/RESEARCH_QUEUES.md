# Research queue contract

`src/systems/research-queue-system.js` owns deterministic timed research queues, cancellation refunds, facility contention policy, progress presentation, and completion descriptors. It is browser-independent and does not mutate live player resources, production queues, upgrade statistics, saves, UI nodes, or renderer state.

## Definitions and state

Research definitions normalize a stable technology ID, display name, positive research time, sorted resource cost, prerequisites, and optional mutually exclusive group. Queue state records a stable facility ID, queue bound, contention policy, completed technology IDs, exclusive selections, pause state, and monotonic item sequence.

All public results, states, events, costs, and UI descriptors are deeply frozen. Callers commit charged or refunded resources and persist the returned state at their owned composition boundary.

## Queue validation

A request is rejected when:

- the facility queue is full;
- the technology is complete or already queued;
- a prerequisite is incomplete;
- another technology from the same exclusive group is selected; or
- supplied available resources cannot cover every required resource.

Queueing returns the exact charged cost and a reference-free `researchQueued` event. Queue item IDs use `<facilityId>:research:<sequence>` and remain stable across progress and cancellation.

## Fixed-step progress

`updateResearchQueue(state, elapsedSeconds, context)` consumes deterministic simulation time. Overflow continues into later queue items in the same step, while unused time is returned explicitly after the queue empties. First progress emits `researchStarted`; exact completion emits `researchCompleted`, records the technology, and locks its exclusive group.

Zero elapsed time is a no-op. Negative, non-finite elapsed time is rejected.

## Production contention

Each facility chooses one explicit policy:

- `researchPauses`: production receives priority; research reports why it is blocked.
- `productionPauses`: research advances and returns `productionBlocked: true` for the production owner to consume.
- `parallel`: both systems may advance independently.

This module never edits `building.queue`, production reservations, rally points, exit selection, or produced-unit acknowledgement. The production owner supplies only whether the facility is busy and applies the returned production-block directive.

## Cancellation and refunds

An unstarted queue item refunds its full cost. A started item refunds the floor of each resource cost multiplied by remaining-time fraction. Cancellation removes exactly one stable item and emits `researchCancelled` with the refund fraction and sorted resource map. `totalResearchRefund` provides the same deterministic calculation for facility destruction or bulk cleanup.

## UI and events

`describeResearchQueue` returns active and queued entries with status, elapsed time, remaining time, normalized progress, integer percentage, and cancellation availability. Contention and manual pause reasons are included without DOM or localization ownership.

Events are immutable reference-free descriptors:

- `researchQueued`
- `researchStarted`
- `researchCompleted`
- `researchCancelled`
- `researchPauseChanged`

Later integration owners translate those descriptors into domain events, HUD updates, audio, telemetry, save state, and upgrade application.

## Ownership boundaries

UFR-061 owns research timing, queue state, contention decisions, cancellation/refund calculation, progress descriptors, and completion records. UFR-058 retains unit-production queue mutation and reservations. UFR-059 retains rally points and production exits. UFR-062 owns upgrade modifier application. UFR-063 owns broad command-capacity policy. UFR-067 owns the full production/research HUD.
