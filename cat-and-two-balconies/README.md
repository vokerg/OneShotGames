# Cat & Two Balconies

A self-contained canvas game about keeping an apartment cool without letting an unpredictable cat escape.

## Run

```bash
python3 run.py
```

The launcher uses only Python's standard library, starts a local web server, and opens the game in the default browser. Use `python3 run.py --no-browser` for headless or remote environments.

## Controls

- **WASD / Arrow keys** — move
- **E / Space** — operate a nearby balcony door, calm/intercept the cat, or rescue it from a balcony
- **P / Escape** — pause
- **R** — restart after winning or losing
- **M** — mute or unmute sound

## Rules

- Both doors closed: the apartment heats quickly.
- One door open: heat rises at roughly half speed.
- Both doors open: the apartment cools.
- Doors take a moment to latch. A committed cat can still slip through a door that has only just started closing.
- Random birds, knocks, traffic, and curtains pull the cat toward different balconies.
- The cat may stalk, sprint, feint, or abruptly double back to the other open door.
- Approach the cat and press **E** to calm it and interrupt a run. Calming has a short cooldown, so it cannot be spammed.
- If the cat reaches a balcony, rescue it before the countdown expires.
- Survive four stages in which distractions become more frequent, escape thresholds fall, direction changes become likelier, and rescue windows shrink.

## Design notes

The harder version remains fair by telegraphing distractions and escape intent in the HUD while preserving uncertainty about feints and double-backs. The player now has an active interception tool, but must choose between operating doors, managing temperature, and calming the cat.

The game has no external libraries, fonts, images, or network dependencies. The room, balconies, cat, effects, interface, and sound cues are generated in the browser with Canvas 2D, CSS, and the Web Audio API.
