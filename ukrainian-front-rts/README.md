# Fields of Resolve

A modular, dependency-free retro RTS set in a stylized fictionalized version of the war in Ukraine. It uses original code and procedural graphics; no Warcraft assets, maps, dialogue, or source code are included.

## Run

```bash
./run.sh
```

Then open `http://127.0.0.1:8080`.

For focused unit-art review, open `http://127.0.0.1:8080/art-lab.html`. The art lab displays both factions together without fog, AI, combat, or UI obstruction. Use `1`, `2`, and `3` to check low, standard, and close zoom; `F` to reverse facing; and `Space` to pause movement animation.

## Current systems

- Three-mission campaign across the Donbas, Zaporizhzhia, and lower Dnipro operational sectors
- Two explicit factions: Ukraine and Russia
- Mirrored faction archetypes: engineer, infantry, drone, medic, IFV, tank, and self-propelled artillery
- Faction-specific names, equipment, markings, silhouettes, palettes, and battlefield roles
- Workers, resource recovery, three resource types, construction placement, production queues, and command capacity
- Warcraft-style command cards with attack-move, stop, and per-unit auto-fire enabled by default
- Headquarters, infantry-area, and workshop production roles with explicit queue progress and error feedback
- Ukrainian vehicle modernization tree with protection, optics, ammunition, command, and mobility upgrades
- Stylized command characters based on Volodymyr Zelenskyy, Valerii Zaluzhnyi, Vladimir Putin, and Yevgeny Prigozhin
- Active abilities, cooldowns, buffs, healing, fog of war, telegraphed enemy waves, minimap, formation movement, and attack-move
- Explicit victory and defeat reports, including total-force-elimination defeat handling
- Procedural pixel-art terrain, roads, shelterbelts, logistics sites, buildings, portraits, effects, and faction-specific sprites
- High-readability unit art pass with stronger silhouettes, three-value shading, outlines, class cues, faction accents, and lightweight animation
- Detailed static building and resource-site renders with construction scaffolding and placement previews
- Dedicated in-browser roster art lab for side-by-side visual validation
- Latin-script English interface throughout

## Producing units

1. Select a Ukrainian production facility.
2. The command card shows only the units that facility can produce.
3. Click a unit card to reserve resources and command capacity.
4. The selected facility reports the current item, remaining time, and complete queue.

Facility roles:

- **Brigade Command Post:** combat engineers and mission-specific command heroes
- **Infantry Assembly Area:** mechanized infantry and CASEVAC teams
- **Repair and Recovery Point:** FPV teams, IFVs, tanks, artillery, and vehicle modernization

A logistics depot increases command capacity but does not produce units.

## Constructing buildings

1. Select a Ukrainian Combat Engineer Section.
2. Choose Logistics Depot, Infantry Assembly Area, or Repair Workshop from the command card.
3. Move the placement preview to open ground.
4. Left-click a green site to begin construction. Right-click or press `Esc` to cancel.

The assigned engineer moves to the site and completes the structure. Production and command-capacity effects activate only when construction finishes.

## Architecture

- `src/main.js` — composition root only
- `src/app/runtime.js` — mission startup and animation-frame lifecycle
- `src/input/battlefield-input.js` — selection, orders, keyboard, zoom, construction placement, and minimap adapters
- `src/game.js` — authoritative game state, commands, update ordering, economy, and unit behavior
- `src/systems/` — focused objective, projectile, and enemy-wave policies
- `src/core/` — pure helpers with no browser or presentation dependencies
- `src/config.js` — factions, units, buildings, abilities, missions, upgrades, and balance data
- `src/render.js` — base terrain, unit, effect, fog, portrait, and minimap renderer
- `src/art-pass.js` — additive high-fidelity unit and portrait rendering layer
- `src/environment-art-pass.js` — additive building, resource-site, engineer, construction, and placement rendering layer
- `src/art-lab.js` — controlled full-roster comparison scene
- `src/ui.js` — campaign screen, command cards, production, research, objectives, and endgame presentation
- `docs/ARCHITECTURE.md` — dependency direction, module ownership, lifecycle, and extension patterns
- `docs/CHANGE_GUIDE.md` — targeted workflows for fixes, features, and visual work
- `docs/ART_PIPELINE.md` — art direction, production workflow, validation criteria, and sprite-atlas migration plan
- `docs/GAMEPLAY_POLISH_PASS.md` — command behavior, production flow, wave balance, endgame rules, and visual-pass rationale
- `AGENTS.md` — scoped implementation rules for contributors and coding agents

New units, heroes, abilities, upgrades, and missions should normally begin as data additions in `config.js`; only genuinely new mechanics need simulation or renderer changes. Unit visual experiments should begin in `art-pass.js` and be compared in `art-lab.html`. Environment experiments should begin in `environment-art-pass.js` and be validated in representative missions before moving to an atlas.

## Verification

```bash
bash verify.sh
```

The verifier checks all JavaScript modules with Node's syntax checker and enforces the main architecture boundaries without adding dependencies. Browser playtesting remains required for game feel, rendering, construction placement, production feedback, and interaction changes.

## Controls

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

## Art workflow

The game currently uses procedural renders because they are fast to iterate, deterministic, compact, and easy to integrate with faction colors. The intended production path is:

1. establish a readable procedural silhouette;
2. compare the entire roster in the art lab at low, standard, and close zoom;
3. validate the candidate in a real mission on representative terrain;
4. add minimal movement and attack feedback;
5. freeze the design once gameplay reads correctly;
6. convert stable units and structures into original hand-corrected sprite sheets and atlases.

A unit or structure should not graduate to sprite production until it remains identifiable by role and faction at low zoom, does not merge visually with adjacent entities, and remains legible over all three terrain palettes.

See `docs/ART_PIPELINE.md` for the full process and definition of done.

## Design note

The target is the strong silhouette readability, compact information density, beveled interface framing, resource economy, and tactical pacing associated with polished mid-1990s RTS games. This is an original work rather than a Warcraft recreation. Named public figures are stylized historical-fiction characters, and their dialogue and game roles are fictionalized.
