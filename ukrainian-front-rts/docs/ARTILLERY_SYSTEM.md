# Artillery system

`src/combat/artillery-system.js` owns deterministic artillery readiness and firing policy.

It defines packed/setup/ready/packing transitions, minimum range, spotting requirements, salvo and ammunition cadence, deterministic scatter through an injected random source, and a decaying counter-battery signature.

Projectile travel, renderer effects, audio, target acquisition, and movement execution remain owned by their respective systems.
