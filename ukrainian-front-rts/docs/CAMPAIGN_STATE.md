# Campaign profile state

`src/core/campaign-profile.js` owns the dependency-free, versioned campaign profile contract introduced by UFR-084. It is authoritative for persistent campaign choices and results, but it does not own storage, autosave timing, mission checkpoints, or browser APIs.

## Profile shape

A normalized profile contains:

- `version` — serialization schema version;
- `profileId` — stable profile identity;
- `difficulty` — `story`, `standard`, or `veteran`;
- `revision` — monotonic mutation revision;
- `unlockedOperationIds` — stable sorted set of available operations;
- `completedOperationIds` — stable sorted set of victorious operations;
- `choices` — canonical deep-frozen JSON-compatible campaign decisions;
- `missionResults` — per-operation outcome, best score, attempts, completion tick, and medals;
- `unlockedUpgradeIds` — stable sorted set of persistent upgrades;
- `medalIds` — stable sorted set of all campaign medals.

All returned profiles and nested collections are frozen. Callers replace the profile reference after a successful mutation rather than modifying it in place.

## Mutation contract

The public mutation helpers validate their inputs and return a new profile with `revision + 1` when state changes:

- `setCampaignDifficulty`;
- `unlockCampaignOperation`;
- `setCampaignChoice`;
- `unlockCampaignUpgrade`;
- `awardCampaignMedal`;
- `recordCampaignMissionResult`.

Set-like mutations are idempotent. Repeating an existing difficulty, operation unlock, upgrade unlock, medal award, or equivalent canonical choice returns the validated current profile without incrementing its revision.

Mission-result recording is deterministic:

- attempts always accumulate;
- the highest score is retained;
- a victory cannot be overwritten by a later defeat or withdrawal;
- the earliest recorded victory completion tick is retained;
- mission medals are deduplicated and added to the campaign medal set;
- results are rejected for locked operations.

## Consistency rules

Validation rejects profiles where:

- the version is unsupported;
- identifiers, difficulty, outcome, revision, scores, attempts, or ticks are invalid;
- a completed operation lacks a victory result;
- a victory result is not listed as completed;
- a result exists for a locked operation;
- a mission medal is absent from the campaign medal set;
- choices contain non-finite numbers, unsupported values, non-plain objects, or cycles.

These checks apply both to live mutations and deserialization, so corrupt or internally contradictory state cannot silently enter the campaign layer.

## Serialization and versioning

`serializeCampaignProfile` validates and emits canonical JSON. Stable sorting of sets, record keys, and choice-object keys makes equivalent profiles serialize identically regardless of insertion order.

`deserializeCampaignProfile` rejects empty input, malformed JSON, unsupported versions, and inconsistent records. UFR-084 defines version `1` and intentionally provides no migration dispatcher. UFR-085 owns save slots, storage adapters, corruption recovery UX, autosave, and future migration routing.

A future breaking state change must:

1. increment `CAMPAIGN_PROFILE_VERSION`;
2. define explicit migration behavior in the save service;
3. preserve or intentionally invalidate old profiles with documented handling;
4. add round-trip, migration, and corruption fixtures.

Additive runtime behavior must not write undeclared fields into serialized profiles. New persistent fields require a versioning decision and corresponding validation.

## Ownership boundaries

- `src/core/campaign-profile.js`: profile shape, deterministic mutations, consistency validation, canonical serialization.
- UFR-085 save service: storage medium, slots, autosave, load/continue, migration dispatch, user-facing corruption handling.
- UFR-086 mission scripting: trigger/action execution and mission-state transitions.
- UFR-089 campaign UI: briefing, debrief, profile presentation, and flow controls.
- UFR-091 progression: modernization choice rules and campaign balance.

The campaign profile remains browser-independent and contains IDs and JSON values only—never DOM nodes, renderer objects, mutable game entities, callbacks, or wall-clock objects.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/core/campaign-profile.js
node --check tests/campaign/campaign-profile.test.mjs
node --test tests/campaign/campaign-profile.test.mjs
bash verify.sh
```

The focused suite covers deterministic defaults, idempotent mutations, stable set ordering, defensive choice cloning/freezing, mission aggregation, locked-operation rejection, canonical round trips, malformed JSON, unsupported versions, and internal consistency failures.
