# Fields of Resolve

A modular, dependency-free retro RTS set in a stylized fictionalized version of the war in Ukraine. It uses original code and procedural graphics; no Warcraft assets, maps, dialogue, or code are included.

## Run

```bash
./run.sh
```

Then open `http://127.0.0.1:8080`.

## Current systems

- Three-mission campaign with story briefs and objective tracking
- Asymmetric Ukrainian and Russian rosters
- Workers, automatic resource harvesting, three resource types, drop-off, construction, production queues, and command capacity
- Infantry, medics, drones, IFVs, artillery, armor, and hero characters
- Stylized hero characters based on Volodymyr Zelensky, Valerii Zaluzhnyi, Vladimir Putin, and Yevgeny Prigozhin
- Active abilities, cooldowns, buffs, healing, fog of war, enemy waves, minimap, formation movement, and attack-move
- Procedural pixel-art renderer and period-inspired beveled dashboard

## Architecture

- `src/config.js` — declarative units, buildings, abilities, missions, and balance data
- `src/game.js` — simulation, economy, production, combat, AI, and objectives
- `src/render.js` — terrain, sprites, effects, fog, portrait, and minimap rendering
- `src/ui.js` — campaign screen, dashboard, command buttons, and objective presentation
- `src/main.js` — input wiring and main loop

New units, heroes, abilities, and missions should normally begin as data additions in `config.js`; only genuinely new mechanics need simulation or renderer changes.

## Controls

- Left click or drag: select
- Shift-click: additive selection
- Right click: move or attack
- `Q`, then right click: attack-move
- WASD or arrows: camera
- Mouse wheel: zoom
- Minimap click: jump camera

## Verification

The JavaScript modules pass `node --check`. A headless Chromium run was executed against an inline test bundle, including mission selection and gameplay rendering, with no page errors. The test caught and led to a fix for an incorrect fog compositing implementation.

## Design note

The target is the strong silhouette readability, compact information density, beveled interface framing, resource economy, and tactical pacing associated with mid-1990s RTS games. This is an original work rather than a Warcraft recreation. The named public figures are stylized historical-fiction characters, and their dialogue and game roles are fictionalized.