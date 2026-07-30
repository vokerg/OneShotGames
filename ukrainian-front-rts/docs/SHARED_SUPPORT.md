# Shared support systems

UFR-078 defines the declarative support catalog used by later runtime, AI, campaign, and UI tasks. The owner is `src/content/shared-support-systems.js`; it remains data and pure policy rather than an alternate simulation.

## Coverage

Both factions expose logistics, resupply, transport, command, recovery, bridging, and off-map support profiles. Each profile maps to an existing UFR-070 roster node and exactly preserves that node's tier, producer, and ordered prerequisites.

The catalogs are intentionally asymmetric. Ukrainian support emphasizes distributed supply, rapid retasking, mobile crossings, preservation, and observed precision support. Russian support emphasizes route throughput, concentrated ammunition transfer, larger lifts, echelon control, prepared crossings, replacement depth, and area support.

## Dependency contracts

- Transport records preserve UFR-026 blocked-exit and destruction policies.
- Recovery records expose bounded repair/tow envelopes and a stable UFR-062 modifier hook; they do not apply modifiers themselves.
- Bridging records describe deployment and crossing capacity. Navigation grid mutation belongs to a later system owner.
- Off-map records describe targeting, delay, cooldown, and command-point cost. They do not create projectiles or bypass combat validation.
- `availableSupportProfiles()` uses completed UFR-070 node IDs only.

## Extension recipe

Add a profile only beneath an existing faction roster node or through a dedicated tech-tree/schema task. Update the immutable ID/role coverage, validation, task-group summary expectations, and focused tests together. Runtime adapters must execute ordinary validated transport, repair, navigation, command, or combat actions rather than mutating state from this content module.

## Verification

Run:

```bash
node --check src/content/shared-support-systems.js
node --check tests/content/shared-support-systems.test.mjs
node --test tests/content/shared-support-systems.test.mjs
bash verify.sh
```

The isolated content contract has no browser-visible wiring, so mission interaction checks are not applicable until a later runtime integration task consumes it.
