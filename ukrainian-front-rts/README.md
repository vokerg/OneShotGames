# Fields of Resolve

A modular, dependency-free retro RTS set in a stylized fictionalized version of the war in Ukraine. It uses original code and authored/procedural content; no Warcraft assets, maps, dialogue, or source code are included.

The approved release scope, quality bar, supported platforms, session targets, campaign length, and explicit non-goals are defined in [`docs/PRODUCT_PILLARS.md`](docs/PRODUCT_PILLARS.md).

## Start here

From `ukrainian-front-rts/`:

```bash
./run.sh
```

Then open `http://127.0.0.1:8080`.

For the complete player and contributor entry point, read [`docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md`](docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md). It covers controls, campaign, skirmish, saves, accessibility, troubleshooting, credits/provenance, architecture, contributor workflow, adding gameplay content, adding campaign scenarios, and legacy-sensitive changes.

For focused unit-art review, open `http://127.0.0.1:8080/art-lab.html`. The art lab displays both factions together without fog, AI, combat, or UI obstruction.

## Game modes and systems

- Campaign flow with briefings, battlefield operations, debriefs, progression, manual/autosave persistence, Continue, and deterministic mission restoration.
- Skirmish on three authored battlefields, with Ukraine or Russia playable and shared fair AI difficulty profiles.
- Two explicit factions with faction-specific names, equipment, markings, silhouettes, palettes, and battlefield roles.
- Workers, finite resource recovery, construction, production queues, upgrades, command capacity, fog of war, formation movement, attack-move, abilities, healing, objectives, and explicit victory/defeat reporting.
- Deterministic fixed-step simulation, seeded randomness, tactical AI, authored maps/mission scripts, replay/save contracts, and headless simulation tooling.
- Procedural/source-tracked visual and audio pipelines with release provenance validation.
- Persistent Audio & Accessibility settings, including scaling, color-vision assists, contrast, reduced motion/flash, cursor size, focus-loss pause, and configurable named actions.

See [`docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md`](docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md) for how these systems are used and extended. Focused contracts remain under `docs/` and are authoritative over this summary.

## Controls

Current defaults:

- Left click or drag: select
- Shift-click: additive selection
- Right click: move, attack, or cancel construction placement
- `Q`, then right click: attack-move
- `X`: stop selected units
- `T`: toggle auto-fire for selected combat units
- `Esc`: cancel construction placement
- WASD or arrows: camera
- Mouse wheel: zoom
- Minimap click: jump camera

Bindings are configurable. See [`docs/INPUT_BINDINGS.md`](docs/INPUT_BINDINGS.md) and [`docs/ACCESSIBILITY_SETTINGS.md`](docs/ACCESSIBILITY_SETTINGS.md).

## Architecture and contribution

Read these before changing behavior:

- [`AGENTS.md`](AGENTS.md) — scoped task/claim/evidence rules
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — dependency direction and authoritative owners
- [`docs/CHANGE_GUIDE.md`](docs/CHANGE_GUIDE.md) — change-routing workflows and completion checklist
- [`docs/CONTENT_SCHEMA.md`](docs/CONTENT_SCHEMA.md) — stable declarative content families and versioning
- [`docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md`](docs/PLAYER_AND_CONTRIBUTOR_GUIDE.md) — practical gameplay/content/scenario contribution paths

`src/main.js` is composition only. Gameplay authority belongs in the focused content/core/simulation/AI owners documented by the architecture contracts; input, UI, rendering, and audio consume public state/commands/events rather than owning gameplay rules. `legacy-source/` is parity/reference material, not a runtime dependency.

## Verification

```bash
bash verify.sh
```

That is the authoritative assembled gate. Focused deterministic tests are useful during implementation, while browser/visual/audio/performance evidence remains required where the affected acceptance criteria are player-facing. See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) and `AGENTS.md`.

## Credits, licenses, and provenance

Release source/licensing provenance is fail-closed and recorded in [`provenance/release-manifest.json`](provenance/release-manifest.json), with details in [`docs/RELEASE_PROVENANCE.md`](docs/RELEASE_PROVENANCE.md). Visual and audio families retain their own source/license ledgers; do not infer a blanket asset license from this README.

Named public figures are stylized historical-fiction characters, and their dialogue and game roles are fictionalized.

## Art workflow

The production art path, source requirements, readability checks, and atlas migration rules are documented in [`docs/ART_PIPELINE.md`](docs/ART_PIPELINE.md). Use `art-lab.html` for side-by-side roster inspection and validate player-visible candidates in representative missions before release.

## Design note

The target is the strong silhouette readability, compact information density, beveled interface framing, resource economy, and tactical pacing associated with polished mid-1990s RTS games. This is an original work rather than a Warcraft recreation.
