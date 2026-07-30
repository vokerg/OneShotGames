# UFR-073 post-merge contract audit

- Original implementation: PR #92
- Corrective implementation: PR #96
- Reviewed dependencies: UFR-070, UFR-038, UFR-039

## Findings

1. The original validator did not compare profile tiers, producers, or prerequisites with UFR-070.
2. The original resource model used parallel `manpower`/`materiel`/`command` values instead of the established `metal`/`fuel`/`intel` economy vocabulary.
3. Drone and counter-UAS records did not expose configurations directly consumable by UFR-038 and UFR-039.
4. Additional capabilities were represented as parallel identities rather than explicit variants beneath the two stable UFR-070 roster nodes.
5. The focused tests proved local self-consistency but did not execute dependency APIs.

## Correction

PR #96 introduces schema version 2 with canonical roster-node variants, exact UFR-070 mapping, UFR-038/UFR-039 runtime adapters, canonical air-target classes, legacy alias resolution, stronger validation, and dependency-contract tests.
