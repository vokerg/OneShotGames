# AGENTS.md — Ukrainian Front RTS

## Scope

These instructions apply only to `ukrainian-front-rts/`. Do not modify sibling games while working under this directory.

## Product intent

Fields of Resolve is a dependency-free browser RTS. Preserve fast startup, deterministic data-driven content, strong battlefield readability, and original art. Historical figures and events are stylized fiction; avoid claims of documentary accuracy and do not introduce copied commercial-game assets.

## Architectural rules

1. Keep `src/main.js` as composition only. It may construct objects and wire top-level UI controls, but gameplay rules and complex browser input do not belong there.
2. Keep simulation authoritative in `Game` and `src/systems/`. UI and rendering may read game state; they must invoke public game commands instead of directly implementing simulation rules.
3. Put pure, reusable helpers in `src/core/`. Core modules must not import browser, UI, renderer, or game modules.
4. Put isolated simulation policies in `src/systems/`. Systems receive the game state explicitly and must not import `Game`, `UI`, or `Renderer`.
5. Keep balance and content identifiers in `src/config.js`. Adding a mirrored unit, building, mission, ability, or upgrade should begin as a data change.
6. Keep visual-only changes in `src/render.js`, `src/art-pass.js`, or a new renderer module. Visual work must not change combat statistics or objective state.
7. Browser event registration belongs in `src/input/`; frame scheduling and lifecycle belong in `src/app/`.
8. Prefer small compatibility-preserving extractions over rewrites. Existing public methods such as `spawnWave`, `updateObjectives`, and `updateProjectiles` remain valid delegation points.

## Change routing

| Change | Start here | Usually avoid |
| --- | --- | --- |
| Balance, roster, mission data | `src/config.js` | `src/render.js` |
| Combat/economy rule | focused file in `src/systems/` plus a `Game` delegate | `src/ui.js` |
| Selection, keyboard, minimap input | `src/input/battlefield-input.js` | `src/main.js` |
| Main loop or lifecycle | `src/app/runtime.js` | `src/game.js` |
| Terrain/unit/portrait visuals | renderer or art module, then `art-lab.html` | simulation systems |
| HUD presentation | `src/ui.js` | config balance values |

## Definition of done

- Run `bash verify.sh`.
- Launch `./run.sh` and start every mission.
- Verify selection, right-click orders, attack-move, minimap navigation, mouse zoom, and all four WASD directions.
- For visual changes, compare normal missions and `art-lab.html` at all three zoom levels and in grayscale mode.
- Update `docs/ARCHITECTURE.md` when ownership or dependency direction changes.
- Keep commits limited to `ukrainian-front-rts/` unless the task explicitly requires repository-wide work.
