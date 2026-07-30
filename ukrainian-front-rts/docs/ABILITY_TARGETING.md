# Ability targeting contract

`src/combat/ability-targeting-system.js` owns the deterministic contract between an ability command, target acquisition, validation, confirmation, cancellation, and channel completion. It does not execute ability effects.

## Supported modes

| Mode | Acquisition and telegraph |
| --- | --- |
| `point` | One world point inside range. |
| `unit` | One living unit with allowed allegiance and target domain. Footprint radius counts toward range. |
| `area` | One world point plus an effect radius. |
| `direction` | A non-zero direction normalized from actor to cursor, with a fixed telegraph length. |
| `self` | The actor is locked automatically; no live entity reference is returned. |
| `toggle` | Flips deterministic per-ability state without a cursor target. |
| `channel` | Acquires a point, unit, area, direction, or self target, locks a reference-free snapshot, then advances for a configured duration. |

Profiles are versioned and immutable. Point, unit, area, and direction acquisition require a positive range. Area acquisition requires a positive radius. Channel abilities require a positive duration and an explicit acquisition mode.

## Lifecycle

1. `beginAbilityTargeting` validates the profile, actor availability, enabled state, cooldown, and that no other ability is active.
2. `previewAbilityTarget` validates the proposed target and returns a presentation-owned telegraph descriptor. Invalid previews include a stable rejection reason.
3. `confirmAbilityTarget` returns a reference-free activation descriptor. Non-channel abilities return to `idle`; channel abilities enter `channeling` and do not start cooldown yet.
4. `tickAbilityChannel` advances exact elapsed simulation time. Completion returns the cooldown to start. Source loss, target loss, broken range, or broken line of sight interrupt the channel.
5. `cancelAbilityTargeting` cancels targeting or interrupts a channel and records the reason.

No function reads wall-clock time, mutates the actor or target, invokes an ability effect, or stores DOM, renderer, or live entity references.

## Validation rules

- Cooldowns are supplied explicitly or read from `actor.cooldowns[abilityId]`.
- Range uses actor-to-point distance; unit targeting subtracts target collision radius and includes the exact boundary.
- Unit targeting validates living state, allegiance (`any`, `ally`, or `enemy`), and combat target domain (`ground`, `air`, or `structure`).
- Profiles that require passability or line of sight fail closed when the corresponding resolver is missing.
- Direction targeting rejects a zero-length vector and returns normalized direction components plus a deterministic endpoint.
- Toggle state is stored by ability ID in the targeting state.
- Channel cooldown begins only on completion; interruption returns no completion record.

## Telegraph ownership

Telegraphs are immutable presentation descriptors with `owner: 'presentation'`. They contain stable IDs and scalar geometry only. UI and rendering may display them, but they must not decide whether a target is valid or apply an effect.

The simulation owns targeting state, validation inputs, command ordering, cooldown storage, channel ticks, and execution of the returned activation/completion descriptors. Existing ability effects remain in their current owners until a later integration task migrates them to this contract.

## Scope boundary

UFR-041 deliberately does not modify `src/game.js`, input adapters, `src/ui.js`, rendering, ability balance, projectile travel, smoke, anti-air, or existing effect implementations. Those owners should consume this contract rather than reproduce targeting validation.

## Verification

Focused coverage in `tests/combat/ability-targeting-system.test.mjs` includes all seven modes, profile validation, cooldown and availability rejection, exact range boundaries, passability and line-of-sight requirements, unit allegiance/domain/footprint rules, reference-free telegraphs, toggle persistence, channel completion, interruption, and explicit cancellation.
