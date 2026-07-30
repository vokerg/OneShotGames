# Air-defense engagement system

`src/combat/air-defense-system.js` owns deterministic detection, target selection, missile engagement, and overkill-reservation policy for airborne targets. It is a pure combat module: callers provide positions, target telemetry, and a deterministic random source, then apply emitted impact events to authoritative entity state.

## Detection and engagement

- Optical detection requires line of sight and uses a short fixed range.
- Radar detection combines target signature, stealth, radar quality, jamming, and radar hardening into an effective range.
- Engagement envelopes independently enforce minimum and maximum range plus altitude bounds.
- Failure results use reason-specific codes so UI, AI, and telemetry consumers can explain why a target cannot be engaged.

## Target priority and overkill prevention

`selectAirDefenseTarget` scores only detected targets inside the engagement envelope. Inbound missiles and loitering munitions rank above strike drones, reconnaissance drones, and aircraft; inbound status, payload, damage potential, proximity, and signature refine that ordering. Stable target IDs break exact ties deterministically.

Each launched missile reserves its configured damage against the target. Selection and launch validation ignore targets whose reserved damage already meets the configured overkill threshold. Per-target salvo limits and a global in-flight cap prevent excessive missile allocation.

## Launcher and missile state

`createAirDefenseState` owns launcher cooldown, ammunition, monotonic missile IDs, active missiles, and damage reservations. `launchAirDefenseMissile` validates reload, ammunition, detection, envelope, salvo, and overkill conditions before returning a new state.

`tickAirDefense` advances missile travel toward current target positions, decrements launcher cooldown, and emits event records:

- `missile-impact` reports hit probability, deterministic roll, hit state, and damage for the caller to apply;
- `missile-lost` reports target loss, seeker break, or expiry.

Missile movement does not mutate targets or renderer objects. Reservations are rebuilt from surviving missiles after every tick.

## Drone/EW integration

`createDroneInterceptionThreat` adapts detection and engagement results to the UFR-038 `resolveDroneInterception` threat contract (`canEngage` and `interceptionChance`). The air-defense module consumes drone state such as `airborne`, `returning`, signature, and evasion without taking ownership of drone launch, link, jamming, recovery, or payload lifecycle.

## Ownership boundaries

This task does not add faction roster data, buildable air-defense units, renderer effects, audio, broad target-acquisition AI, projectile-system integration, or `Game` lifecycle changes. Future roster and tactical-AI tasks may compose this module through its public functions rather than duplicating detection, envelope, priority, reload, missile-travel, or reservation rules.
