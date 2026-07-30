# Tactical unit commands

## Purpose

UFR-027 adds five player and AI-callable tactical commands without creating a second navigation implementation. `src/systems/tactical-command-policy.js` owns validation and command creation, `src/systems/tactical-command-runtime.js` owns fixed-step projection and reconciliation, and `src/systems/tactical-command-system.js` preserves the public controller facade. `src/input/tactical-command-input.js` owns browser targeting and hotkeys. `src/ui/tactical-command-card.js` owns command-card presentation and refresh signatures.

The shared command names live in `src/core/tactical-command-contract.js`, which both simulation and browser-facing modules may import without reversing architecture dependencies.

## Controls

| Command | Default key | Targeting | Behavior |
| --- | --- | --- | --- |
| Patrol | P | Right-click a battlefield point | Alternates between the unit's issue position and the selected point using attack-move legs. |
| Guard | G | Right-click another friendly unit or structure | Armed units engage the closest threat inside the guarded perimeter; the whole selected group returns to stable guard slots. |
| Follow | Y | Right-click another friendly unit | Maintains deterministic escort slots around a moving friendly unit. |
| Hold Position | H | Immediate | Cancels movement and chasing while preserving local auto-fire response. |
| Return for Repair | R | Immediate | Sends damaged vehicles to the nearest operational Ukrainian workshop and marks them as waiting on arrival. |

Escape, window blur, Stop, Attack-Move, and Force-Fire cancel an armed tactical target mode. Construction placement keeps ownership of R while a footprint is being placed.

## Authoritative command state

A recurring command is stored on the unit as `unit.tacticalCommand` with a monotonic command ID and stable entity IDs rather than mutable target references. The controller exposes `game.tacticalCommandSnapshot(unit)` for UI, renderer, AI, replay, and future save consumers.

Before each existing fixed simulation update, recurring intent is projected to ordinary orders:

- patrol -> `attackMove` with shared UFR-023 formation metadata on outbound group legs;
- follow and perimeter return -> `move`;
- guard engagement -> `attack`;
- hold -> no movement order;
- return-for-repair -> `move` to a deterministic clear approach point.

The normal navigation, terrain movement, collision, combat, and fixed-step systems then process those standard orders. After the tick, patrol arrival toggles the next leg. This preserves current pathfinding ownership and avoids edits to `navigation-movement-system.js` while PR #47 owns that integration file.

## Replacement and queue rules

Tactical commands are persistent stateful commands, not finite Shift-waypoint entries. Issuing one clears the selected units' current and queued orders. An ordinary move, attack, attack-move, gather, embark, Stop, or another tactical command replaces the previous tactical state.

This is deliberate: queuing an infinite patrol or target-bound follow command behind a finite waypoint would require a versioned high-level order queue contract beyond UFR-027. The existing UFR-017 queue remains unchanged for its finite move, attack-move, attack, and force-fire entries.

## Command details

### Patrol

Each unit records its own origin and the common destination. Units alternate deterministically between those points. A leg that the navigation system cancels while the unit is still away from its destination terminates the patrol and reports an unreachable route instead of oscillating forever.

### Guard

Guard targets may be friendly units or structures, but not one of the commanding units. Threats are restricted to the guarded perimeter and selected by distance to the protected entity, then stable entity ID. Armed units engage; unarmed members retain the guard command and occupy deterministic perimeter slots.

### Follow

The target must be another active friendly unit. Escort slots derive only from stable unit and target IDs. A moving target triggers a new standard move projection only after the destination changes enough to justify repathing.

### Hold position

Hold clears gathering assignments, queued orders, movement, and explicit targets. Existing local auto-fire remains authoritative: a unit may shoot an enemy already in range but does not chase it.

### Return for repair

Only damaged armored/vehicle units are eligible. Workshops are selected by distance then stable ID, and destroyed or unavailable facilities are replaced deterministically when possible. Arrival sets `awaitingRepairAt` and command status `waiting`.

UFR-027 does **not** heal units, consume repair resources, coordinate multiple repairers, or define field-repair limits. Those rules belong to UFR-043. This command provides the routing and waiting contract that the later repair owner can consume.

## AI and future consumers

The focused system exports direct issue helpers that accept explicit unit collections. AI code can therefore use the same validation and state transitions without synthesizing browser selection or input events. Future save/replay work should serialize the reference-free tactical snapshot plus command-specific coordinates.

## Verification

Focused commands:

```bash
node --check src/core/tactical-command-contract.js
node --check src/systems/tactical-command-policy.js
node --check src/systems/tactical-command-runtime.js
node --check src/systems/tactical-command-system.js
node --check src/input/tactical-command-input.js
node --check src/input/action-map.js
node --check src/ui/tactical-command-card.js
node --check src/main.js
node --check tests/systems/tactical-command-system.test.mjs
node --check tests/input/tactical-command-input.test.mjs
node --check tests/ui/tactical-command-card.test.mjs
node --test tests/systems/tactical-command-system.test.mjs tests/input/tactical-command-input.test.mjs tests/ui/tactical-command-card.test.mjs
```

Manual browser checklist:

1. Start every mission and verify selection, ordinary right-click movement, Attack-Move, Force-Fire, Stop, minimap navigation, zoom, and all four WASD directions.
2. Patrol around open terrain and around a building; confirm repeated legs use normal pathfinding and Stop ends the patrol.
3. Guard a unit and a structure; move or destroy the guarded target and confirm deterministic return/cancellation behavior.
4. Follow a moving unit with a mixed group and confirm stable non-random escort positions.
5. Hold infantry, engineers, and vehicles; confirm they do not chase or resume gathering but still fire locally when eligible.
6. Damage multiple vehicles, construct two workshops, and use Return for Repair; confirm nearest-facility selection and waiting state without automatic healing.
7. Destroy the assigned workshop while vehicles are returning; confirm deterministic retargeting or explicit cancellation when none remains.
8. Verify P/G/Y/H/R command-card and keyboard behavior, Escape/blur cancellation, targeting cursor state, and construction rotation retaining R during placement.
