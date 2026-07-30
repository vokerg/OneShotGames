# Ukrainian fires and air-defense branch

## Purpose and audit correction

UFR-074 completes the Ukrainian mortar, self-propelled artillery, rocket, and layered air-defense content branch. The executable contract is `src/content/ukrainian-fires.js`.

The current draft was rewritten after audit. The first draft used descriptive field names that the authoritative UFR-037 artillery and UFR-039 air-defense systems could not consume, used non-canonical air-target identifiers, and redefined the exact `ua.mobile-sam` identity already owned by UFR-071. The corrected contract validates dependency compatibility instead of testing only its own invented schema.

## Stable roster ownership and variants

UFR-070 owns one fires node and one air-defense node. UFR-074 adds variants beneath those nodes rather than adding parallel technology-tree identities.

| Stable roster node | Variant profile | Tactical role |
| --- | --- | --- |
| `ua.self-propelled-artillery` | `ua.self-propelled-artillery.mortar` | rapid close-support mortar |
| `ua.self-propelled-artillery` | `ua.self-propelled-artillery` | stable responsive self-propelled artillery anchor |
| `ua.self-propelled-artillery` | `ua.self-propelled-artillery.rocket` | precision-fires-gated deep rocket battery |
| `ua.mobile-sam` | `ua.mobile-sam.point-defense` | short-range counter-UAS and point defense |
| `ua.mobile-sam` | `ua.mobile-sam.medium-range` | medium-range networked protection |

Every profile maps to a `rosterNodeId` and must match that UFR-070 node’s tier, producer, and ordered prerequisites. Additional specialization gates use `variantRequires`.

UFR-071 owns the exact `ua.mobile-sam` unit record for infantry task-group composition. UFR-074 deliberately exposes only subordinate air-defense variants and rejects any exact `ua.mobile-sam` profile, preventing duplicate ownership while preserving one stable roster unlock.

## UFR-037 artillery contract

Mortar, artillery, and rocket records expose `artilleryConfig` in the exact UFR-037 vocabulary:

- `ammo`, `setupTime`, and `packTime`;
- `minimumRange` and distance-sensitive `requiresSpotter`;
- `salvoSize` and `shotCadence`;
- `signaturePerShot`, `signatureDecay`, and `scatterRadius`.

`getArtilleryRuntimeConfig(profileId, shotDistance)` returns an immutable configuration ready for UFR-037. Spotting becomes mandatory only beyond each profile’s declared organic-observation range. Counter-battery signatures remain distinct inside UFR-037’s normalized `[0, 1]` signature scale rather than collapsing immediately at the clamp.

## UFR-039 air-defense contract

Air-defense variants expose `airDefenseConfig` in UFR-039’s exact detection, envelope, reload, ammunition, missile, reservation, and overkill vocabulary. `airTargetPriority` uses canonical target classes from `AIR_TARGET_CLASSES`, never display strings such as `strike-drone` or `inbound-missile`.

`getAirDefenseRuntimeConfig()` returns the validated configuration. UFR-039 remains authoritative for target detection, selection, launch, missile travel, impact, and ammunition state.

## Counterplay and doctrine

- Mortars react quickly but have short range and modest ammunition.
- Self-propelled artillery balances precision, counter-battery response, and displacement.
- Rockets deliver deep effects at high cost, long setup, and high signature.
- Point defense handles small unmanned threats but has limited reach and ammunition.
- Medium-range air defense protects the wider maneuver network but is vulnerable to saturation, anti-radiation effects, and ground attack.

`composeUkrainianFiresGroup()` reports costs, capacity, counters, capabilities, and explicit doctrine descriptors for responsive fires, deep fires, layered air defense, and the complete fires network. No descriptor applies a hidden combat bonus.

## Validation and verification

`validateUkrainianFiresBranch()` rejects UFR-070 drift, unknown variants, malformed UFR-037/UFR-039 configuration, invalid target classes, duplicate identities, exact `ua.mobile-sam` ownership overlap, broken support links, invalid economy values, and incomplete family coverage. The module validates itself at import time.

Focused tests execute the returned configurations through the public UFR-037 and UFR-039 APIs, verify technology-gated variants and ownership boundaries, and cover deterministic composition, immutability, malformed inputs, and canonical target priority.
