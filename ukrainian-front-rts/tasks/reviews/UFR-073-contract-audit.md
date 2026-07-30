# UFR-073 post-merge contract audit

- Base: `dafa9f14e6d5e095dd01304aeb21239b60f30ff4`
- Original task: UFR-073, merged in PR #92
- Intended files: UAS/EW content contract, focused tests, documentation, completion evidence

## Findings

1. The original validator did not compare profiles to UFR-070 tier, producer, or prerequisite contracts.
2. Runtime-facing fields did not use the public UFR-038/UFR-039 configuration vocabulary.
3. Costs used a parallel resource model instead of the established `metal`, `fuel`, and `intel` model.
4. Additional profiles were parallel identities rather than variants beneath the stable UFR-070 roster nodes.

## Correction plan

1. Introduce canonical roster-node variants and exact dependency validation.
2. Add UFR-038/UFR-039 runtime adapters and canonical air-target classes.
3. Replace shallow self-consistency tests with dependency-contract execution tests.
4. Record post-merge correction evidence without changing the task queue state.
