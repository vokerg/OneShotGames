# Player and contributor guide

This is the entry-point manual for **Fields of Resolve**. It summarizes player workflows and contributor routes, then links to the repository contracts that remain authoritative when implementation details change.

## Player quick start

From `ukrainian-front-rts/`:

```bash
./run.sh
```

Open `http://127.0.0.1:8080`. The front end offers campaign operations and skirmish. Use the in-game Audio & Accessibility dialog for volume, accessibility, and key-binding preferences.

If the application fails to start or a change behaves unexpectedly, run the authoritative repository gate before debugging browser symptoms:

```bash
bash verify.sh
```

See [Verification](VERIFICATION.md) for the assembled validation contract.

## Battlefield controls

The authoritative named keyboard actions and defaults are documented in [Input bindings](INPUT_BINDINGS.md). Current defaults are:

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

Bindings are action-centric rather than hard-coded into simulation. Rebinding a named action through accessibility settings changes subsequent keyboard input without changing gameplay authority.

## Building and production

Select a Combat Engineer Section to place Logistics Depot, Infantry Assembly Area, or Repair Workshop construction. A green placement preview is valid; left click starts construction and right click or `Esc` cancels. The engineer must reach and complete the site before production or command-capacity effects become active.

Select a completed production facility to queue its available units. Queuing reserves the required resources and command capacity; the UI reports the current item, remaining time, full queue, and validation failures. The Logistics Depot increases command capacity but is not a production facility.

The content schema, not this guide, is the stable definition of unit/building fields: [Content schema](CONTENT_SCHEMA.md).

## Campaign

The campaign uses a briefing → loading → battlefield → debrief → operations flow. Briefings expose authored objectives, intelligence confidence, available forces, difficulty notes, map preview information, and loading hints. Debriefs expose outcome, score, losses, mission timeline, campaign consequences, and any available next-operation choices.

The canonical presentation contract is [Campaign flow](CAMPAIGN_FLOW.md). Campaign state and progression rules are documented in the campaign/profile documentation linked from that contract.

### Saves and Continue

Campaign persistence uses versioned manual and autosave slots. A save stores the validated campaign profile plus an optional deterministic mission snapshot. Continue selects the newest valid slot; corrupt, unsupported, or missing data does not partially mutate the current campaign. Corrupt and unsupported slots are classified explicitly instead of being treated as healthy saves.

See [Campaign saves](CAMPAIGN_SAVES.md) and [Save migrations](SAVE_MIGRATIONS.md). Do not hand-edit browser storage as a normal recovery procedure; use the in-game save UI and preserve failing data when reporting a reproducible migration/corruption bug.

## Skirmish

Skirmish composes the same simulation, AI, economy, objective, renderer, input, and UI owners as campaign. Setup currently supports:

- three authored battlefields: **Crossing Ground**, **Shelterbelt Grid**, and **Industrial Basin**;
- Ukraine or Russia as the player faction, with the opposite faction assigned to AI;
- `recruit`, `regular`, `veteran`, or `commander` AI difficulty;
- equal starting wallets and paired resource layouts.

Victory is destruction of the opposing command post. Difficulty changes AI observation/reaction cadence, planning quality, risk, and economy utilization; it does not grant hidden resource, combat-stat, fog-of-war, gathering, or command-capacity multipliers.

See [Skirmish framework](SKIRMISH_FRAMEWORK.md) for setup, fairness, economy, production, victory, and after-action ownership.

## Accessibility, audio, and key bindings

The Audio & Accessibility dialog owns persistent player preferences. Accessibility settings currently include UI/text scale, color-vision assist modes, high contrast, reduced motion, reduced flash, cursor size, focus-loss pause, and action-centric key bindings. Unknown/future settings schemas fall back to repository defaults.

See [Accessibility settings](ACCESSIBILITY_SETTINGS.md) and [Audio settings](AUDIO_SETTINGS.md). Binding conflicts are explicit: a physical key can own only one named action, and replacing an occupied binding requires an explicit replacement action.

## Troubleshooting

1. Start the game with `./run.sh` rather than opening `index.html` directly, then use the printed local URL.
2. Run `bash verify.sh`. A syntax, architecture, content, provenance, or deterministic-test failure should be fixed at its owning layer before browser debugging.
3. For control problems, restore default bindings in Audio & Accessibility and compare with [Input bindings](INPUT_BINDINGS.md).
4. For save/Continue problems, preserve the affected slot and compare the reported status with [Campaign saves](CAMPAIGN_SAVES.md) before deleting data.
5. For rendering/readability work, reproduce in a mission and, where applicable, `art-lab.html`; browser-visible changes need the evidence level required by `AGENTS.md`.
6. For audio problems, verify mixer/settings state and the release QA ledger before adding a second playback path.
7. Report the exact operation/skirmish setup, browser-visible action, expected result, actual result, and `bash verify.sh` status. For deterministic gameplay defects, include the simulation seed/tick when available.

## Credits, licensing, and provenance

Fields of Resolve is original repository code and authored/procedural content; it does not include Warcraft assets, maps, dialogue, or source code. Named public figures appear as stylized historical-fiction characters and their game dialogue/roles are fictionalized.

Do **not** assume a single blanket asset license from this guide. The authoritative release-wide source/licensing index is `provenance/release-manifest.json`, described in [Release provenance](RELEASE_PROVENANCE.md). It is fail-closed and delegates detailed records to the visual-art and audio manifests. Every release provenance record requires source, license statement, redistribution status, and validator. The current runtime uses a system font stack and commits no redistributable font binary.

When adding an asset or external reference, update the owning provenance record and pass its validator; do not use `TBD`, `unknown`, or `pending` licensing placeholders.

---

# Contributor guide

## Before changing code

Read `AGENTS.md`, then the task row in `TASKS.md`. Resolve ownership in [Architecture](ARCHITECTURE.md) and [Change guide](CHANGE_GUIDE.md). The default-branch runtime is the source of truth when older prose disagrees.

For queued work:

1. verify dependencies and that no active claim/PR owns the task or hotspot;
2. branch from current `main` as `ufrts/<task-id>-<slug>`;
3. add `tasks/claims/<ID>.md` and open a draft PR immediately;
4. change the smallest authoritative owner and add focused deterministic coverage;
5. run focused checks and `bash verify.sh`, plus the required headed/browser evidence for player-visible work;
6. only after acceptance, remove the claim, add `tasks/completed/<ID>.md`, and record exact evidence in the PR.

One task belongs to one branch/PR unless the queue explicitly defines another integration procedure.

## Architecture landmarks

Use [Architecture](ARCHITECTURE.md), [Runtime composition](RUNTIME_COMPOSITION.md), and [Change guide](CHANGE_GUIDE.md) for current dependency direction. The practical routing rule is:

- declarative content and balance: `src/config.js` or the focused `src/content/` owner;
- schema/identity: `src/content-schema.js`;
- simulation rules: focused `src/systems/` owner with a small public `Game` facade where needed;
- AI observation/planning: `src/ai/`;
- browser commands/input: `src/input/`;
- mission/frame composition: `src/app/`;
- presentation: renderer and `src/ui*` modules;
- audio: `src/audio/`;
- deterministic repository contracts: focused scripts/tests, with `verify.sh` remaining the top-level gate.

Never fix authoritative gameplay state in the renderer/UI, put simulation rules in animation-frame callbacks, or use browser/wall-clock randomness for replay-relevant decisions.

## Adding a gameplay unit or building

1. Read [Content schema](CONTENT_SCHEMA.md) and identify the authoritative record collection. Units and buildings use collection keys as canonical IDs.
2. Add the declarative record to `src/config.js` or the focused `src/content/` module that owns that family. Use existing faction/archetype/reference IDs; do not invent a parallel registry.
3. If the record must be produced, update the owning building/production data and relevant cross-record validator. A visual-only addition is not sufficient for a producible unit.
4. If you need a new required field, rename, type change, identity change, or semantic default change, treat it as a schema-version/migration decision and update `src/content-schema.js` plus [Content schema](CONTENT_SCHEMA.md).
5. Add focused deterministic tests for validation, production/cost/capacity behavior, and any new mechanic. New mechanics belong in their simulation owner, not in the content record or renderer.
6. For new/changed visual or audio material, update the source/provenance ledger and run the relevant visual/audio verification.
7. Run `bash verify.sh`; perform headed/browser evidence when readability, interaction, sound, or game feel is part of acceptance.

## Adding a campaign scenario

1. Define the campaign/content identity using the current mission/content owner and validate it against [Content schema](CONTENT_SCHEMA.md).
2. Author battlefield data through the versioned [Authored map format](AUTHORED_MAP_FORMAT.md). Keep coordinates, starts, resources, regions, terrain overlays, and metadata JSON-compatible and deterministic.
3. Author scripted objectives/events through [Mission scripting](MISSION_SCRIPTING.md). Use stable trigger IDs, declaration-order evaluation, fixed simulation ticks, seeded randomness where randomness is required, and existing public spawn/outcome boundaries.
4. Keep visual/audio presentation as read-only consumers of mission state/events. Do not make mission success depend on dialogue, camera, renderer, or audio consumers.
5. Add deterministic mission/harness coverage with an explicit seed and exact ticks. If persistence can occur during the scenario, verify save/checkpoint/replay compatibility for the changed state.
6. Validate briefing/debrief/operations integration and complete browser playthrough evidence at the level required by the task.
7. Update provenance for any new source art/audio/reference material and run `bash verify.sh`.

## Modifying legacy-sensitive systems

`legacy-source/` is parity/reference material, not an implementation dependency. Do not import, execute, wrap, or copy opaque legacy runtime code into the modern game. Reconstruct required behavior through the modern authoritative contracts and document semantic differences when exact legacy behavior is intentionally not preserved.

Before touching a legacy-sensitive subsystem:

- compare current `main` behavior with the applicable parity/reconciliation docs;
- identify the modern authoritative owner first;
- reproduce the behavioral gap with a deterministic test or explicit browser evidence;
- implement through current public commands/data/events instead of adding a legacy bypass;
- re-run architecture/parity/verification gates and document any replay/save/schema implications.

See [Runtime/content reconciliation](RUNTIME_CONTENT_RECONCILIATION.md) and, for abandoned work recovery, [Stranded branch recovery](STRANDED_BRANCH_RECOVERY.md).

## Verification and evidence

`bash verify.sh` is the authoritative assembled gate. Focused tests are useful during development, but they do not replace it. Tests under `tests/**/*.test.mjs` are automatically discovered by the repository test runner.

Evidence levels in `AGENTS.md` are cumulative in purpose: deterministic tests prove code/state contracts; headed render checks prove render-facing behavior; browser QA proves composed interaction. Do not claim a higher evidence level than was actually run. Record exact commands, browser checks, and remaining environmental limits in the PR/completion marker.

## Documentation ownership

Keep this guide as an entry point, not a duplicate specification. When an authoritative subsystem contract changes, update its focused document first and then change this guide only if the player/contributor route changed. Local links in this guide are validated by the documentation test so renamed or removed canonical docs fail CI rather than silently rotting.
