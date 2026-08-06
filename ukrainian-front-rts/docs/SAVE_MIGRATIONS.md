# Campaign save migration policy

Campaign saves use an integer envelope version. `src/core/campaign-save-migrations.js` is the authoritative registry for released campaign-save schemas.

## Guarantees

- Every released version below the current version has one explicit sequential migration.
- Migration runs before current-schema validation.
- The original serialized save is retained as backup material whenever migration changes the envelope version.
- Future versions and malformed data are rejected; they are never rewritten as current saves.
- Current-version saves are canonicalized without creating redundant backups.
- Migration fixtures assert preservation of campaign profile and mission-state data.

## Adding a schema version

1. Increment `CAMPAIGN_SAVE_VERSION`.
2. Add the previous version to `RELEASED_CAMPAIGN_SAVE_VERSIONS` if needed.
3. Add exactly one migration from the previous version to the new version.
4. Add a fixture representing the last released envelope and assert all durable fields survive.
5. Add unsupported-future and corrupt-data coverage.
6. Run `node --test tests/campaign/campaign-save-migrations.test.mjs` and `bash verify.sh`.

Backups use `fields-of-resolve:campaign-save-backup:v<sourceVersion>:<encodedSlotId>`. Storage/UI integration must write this backup before replacing the active slot and must surface unsupported-version messaging rather than deleting or coercing the save.
