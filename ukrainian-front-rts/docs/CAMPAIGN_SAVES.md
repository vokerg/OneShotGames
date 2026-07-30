# Campaign save service

`src/core/campaign-save-service.js` owns the dependency-free save-envelope, slot, migration, and restoration policy for campaign persistence. It consumes the UFR-084 campaign-profile contract and receives storage and clock dependencies explicitly. It does not access `window`, `localStorage`, the DOM, `Game`, UI, renderer, or live entities.

## Save envelope

`CAMPAIGN_SAVE_VERSION` is currently `1`. A normalized envelope contains:

- stable `slotId` and `kind` (`manual` or `autosave`);
- optional player-facing `label`;
- integer `createdAt` and `updatedAt` metadata supplied by an injected clock;
- a fully validated canonical campaign `profile`;
- optional deterministic `missionState` containing `operationId`, fixed-step `tick`, `simulationSeed`, and a JSON-compatible reference-free `snapshot`.

Envelopes and nested values are deeply frozen. Serialization validates the profile and save envelope again, canonicalizes nested mission JSON keys, and rejects functions, class instances, non-finite numbers, cycles, DOM nodes, renderer objects, and mutable entity references.

Mission state may only reference an operation already unlocked in the campaign profile. Checkpoint-specific trigger restoration remains UFR-090; UFR-085 only preserves an opaque deterministic snapshot boundary.

## Storage boundary

`createCampaignSaveService()` requires:

- an injected storage object;
- an injected `now()` function;
- optional sequential version migrations;
- optional key prefix and autosave slot ID.

`createCampaignStorageAdapter()` accepts either a `keys()`-capable adapter or a localStorage-compatible object with `length` and `key(index)`. The module never reads the browser global itself. `createMemoryCampaignStorage()` provides a deterministic in-memory implementation for tests and headless consumers.

Storage values use a namespaced key per slot. Manual saves and the fixed autosave slot share the same envelope contract. Replacing a slot preserves `createdAt` and changes `updatedAt`; autosave replacement never creates duplicate autosave entries.

## Runtime composition

`src/app/campaign-save-runtime.js` composes the pure service with application state without teaching the serializer about `Game`, campaign UI, or browser globals.

`createCampaignSaveRuntime()` receives two authoritative callbacks:

- `captureState()` returns `{ profile, missionState }` for a manual save or autosave;
- `restoreState()` receives one frozen restoration record containing the validated profile, optional mission state, source slot, and save envelope.

Using one restoration callback makes campaign and mission replacement a single application-level transaction. Missing, corrupt, unsupported, or storage-error results never call the restorer and therefore cannot partially mutate live state.

`createBrowserCampaignSaveRuntime()` is the browser composition entry point. It accepts an injected `windowTarget`, reads that target's localStorage-compatible object, and otherwise delegates to the same runtime contract. This keeps browser access in `src/app/` and allows identical headless fixtures.

The mission-state producer remains explicit. UFR-085 stores and returns a deterministic reference-free snapshot, while UFR-090 will define checkpoint capture and trigger-safe application of that snapshot to the live mission runtime.

## Operations

The service exposes:

- `saveSlot()` for manual or explicitly typed slots;
- `autosave()` for deterministic replacement of the configured autosave slot;
- `loadSlot()` for typed, non-throwing stored-data results;
- `restoreSlot()` for campaign-profile and mission-snapshot restoration payloads;
- `listSlots()` for deterministic metadata ordering;
- `continueCampaign()` for the newest valid save;
- `deleteSlot()` for idempotent removal.

The runtime wrapper exposes the same user-facing save, autosave, load, Continue, list, and delete operations while automatically obtaining and applying application state through its callbacks.

Valid slots are ordered by newest `updatedAt`, then newest `createdAt`, then stable slot ID. Corrupt or unsupported saves are listed after valid saves and are ignored by Continue rather than blocking healthy slots.

## Failure contract

Stored-data reads return one of:

- `ok`;
- `missing`;
- `corrupt`;
- `unsupported-version`;
- `storage-error`.

Malformed JSON, inconsistent slot IDs, invalid profiles, locked mission operations, and invalid mission snapshots are reported as corrupt. Future versions and older versions without a registered migration are reported as unsupported. Storage read failures are distinguished from data corruption. Writes and deletes throw actionable storage-operation errors because the requested mutation did not complete.

## Versioning and migrations

Migrations are registered by source version. Each migration receives a frozen defensive clone and must produce exactly the next integer version. The migrated envelope is fully validated after every sequential step. UFR-085 ships only version `1`; future incompatible changes must add explicit migration fixtures rather than silently accepting alternate shapes.

Campaign-profile migrations remain owned by the UFR-084/UFR-085 boundary. Save-envelope migrations may call profile migration functions when those are introduced, but they must not bypass profile validation.

## Ownership boundaries

- UFR-084 owns campaign profile shape and mutation rules.
- UFR-085 owns envelopes, storage-slot policy, autosave replacement, migration dispatch, corruption classification, application composition, and deterministic restoration payloads.
- UFR-086 owns mission scripting and trigger/action state.
- UFR-089 owns save/load/continue presentation and user interaction.
- UFR-090 owns checkpoint capture and trigger-safe checkpoint restoration.
- Replay recording and replay-file persistence remain UFR-147.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/core/campaign-save-service.js
node --check src/app/campaign-save-runtime.js
node --check tests/campaign/campaign-save-service.test.mjs
node --check tests/campaign/campaign-save-runtime.test.mjs
node --test tests/campaign/campaign-save-service.test.mjs tests/campaign/campaign-save-runtime.test.mjs
bash verify.sh
```

The focused fixtures cover canonical round trips, deterministic profile/mission restoration, overwrite metadata, autosave replacement, stable slot ordering, Continue selection, missing/corrupt/future-version classification, sequential migration, deletion, locked-operation rejection, invalid snapshot rejection, atomic application callbacks, and localStorage-compatible browser composition.