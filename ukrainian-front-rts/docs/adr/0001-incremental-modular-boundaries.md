# ADR 0001: Incremental modular boundaries

- Status: accepted
- Date: 2026-07-28

## Context

The prototype concentrated browser input and lifecycle code in `main.js` and several independent simulation policies in `Game`. That made small changes harder to isolate and encouraged unrelated edits in central files. A full engine rewrite would create unnecessary regression risk and conflict with the project's dependency-free scope.

## Decision

Adopt incremental extraction with stable delegates:

- browser event adapters live in `src/input/`;
- animation-frame and mission lifecycle live in `src/app/`;
- pure helpers live in `src/core/`;
- independent simulation policies live in `src/systems/`;
- `Game` remains the authoritative facade and keeps compatibility methods that delegate to extracted systems;
- architecture rules are checked by a dependency-free verification script.

## Consequences

Positive:

- bug fixes and features can target one owner;
- input and lifecycle can be disposed or tested independently;
- mission objectives, waves, and projectiles can evolve without growing `Game` further;
- renderer and UI changes remain separated from simulation.

Trade-offs:

- `Game` is still substantial and will be decomposed only when a stable seam is demonstrated;
- systems currently mutate explicit game state rather than using a full entity-component-system architecture;
- compatibility delegates add a small amount of indirection.

## Rejected alternatives

- Full ECS rewrite: too disruptive for the current prototype and not justified by scale.
- Framework migration: adds tooling and dependency overhead without solving ownership by itself.
- Cosmetic file splitting only: smaller files without dependency rules would not prevent coupling from returning.
