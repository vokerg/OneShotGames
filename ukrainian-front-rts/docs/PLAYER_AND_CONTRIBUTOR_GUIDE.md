# Player and contributor guide

This is the entry-point manual for **Fields of Resolve**. It explains how to launch and play the current campaign and skirmish modes, where saves/settings live, how accessibility and troubleshooting work, and how contributors route changes through the repository's authoritative contracts.

## Player quick start

From `ukrainian-front-rts/`:

```bash
./run.sh
```

Open `http://127.0.0.1:8080`. Use the front screen to enter campaign operations or skirmish. Use the in-game Audio & Accessibility dialog for volume, accessibility, focus-pause, and key-binding preferences.

Do not open `index.html` directly from the filesystem: the supported local path is the static server started by `./run.sh`. If a checkout behaves unexpectedly, `bash verify.sh` is the authoritative assembled repository gate. See [Verification](VERIFICATION.md).

## Battlefield controls

The authoritative named actions and defaults are documented in [Input bindings](INPUT_BINDINGS.md). Current defaults are:

- left click or drag: select units;
- Shift-click: add to selection;
- right click: move, attack, or cancel construction placement;
- `Q`, then right click: attack-move;
- `X`: stop selected units;
- `T`: toggle auto-fire for selected combat units;
- `Esc`: cancel construction placement;
- WASD or arrow keys: pan the camera;
- mouse wheel: zoom;
- minimap click: move the camera.

Bindings are action-centric. Rebinding a named action in Audio & Accessibility changes subsequent keyboard input without changing simulation authority. Binding conflicts are explicit: replacing a key already owned by another action requires an explicit replacement.

## Building and production

Select a Ukrainian Combat Engineer Section to place a Logistics Depot, Infantry Assembly Area, or Repair Workshop. A valid placement is shown by the placement preview; left click starts construction and right click or `Esc` cancels. The assigned engineer must reach and finish the structure before production or command-capacity effects become active.

Select a completed production building to queue available units. Queuing reserves the required resources and command capacity; the UI reports queue state and validation failures. Logistics Depots raise command capacity but do not produce units. The stable content fields are defined by [Content schema](CONTENT_SCHEMA.md).

## Campaign

Campaign flow is briefing → loading → battlefield → debrief → operations. Briefings expose authored objectives, intelligence confidence, available forces, difficulty context, map preview information, and loading hints. Debriefs report outcome, score, losses, mission timeline, campaign consequences, and available next-operation choices.

The current campaign operations use the authored mission/content contracts for Donbas, Zaporizhzhia, and Kherson. Campaign difficulty changes resources and pressure/reinforcement/objective timing according to the campaign balance contract; it does not apply a hidden combat-stat multiplier. The canonical presentation and progression route is [Campaign flow](CAMPAIGN_FLOW.md).

### Saves and Continue

Campaign persistence uses versioned manual and autosave slots. A save stores a validated campaign profile plus an optional deterministic mission snapshot. Continue chooses the newest valid slot; corrupt, unsupported, or missing data does not partially mutate the live campaign.

In the browser, campaign saves are stored in that site's `localStorage` under the namespace `fields-of-resolve:campaign-save:<slot-id>`. Migration backups use `fields-of-resolve:campaign-save-backup:<slot-id>`. Therefore saves are local to the browser/profile and origin used to run the game; clearing site storage or using a different browser profile removes access to those local slots unless they were exported/backed up separately.

See [Campaign saves](CAMPAIGN_SAVES.md) and [Save migrations](SAVE_MIGRATIONS.md) for the authoritative envelope, corruption, migration, backup, and restoration rules. Do not hand-edit localStorage as a normal recovery procedure. Preserve failing save data when reporting a reproducible migration/corruption defect.

## Skirmish

Skirmish composes the same simulation, AI, economy, objective, renderer, input, and UI owners as campaign. Setup supports:

- three authored battlefields: **Crossing Ground**, **Shelterbelt Grid**, and **Industrial Basin**;
- Ukraine or Russia as the player faction, with the opposite faction assigned to AI;
- `recruit`, `regular`, `veteran`, or `commander` AI difficulty;
- equal starting wallets and paired resource layouts.

Victory is destruction of the opposing command post. Difficulty changes AI observation/reaction cadence, planning quality, risk, and economy utilization; it does not grant hidden resource, combat-stat, fog-of-war, gathering, or command-capacity multipliers. See [Skirmish framework](SKIRMISH_FRAMEWORK.md) for the authoritative map, faction, economy, production, victory, and fairness contracts.

## Accessibility, audio, and key bindings

The Audio & Accessibility dialog owns persistent player preferences. Accessibility settings include UI/text scale, color-vision assist modes, high contrast, reduced motion, reduced flash, cursor size, focus-loss pause, and action-centric key bindings. Unknown or future settings schemas fall back to repository defaults rather than being partially applied.

See [Accessibility settings](ACCESSIBILITY_SETTINGS.md) and [Audio settings](AUDIO_SETTINGS.md). Audio autoplay/resume follows browser policy: if a browser suspends audio until user interaction, use a normal game interaction to resume rather than treating the suspended state as lost audio content.

## Troubleshooting

1. Start with `./run.sh` and the printed local URL; do not use a `file://` page.
2. Run `bash verify.sh`. Fix syntax, architecture, content, provenance, deterministic, or browser-smoke failures at their owning layer before adding workarounds.
3. For controls, restore default bindings and compare with [Input bindings](INPUT_BINDINGS.md).
4. For save/Continue issues, preserve the affected `fields-of-resolve:campaign-save:` slot and compare the reported status with [Campaign saves](CAMPAIGN_SAVES.md) before clearing storage.
5. For rendering/readability changes, reproduce in a mission and, where applicable, `art-lab.html`; player-visible work needs the evidence level required by `AGENTS.md`.
6. For audio problems, verify mixer/settings state and browser autoplay state before adding a second playback path.
7. When filing a defect, record the campaign operation or skirmish setup, browser-visible action, expected result, actual result, and `bash verify.sh` status. For deterministic gameplay defects, include the simulation seed/tick when available.

## Credits, licensing, and provenance

Fields of Resolve uses original repository code and authored/procedural content; it does not include Warcraft assets, maps, dialogue, or source code. Named public figures appear as stylized historical-fiction characters and their game dialogue/roles are fictionalized.

Do **not** infer a blanket asset license from this guide. The authoritative release-wide source/licensing index is `provenance/release-manifest.json`, documented by [Release provenance](RELEASE_PROVENANCE.md). It is fail-closed and delegates detailed records to the visual-art and audio manifests. Release provenance records require source, license statement, redistribution status, and validator. The runtime uses a system font stack and does not commit a redistributable font binary.

When adding an asset or external reference, update the owning provenance record and pass its validator; do not ship `TBD`, `unknown`, or `pending` licensing placeholders.

---

# Contributor guide

## Before changing code

Read `AGENTS.md`, then the task row in `TASKS.md`. Resolve ownership in [Architecture](ARCHITECTURE.md) and [Change guide](CHANGE_GUIDE.md). Current `main` runtime behavior and focused canonical contracts win when older prose disagrees.

For queued work:

1. verify dependencies and that no active claim/PR owns the task or hotspot;
2. branch from current `main` as `ufrts/<task-id>-<slug>`;
3. add `tasks/claims/<ID>.md` and open a draft PR immediately;
4. change the smallest authoritative owner and add focused deterministic coverage;
5. run focused checks and `bash verify.sh`, plus required headed/browser evidence for player-visible work;
6. synchronize current `main` before completion;
7. only after acceptance, remove the claim, add `tasks/completed/<ID>.md`, mark the PR ready, and record exact verification evidence.

One task belongs to one branch/PR unless the queue explicitly defines another integration procedure.

## Architecture landmarks

Use [Architecture](ARCHITECTURE.md), [Runtime composition](RUNTIME_COMPOSITION.md), and [Change guide](CHANGE_GUIDE.md) for dependency direction. Practical routing:

- declarative content and balance: `src/config.js` or the focused `src/content/` owner;
- schema/identity: `src/content-schema.js`;
- simulation rules: focused `src/systems/` owner with a small public `Game` facade where needed;
- AI observation/planning: `src/ai/`;
- browser commands/input: `src/input/`;
- mission/frame composition: `src/app/`;
- skirmish catalog/runtime: `src/skirmish/`;
- presentation: renderer and `src/ui*` modules;
- audio: `src/audio/`;
- deterministic repository contracts: focused scripts/tests, with `verify.sh` as the top-level gate.

Never fix authoritative gameplay state in renderer/UI code, put simulation rules in animation-frame callbacks, or use browser/wall-clock randomness for replay-relevant decisions.

## Adding a gameplay unit or building

1. Read [Content schema](CONTENT_SCHEMA.md) and identify the authoritative record collection. Collection keys are canonical IDs.
2. Add the declarative record to `src/config.js` or the focused content owner. Reuse existing faction/archetype/reference identities; do not create a parallel registry.
3. If the record is producible, update the owning production data and cross-record validation. A visual-only record is not a playable unit.
4. Treat new required fields, renames, type/identity changes, and semantic-default changes as schema/migration decisions; update the schema contract and migrations where required.
5. Add focused deterministic tests for validation, production/cost/capacity, and any new mechanic. Mechanics belong in simulation owners, not renderer/content records.
6. Update provenance for new/changed visual or audio material.
7. Run `bash verify.sh` and the headed/browser evidence required for readability, interaction, sound, or game feel.

## Adding a campaign scenario

1. Define campaign/content identity through the current mission/content owner and validate it against [Content schema](CONTENT_SCHEMA.md).
2. Author battlefield data through [Authored map format](AUTHORED_MAP_FORMAT.md), keeping coordinates, starts, resources, regions, terrain overlays, and metadata deterministic and JSON-compatible.
3. Author scripted objectives/events through [Mission scripting](MISSION_SCRIPTING.md), with stable trigger IDs, declaration-order evaluation, fixed simulation ticks, and seeded randomness.
4. Keep visual/audio presentation as read-only consumers of mission state/events; success must not depend on dialogue, camera, renderer, or audio consumers.
5. Add deterministic mission/harness coverage with an explicit seed and exact ticks. If persistence can occur during the scenario, verify save/checkpoint/replay compatibility.
6. Validate briefing/debrief/operations integration and complete the browser playthrough evidence required by the task.
7. Update provenance for new source art/audio/reference material and run `bash verify.sh`.

## Save and persistence changes

The pure save-envelope and slot policy lives in `src/core/campaign-save-service.js`; browser composition belongs in `src/app/campaign-save-runtime.js`. Do not teach the core serializer about `window`, DOM objects, renderer state, or live entity references. Incompatible envelope/profile changes require explicit version/migration fixtures and no silent data loss. Start with [Campaign saves](CAMPAIGN_SAVES.md) and [Save migrations](SAVE_MIGRATIONS.md).

## Release-facing changes

Release work must preserve the same ownership and evidence rules as gameplay work. Before calling a release-facing task complete:

- run `bash verify.sh` on the branch synchronized with current `main`;
- keep release performance thresholds in [Release performance budgets](RELEASE_PERFORMANCE_BUDGETS.md) and balance drift in [Release balance baseline](RELEASE_BALANCE_BASELINE.md) rather than inventing PR-local thresholds;
- update `provenance/release-manifest.json` and its owning source/license records for changed release inputs;
- use the repository's browser/visual/audio/accessibility checks when acceptance is player-visible;
- record exact verification and known environmental limits in the completion marker/PR rather than claiming evidence that was not run.

Packaging, QA, release notes, checksums, and rollback automation belong to their focused release tasks/contracts; documentation must link those owners rather than duplicating a second release process.

## Modifying legacy-sensitive systems

`legacy-source/` is parity/reference material, not an implementation dependency. Do not import, execute, wrap, or copy opaque legacy runtime code into the modern game. Reconstruct required behavior through modern authoritative contracts and document semantic differences when exact legacy behavior is intentionally not preserved.

Before touching a legacy-sensitive subsystem, compare current `main` behavior with the applicable parity/reconciliation docs, identify the modern authoritative owner, reproduce the gap with deterministic or browser evidence, implement through current public commands/data/events, then re-run architecture/parity/verification gates. See [Runtime/content reconciliation](RUNTIME_CONTENT_RECONCILIATION.md) and [Stranded branch recovery](STRANDED_BRANCH_RECOVERY.md).

## Verification and evidence

`bash verify.sh` is the authoritative assembled gate. Focused tests are useful during development but do not replace it. Tests under `tests/**/*.test.mjs` are automatically discovered by the repository test runner.

Evidence levels in `AGENTS.md` are cumulative in purpose: deterministic tests prove code/state contracts; headed render checks prove render-facing behavior; browser QA proves composed interaction. Do not claim a higher evidence level than was actually run. Record exact commands, browser checks, and remaining environmental limits in the PR/completion marker.

## Documentation ownership

Keep this guide as an entry point, not a duplicate specification. When an authoritative subsystem contract changes, update its focused document first and change this guide only if the player/contributor route changed. Local links in this guide are validated by the documentation test so renamed or removed canonical docs fail CI rather than silently rotting.
