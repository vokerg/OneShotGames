# Target policy

`src/combat/target-policy.js` owns deterministic candidate scoring and chase-policy decisions.

Profiles weight target domains. Scoring then combines threat, damage potential, range pressure, health pressure, and an optional retaliation bonus. Invisible, friendly, destroyed, or unsupported targets are rejected.

`resolveChasePolicy` returns renderer- and order-neutral acquisition/chase metadata. Stance UI, order execution, pathfinding, and movement remain downstream owners.
