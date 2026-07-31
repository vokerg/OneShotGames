# Way of the Ninja: Momentum Trial

A self-contained browser platformer built around fast acceleration, inertia, wall slides, wall jumps, route planning, switches, exits, optional gold, and lethal compact arenas.

This is an original implementation inspired by the broad design language of minimalist momentum platformers. It does **not** copy code, level layouts, names of characters, music, or visual assets from *N* or any other commercial game. All levels and Canvas graphics in this folder were created for this repository.

## Run

From this folder:

```bash
python3 run.py
```

The runner opens `http://127.0.0.1:8087`. To serve without opening a browser:

```bash
python3 run.py --no-browser
```

No install or build step is required.

## Controls

- `A` / `D` or left / right arrows: move
- `Space`, `Z`, `W`, or up arrow: jump
- Hold toward a wall while falling: wall slide
- Jump while touching a wall: wall jump
- `R`: restart the current sector
- `P` or `Escape`: pause
- `M`: toggle generated sound
- Touch controls appear automatically on coarse-pointer/mobile devices

## Objective

Touch the blue switch to unlock the exit, then reach the green doorway before time expires. Gold is optional and increases score; each piece also adds a small amount of time. Death resets the current sector and rolls score and gold back to the sector checkpoint.

## Included systems

- fixed-timestep movement with acceleration, air control, coyote time, jump buffering, variable jump height, wall sliding, and wall jumping;
- five original sectors with escalating mines, spikes, tracking turrets, patrol drones, and alternate routes;
- switch/door objectives, optional gold, time bonuses, scoring, deaths, campaign completion, and local best-score persistence;
- responsive Canvas rendering, keyboard and touch controls, generated Web Audio cues, pause behavior, reduced-motion CSS support, and no external assets;
- dependency-free Python runner and Node-based level validation.

## Verification

```bash
npm test
python3 -m py_compile run.py
```

For a manual smoke test, start the runner, verify movement and wall jumps, activate a switch, enter an unlocked door, trigger each hazard type, restart with `R`, pause with `P`, and complete all five sectors.

## Structure

- `index.html` — application shell and accessible controls
- `styles.css` — responsive presentation and touch UI
- `src/game.js` — game loop, physics, entities, rendering, audio, and state
- `src/levels.js` — original campaign data
- `tests/levels.test.mjs` — structural level validation
- `run.py` — local static server
