# Ukrainian infantry branch

## Ownership

UFR-071 owns the seven stable Ukrainian infantry/support roster identities declared by UFR-070:

- `ua.combat-engineers`
- `ua.line-infantry`
- `ua.anti-armor-team`
- `ua.recon-team`
- `ua.casevac-team`
- `ua.mobile-sam`
- `ua.command-team`

The branch is declarative content under `src/content/ukrainian-infantry.js`. It does not install runtime controllers, alter `src/config.js`, or create a second combat, production, transport, garrison, command-capacity, or upgrade implementation.

## Dependency contracts

Every record derives its tier, producer, and ordered prerequisites from the current UFR-070 technology tree. Validation fails when those values drift.

The branch uses the established economy and capacity vocabulary:

- costs contain exactly `metal`, `fuel`, and `intel`;
- `commandCapacityCost` is the authoritative content field consumed by UFR-063;
- `capacityCost` remains an equal compatibility alias for adjacent declarative content summaries;
- production adapters expose the UFR-058 `cost` and `pop` shape.

Combat records execute through UFR-031 weapon and defense profiles. Content-owned range, damage, reload, ammunition, and role guidance remain data; damage-class, armor-class, target-domain, splash, penetration, and resistance legality remain owned by the combat schema.

Transport and occupancy adapters expose the existing UFR-026 and UFR-047 vocabulary. All seven records are ground, transportable infantry/support sections. Ordinary infantry records are garrison-capable. `ua.mobile-sam` is a crewed mobile support section that may be transported but is explicitly not garrisonable.

Upgrade descriptors expose the UFR-062 faction, unit type, archetype, tags, and ability IDs. They contain no upgrade effects and do not bypass the upgrade modifier owner.

## `ua.mobile-sam` boundary

UFR-071 owns the exact stable UFR-070 identity `ua.mobile-sam`, including its base cost, capacity, crewed-section mobility, and branch role.

UFR-074 owns only subordinate air-defense variants under that namespace:

- `ua.mobile-sam.point-defense`
- `ua.mobile-sam.medium-range`

UFR-074 validation rejects an exact `ua.mobile-sam` profile. UFR-071 dependency tests import the current UFR-074 public profile IDs and verify that this ownership remains non-overlapping.

## Doctrine and counterplay

The branch represents networked maneuver through explicit relationships rather than hidden global bonuses:

- reconnaissance raises contact quality and supports observers;
- command support coordinates separated groups and support routing;
- line infantry screens specialists and holds terrain;
- anti-armor teams deny temporary vehicle lanes but remain vulnerable to infantry and fires;
- engineers open routes, construct, clear, and repair;
- CASEVAC preserves expensive squads but cannot rescue a lost engagement;
- mobile air defense protects dispersed groups from drones but is vulnerable to ground attack, fires, ammunition pressure, and detection.

Task-group summaries report composition, costs, capacity, counter domains, capability IDs, support-link pairs, and whether the required command/reconnaissance/screening relationships are present. They do not apply simulation bonuses.

## Runtime boundary

This recovery reaches `CONTRACT_COMPLETE` only. The active browser roster remains owned by recovery issue #112, which must choose the canonical runtime projection and migration path. No player-visible runtime integration or save migration is claimed here.

## Verification

Focused coverage imports and executes the real public contracts for:

- UFR-070 technology identities and prerequisites;
- UFR-031 combat profiles;
- UFR-058 production queue item normalization;
- UFR-063 command-capacity snapshots;
- UFR-026 transport slot cost;
- UFR-047 garrison eligibility;
- UFR-062 upgrade targeting;
- UFR-074 mobile-air-defense variant ownership.

The required repository command is:

```bash
bash verify.sh
```

Browser mission testing is not applicable until issue #112 composes this content into the active runtime. The authoritative CI and browser-startup baseline remains owned by recovery issue #109.
