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
- Workers, resource recovery, three resource types, construction, production queues, and command capacity
- Ukrainian vehicle modernization tree with protection, optics, ammunition, command, and mobility upgrades
- Stylized command characters based on Volodymyr Zelenskyy, Valerii Zaluzhnyi, Vladimir Putin, and Yevgeny Prigozhin
- Active abilities, cooldowns, buffs, healing, fog of war, enemy waves, minimap, formation movement, and attack-move
- Procedural pixel-art terrain, roads, shelterbelts, logistics sites, buildings, portraits, effects, and faction-specific sprites
- High-readability unit art pass with stronger silhouettes, three-value shading, outlines, class cues, faction accents, and lightweight animation
- Dedicated in-browser roster art lab for side-by-side visual validation
- Latin-script English interface throughout

## Faction rosters

Ukraine fields Ukrainian Combat Engineers, Mechanized Infantry, FPV Strike Teams, CASEVAC Teams, M2A2 Bradley IFVs, T-64BV tanks, and 2S22 Bohdana artillery.

Russia fields Engineer-Sappers, Motor Rifle Squads, Lancet UAV Teams, Combat Medical Teams, BMP-3 IFVs, T-72B3M tanks, and 2S19 Msta-S artillery.

The rosters share gameplay archetypes for clarity and balance, but use different statistics and visual construction rather than simple renaming or palette swaps.

## Architecture

- `src/config.js` — factions, units, buildings, abilities, missions, upgrades, and balance data
- `src/game.js` — simulation, economy, production, research, combat, AI, and objectives
- `src/render.js` — base terrain, unit, effect, fog, portrait, and minimap renderer
- `src/art-pass.js` — additive high-fidelity procedural unit and portrait rendering layer
- `src/art-lab.js` — controlled full-roster comparison scene
- `src/ui.js` — campaign screen, dashboard, production, research, and objective presentation
- `src/main.js` — input wiring and main loop
- `docs/ART_PIPELINE.md` — art direction, production workflow, validation criteria, and sprite-atlas migration plan

New units, heroes, abilities, upgrades, and missions should normally begin as data additions in `config.js`; only genuinely new mechanics need simulation or renderer changes. Unit visual experiments should begin in `art-pass.js`, be compared in `art-lab.html`, and move to an atlas only after their silhouettes and animation language are stable.

## Controls

- Left click or drag: select
- Shift-click: additive selection
- Right click: move or attack
- `Q`, then right click: attack-move
- WASD or arrows: camera
- Mouse wheel: zoom
- Minimap click: jump camera

## Art workflow

The game currently uses procedural unit renders because they are fast to iterate, deterministic, compact, and easy to integrate with faction colors. The intended production path is:

1. establish a readable procedural silhouette;
2. compare the entire roster in the art lab at low, standard, and close zoom;
3. validate the candidate in a real mission on representative terrain;
4. add minimal movement and attack feedback;
5. freeze the design once gameplay reads correctly;
6. convert stable units into original hand-corrected sprite sheets and atlases.

A unit should not graduate to sprite production until it remains identifiable by class and faction at the art lab's low zoom, does not merge visually with adjacent roster units, and remains legible over all three terrain palettes.

See `docs/ART_PIPELINE.md` for the full process and definition of done.

## Verification history

The earlier headless-browser pass caught and fixed incorrect fog compositing. The latest renderer pass also corrected building visibility calculations inside fog-of-war. Repository searches were run after the faction refactor for obsolete unit identifiers and known Cyrillic UI terminology; no matches remained.

## Design note

The target is the strong silhouette readability, compact information density, beveled interface framing, resource economy, and tactical pacing associated with polished mid-1990s RTS games. This is an original work rather than a Warcraft recreation. Named public figures are stylized historical-fiction characters, and their dialogue and game roles are fictionalized.
