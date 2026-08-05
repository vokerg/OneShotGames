# AI difficulty profiles

UFR-082 owns fair, deterministic AI difficulty variation. Profiles live in `src/ai/ai-difficulty-profiles.js` and compose the existing UFR-079 doctrine, UFR-080 economy-planning, and UFR-081 tactical-planning contracts without replacing their simulation ownership.

## Difficulty dimensions

Profiles vary only these decision inputs:

- **Information:** all profiles remain `observed-only`; lower profiles receive observed contacts after a longer deterministic delay.
- **Reaction delay:** lower profiles wait longer between an observation and a planning cycle.
- **Planning quality:** lower profiles use a longer decision cadence and retreat more conservatively.
- **Risk tolerance:** profiles alter doctrine risk appetite within bounded values.
- **Economy efficiency:** profiles limit utilization, concurrent planning, and reserve policy; they do not create resources or alter costs/build times.

The shipped profiles are `recruit`, `regular`, `veteran`, and `commander`. `regular` is the default.

## Fair-play invariant

Default profiles must keep resource, damage, health, cost, and build-time multipliers at exactly `1`. They must not expose full-map vision or bypass fog of war. `createAiDifficultyProfile()` rejects such cheats rather than silently normalizing them.

## Integration boundary

`createAiDifficultyRuntimePolicy()` returns an immutable adjusted doctrine plus economy limits. Runtime owners may select a profile and feed those values into the existing planners. The profile module does not issue commands, mutate units, replace `game.update`, or inspect hidden entities.

Observed contacts are projected through `projectObservedContactsForDifficulty()`, which only delays already observed records and applies stable ordering. The same inputs produce byte-for-byte equivalent JSON snapshots.
