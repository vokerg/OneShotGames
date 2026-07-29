# Suppression and morale

`src/status/suppression-morale.js` owns deterministic suppression accumulation, timed recovery, morale thresholds, pinned-order restrictions, command-aura effects, and status-transition event payloads.

The subsystem is presentation-neutral. It returns immutable transition results that simulation code may apply and UI/audio consumers may observe through the domain event stream.

Default states are `steady`, `shaken`, `pinned`, and `broken`. Pinned and broken units cannot advance or attack-move through this contract, while retreat and hold remain available.

Command aura raises morale thresholds and accelerates suppression recovery. The caller remains responsible for spatial aura membership, unit orders, animation, effects, and balance tuning.
