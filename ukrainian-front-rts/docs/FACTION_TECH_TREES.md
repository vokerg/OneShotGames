# Faction technology trees

UFR-070 translates the doctrine bible into a versioned, deterministic content contract. It defines stable structure, technology, roster, producer, prerequisite, unique-mechanic, and counter-path IDs for the later faction implementation tasks.

## Ukraine — Networked Maneuver

Ukraine reaches useful mixed task groups early, then compounds distributed command, reconnaissance quality, mobile recovery, and responsive fires. Its unique `shared-target-network` mechanic depends on current contact quality and fails when relays or spectrum access are disrupted. Premium armor and fires require multiple support branches rather than a single linear rush.

## Russia — Echeloned Pressure

Russia builds supply and command depth before converting it into replacement throughput, prepared fires, air-defense coverage, and successive echelons. Its `operational-mass` mechanic depends on intact supply and command depth and degrades when routes or depots are repeatedly disrupted.

## Contract guarantees

- every production structure lists its producible roster nodes;
- every roster node belongs to a required battlefield slot and names one valid producer;
- all prerequisites are same-faction stable IDs, tier-monotonic, and acyclic;
- every required counter domain has at least two valid roster paths;
- both factions cover the complete RTS capability loop without sharing doctrine or unique mechanics;
- later UFR-071 through UFR-078 tasks implement these IDs without silently changing this schema.

The contract deliberately does not assign final costs, hit points, damage, or build times. Those values belong to roster and balance tasks and must preserve the doctrine distinctions rather than mirror numbers.
