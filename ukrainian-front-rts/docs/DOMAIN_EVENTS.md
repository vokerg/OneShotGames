# Domain event stream

`src/core/events.js` owns the dependency-free domain-event contract used by simulation producers and presentation, audio, telemetry, and replay consumers.

## Contract

Events have a stable `type`, non-negative integer `tick`, monotonic `sequence`, optional `source`, and immutable object `payload`. Producers emit events only after the authoritative state change has occurred. Consumers may observe events but must not use them to mutate simulation state.

The taxonomy covers shots, impacts, deaths, production, research, neutral-site capture, objectives, alerts, audio requests, telemetry samples, and replay records. Additions must extend `DOMAIN_EVENT_TYPES`; ad-hoc string types are rejected.

`economy.capture` records completed or progressing neutral-site ownership transitions through the UFR-065 adapter. Its payload uses stable site IDs, transition names, teams, progress, and contest state. Building and neutral-site capture rules remain authoritative in their systems; consuming the event must never change the result.

## Ordering and lifecycle

A stream preserves emission order. `setTick()` establishes the current fixed-step tick, while an individual emission may supply an explicit tick for adapters. `peek()` returns a snapshot without consuming events; `drain()` returns the ordered batch and clears the buffer. Sequence numbers remain monotonic after draining.

Subscriptions are synchronous and intended for focused adapters. Wildcard subscriptions support recorder-style consumers. The returned unsubscribe function removes a listener deterministically.

## Ownership rules

- Core defines the contract and buffering only; it imports no browser, renderer, UI, game, or system module.
- Simulation systems are authoritative producers.
- UI, audio, telemetry, and replay layers are read-only consumers.
- Event payloads contain stable identifiers and values, not DOM nodes, renderer objects, or mutable entity references.
- Gameplay rules must not depend on presentation consumers being attached.
