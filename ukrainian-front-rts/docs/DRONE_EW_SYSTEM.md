# Drone and EW system

`src/combat/drone-ew-system.js` owns deterministic drone lifecycle, command-link, electronic-warfare, interception-risk, and strike-counterplay policy.

## Lifecycle

Drones move through `docked`, `launching`, `airborne`, `returning`, `recovering`, and `lost` states. Launch initializes the configured loiter budget. Recovery may be commanded explicitly, begins automatically when loiter expires, or begins after sustained command-link loss when autonomous return is enabled.

Return and recovery durations are policy values rather than movement simulation. A later runtime integration may derive those values from path or flight distance without changing the lifecycle contract.

## Link and jamming

`evaluateDroneLink` combines base link range, relay range, jammer strength, and link hardening. It reports the unjammed and effective ranges, link quality, connection state, and whether a disconnect was caused by jamming or ordinary range loss.

Temporary disconnection accumulates against a configurable grace period. Sustained loss triggers autonomous return by default; configurations without autonomous return transition the drone to `lost`.

## Strike counterplay

Strike validation requires an airborne drone, available payload, completed cooldown, and a viable link unless autonomous strike is explicitly enabled. Optional spotting requirements consume the authoritative sight result supplied by the caller.

A strike consumes payload, applies cooldown to reusable platforms, and increases a decaying signature. The signature is returned as an explicit counterplay contract and increases later interception probability. One-way FPV behavior is represented with `consumedOnStrike`.

## Interception boundary

`resolveDroneInterception` consumes an engagement decision and base interception chance supplied by the future air-defense owner. It applies drone-side evasion and signature modifiers with an injected deterministic random source. Detection, engagement envelopes, reload, missile travel, overkill prevention, and target prioritization remain owned by UFR-039.

Projectile travel, damage application, renderer effects, audio, target acquisition, sight traversal, and broad balance remain outside this module.
