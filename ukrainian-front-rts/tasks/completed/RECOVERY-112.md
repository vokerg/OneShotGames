# RECOVERY-112 — Reconcile active runtime content

- Owning issue: #112
- Pull request: #120
- Evidence level: `RUNTIME_INTEGRATED`
- Base commit: `91e867459f06d729c40682943d85736e2cef9526`
- Passing implementation head: `d9fa1f5ae0260a0a979ed99a5d481874bdc67b56`
- Passing workflow run: `30740047889`
- Passing workflow job: `91475711057`
- Diagnostics artifact: `8830962260` (`ukrainian-front-rts-verification-30740047889`)

## Delivered

- Replaced active real-public-figure command units with fictional Ukrainian `uaCommandVarta` and Russian `ruCommandBastion` identities.
- Mapped both legacy command IDs per faction deterministically onto one current command identity and de-duplicated mission arrays.
- Added deterministic migration for legacy public-figure IDs and canonical roster IDs.
- Campaign restore migrates supported legacy mission snapshots before mutating live state and returns an actionable `unsupported-content` result for unknown unit types.
- Projected every active runtime unit onto one UFR-070 canonical roster identity, producer, prerequisite list, content owner, resource vocabulary, command-capacity cost, and targeting-domain contract.
- Normalized Russian prototype costs to the shared `metal`, `fuel`, and `intel` vocabulary with positive command-capacity costs.
- Added exclusive stable-ID ownership validation across UFR-071 through UFR-078 declarative content families.
- Added a dedicated runtime-content verification stage and documented the runtime composition matrix plus intentionally unwired future integration owners.

## Self-review

- The branch is based directly on current `main` and is zero commits behind.
- No navigation, simulation-phase, broad balance redesign, new mission, final art, voice, or sibling-game files are changed.
- Mission hero arrays are migrated and de-duplicated deterministically.
- Unsupported content is rejected before the application restorer is invoked.
- Active player-facing unit names and roles contain no legacy public-figure identities.
- Every active production entry resolves to a current runtime unit and an allowed canonical producer.
- Duplicate stable-ID ownership, duplicate canonical runtime projection, resource-vocabulary drift, invalid command-capacity cost, and unsupported unit references fail verification.

## Verification evidence

Authoritative workflow run `30740047889` passed on implementation head `d9fa1f5ae0260a0a979ed99a5d481874bdc67b56`:

- 801 tests passed, 0 failed or skipped;
- 168 task records validated;
- 8 content-schema families validated;
- production content validated for 18 units, 4 buildings, 6 upgrades, and 3 missions;
- 10-node technology graph passed;
- runtime reconciliation passed for 16 active units, 3 missions, and 4 legacy migrations;
- architecture verification passed for 132 JavaScript modules;
- 285 ordered verifier stages passed;
- active-claim diagnostics passed;
- browser startup and first-mission smoke passed with a valid canvas, three mission cards, and zero warnings;
- completion-evidence audit and diagnostics upload passed.

## Evidence limits

This verifies runtime composition, deterministic migration, campaign-restore failure behavior, active production mappings, declarative ownership boundaries, and automated browser entry into the first mission. It does not claim manual campaign completion, final balance, full declarative-roster integration, final art, localization, voice, audio, or promotional capture. Those remain with the owners listed in `docs/RUNTIME_CONTENT_RECONCILIATION.md`.
