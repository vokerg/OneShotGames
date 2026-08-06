# Campaign save migration policy

Campaign saves use an integer envelope version. `src/core/campaign-save-migrations.js` is the authoritative registry for released campaign-save and campaign-profile schemas. `createCampaignSaveRuntime()` installs that registry by default, so browser and headless runtime loads use the same migration path.

## Released schemas

- Campaign save envelope version 0: legacy timestamp-based envelope.
- Campaign save envelope version 1: current envelope with explicit kind, label, creation/update timestamps, profile, and optional mission state.
- Campaign profile version 1: current and only released campaign-profile schema.

## Guarantees

- Every released save version below the current version has one explicit sequential migration.
- Migration runs before current-schema validation.
- A successful migration writes the original serialized save to `fields-of-resolve:campaign-save-backup:v<sourceVersion>:<encodedSlotId>` before replacing the active slot with canonical current-version JSON.
- If backup persistence fails, conflicts with different existing backup contents, or resolves to the active slot key under custom prefixes, the active legacy slot is not rewritten and the load reports `storage-error`.
- Future campaign-save and campaign-profile versions return actionable `unsupported-version` results; malformed data returns `corrupt`. None are rewritten.
- Saving over an unsupported or corrupt slot is refused until the caller explicitly deletes or otherwise resolves that slot.
- Current-version saves are validated without creating redundant backups.
- Migration fixtures assert preservation of campaign profile, mission result, choice, upgrade, medal, simulation seed, and mission snapshot data.

## Adding a schema version

1. Increment `CAMPAIGN_SAVE_VERSION` or `CAMPAIGN_PROFILE_VERSION` as appropriate.
2. Add the previous released version to the corresponding released-version registry if needed.
3. Add exactly one sequential migration from the previous save-envelope version to the new version.
4. Add a fixture representing every released source schema and assert all durable fields survive.
5. Add runtime coverage proving the registry is installed, the original is backed up before rewrite, and backup failure leaves the source untouched.
6. Add unsupported-future save/profile, corrupt-data, destructive-overwrite, and custom-key-collision coverage.
7. Run `node --test tests/campaign/campaign-save-migrations.test.mjs`, `node --test tests/campaign/campaign-save-runtime.test.mjs`, and `bash verify.sh`.

Backups are recovery material and are not included in normal slot enumeration. A later diagnostics/reset UI may expose export or cleanup actions, but it must not silently delete an unsupported, corrupt, or migration-source save.
