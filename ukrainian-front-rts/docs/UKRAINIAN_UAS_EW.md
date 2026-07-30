# Ukrainian UAS/EW branch

## Purpose and audit correction

UFR-073 completes the Ukrainian reconnaissance, FPV strike, relay, jamming, counter-UAS, and targeting-support branch for the UFR-069 **Networked Maneuver** doctrine. The executable contract is `src/content/ukrainian-uas-ew.js`.

The schema is version `2`. This revision corrects the original post-merge implementation, which was internally consistent but did not prove compatibility with its dependencies. Version 2 imports the UFR-070 faction tree, uses the established `metal`/`fuel`/`intel` economy vocabulary, and exports configuration objects in the exact public field vocabulary consumed by UFR-038 and UFR-039.

## Stable roster ownership and variants

UFR-070 owns two Ukrainian roster nodes in this family:

| Stable roster node | Variant profile | Tactical role |
| --- | --- | --- |
| `ua.recon-drone` | `ua.recon-drone` | recoverable reconnaissance and observation |
| `ua.recon-drone` | `ua.recon-drone.fpv-strike` | one-way, spotted-target FPV strike |
| `ua.recon-drone` | `ua.recon-drone.relay` | recoverable airborne relay |
| `ua.ew-team` | `ua.ew-team` | vehicle-mounted jamming and link protection |
| `ua.ew-team` | `ua.ew-team.counter-uas` | local electronic attack plus limited interceptors |
| `ua.ew-team` | `ua.ew-team.targeting` | bounded shared-targeting and relay support |

Every profile carries a `rosterNodeId`. Its tier, producer, and base prerequisites are copied from and validated against the corresponding UFR-070 node. Additional specialization requirements live in `variantRequires`; they do not rewrite the stable technology-tree contract.

Legacy identifiers from the first implementation are accepted by lookup and composition helpers and resolve to the canonical variant IDs. New consumers should store canonical IDs.

## Authoritative runtime adapters

The content branch does not duplicate simulation logic.

- Airborne profiles expose `droneConfig` through `getUkrainianDroneRuntimeConfig()`. The fields map directly to UFR-038: launch, loiter, return, recovery, payload, link range, hardening, link-loss policy, strike consumption, spotting requirement, cooldown, signature, and evasion.
- The counter-UAS variant exposes `airDefenseConfig` through `getUkrainianAirDefenseRuntimeConfig()`. Its target priorities use the canonical UFR-039 target classes, and its configuration uses UFR-039 detection, envelope, reload, ammunition, missile, reservation, and overkill fields.
- Relay, jammer, targeting, and counter-UAS records expose bounded `ewEffect` telemetry through `getUkrainianEwEffect()`. Runtime composition may translate those values into UFR-038/UFR-039 context inputs; the content module does not update simulation state itself.

## Counterplay and doctrine

The branch is a dependency network, not six independent bonuses:

- reconnaissance creates contact quality but no damage;
- FPV strike requires a valid spotted target and is consumed on attack;
- relay extends reach while becoming a high-value air-defense target;
- jamming is bounded, emits, and remains vulnerable to fires and direct attack;
- counter-UAS has finite ammunition and can be saturated;
- targeting support cannot create information without reconnaissance.

`resolveUasEwTaskGroup()` reports accepted and rejected profiles, costs, capacity, roles, counters, missing capabilities, and four explicit doctrine descriptors: reconnaissance-strike chain, resilient relay, layered counter-UAS, and complete network. These are inspection data, not hidden faction-wide modifiers.

## Validation and verification

`validateUkrainianUasEw()` rejects drift from UFR-070, unknown or duplicate variants, invalid economy values, malformed UFR-038/UFR-039 configuration, non-canonical target classes, broken support links, incomplete role coverage, and weak player guidance. The module validates itself at import time.

Focused tests cover exact tech-tree mapping, runtime-adapter execution with UFR-038/UFR-039 APIs, variant unlocks, aliases, composition, immutability, malformed inputs, and cross-link failures.
