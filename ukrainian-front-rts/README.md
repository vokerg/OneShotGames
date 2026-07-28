# Fields of Resolve

A modular, dependency-free retro RTS set in a stylized fictionalized version of the war in Ukraine. It uses original code and procedural graphics; no Warcraft assets, maps, dialogue, or code are included.

## Run

```bash
./run.sh
```

Then open `http://127.0.0.1:8080`.

## Current systems

- Three operational sectors: the Siverskyi Donets line in Donbas, the Orikhiv–Tokmak axis in Zaporizhzhia, and a lower-Dnipro bridgehead in Kherson
- Ukrainian-language objectives, facility names, battlefield labels, abilities, logistics terminology, and command-panel text
- War-specific force terminology including mechanized squads, engineer-sapper sections, FPV strike teams, CASEVAC groups, Storm-Z detachments, motor-rifle squads, and brigade command posts
- Named vehicle roster: M2A2 Bradley ODS-SA, T-64BV model 2017, 2S22 Bohdana, and T-72B3M
- Workers, automatic resource harvesting, three resource types, logistics drop-off, construction, production queues, and command capacity
- Six vehicle modernization projects: anti-drone protection, thermal sights, NATO 155 mm ammunition, active protection, digital command-and-control, and mine rollers
- Research prerequisites and live stat modification for durability, sight, range, damage, reload time, and mobility
- Infantry, medics, drones, IFVs, tanks, artillery, and stylized hero characters
- Active abilities, cooldowns, smoke screening, buffs, healing, fog of war, enemy waves, minimap, formation movement, and attack-move
- Upgraded procedural pixel-art renderer with vehicle-specific silhouettes, tracks, turrets, barrels, markings, denser terrain, battlefield labels, improved resource sites, smoke, and richer buildings

## Architecture

- `src/config.js` — declarative units, buildings, upgrades, abilities, geography, missions, and balance data
- `src/game.js` — simulation, economy, research, production, combat, AI, and objectives
- `src/render.js` — terrain, sprites, vehicles, effects, fog, portrait, and minimap rendering
- `src/ui.js` — campaign screen, Ukrainian dashboard terminology, research controls, command buttons, and objective presentation
- `src/main.js` — input wiring and main loop

New units, regions, upgrades, heroes, abilities, and missions should normally begin as data additions in `config.js`; only genuinely new mechanics need simulation or renderer changes.

## Controls

- Left click or drag: select
- Shift-click: additive selection
- Right click: move or attack
- `Q`, then right click: attack-move
- WASD or arrows: camera
- Mouse wheel: zoom
- Minimap click: jump camera

## Design note

The target is strong silhouette readability, compact information density, beveled interface framing, resource economy, and tactical pacing associated with mid-1990s RTS games. This is an original work rather than a Warcraft recreation. Named public figures are stylized historical-fiction characters, and their dialogue and game roles are fictionalized.