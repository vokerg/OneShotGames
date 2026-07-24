# Cat & Two Balconies

A self-contained canvas game about keeping an apartment cool without letting the cat escape.

## Run

```bash
python3 run.py
```

The launcher uses only Python's standard library, starts a local web server, and opens the game in the default browser. Use `python3 run.py --no-browser` for headless or remote environments.

## Controls

- **WASD / Arrow keys** — move
- **E / Space** — open or close a nearby balcony door; pick up the cat on a balcony
- **P / Escape** — pause
- **R** — restart after winning or losing
- **M** — mute or unmute sound

## Rules

- Both doors closed: the apartment heats quickly.
- One door open: heat rises at roughly half speed.
- Both doors open: the apartment cools.
- An open door increases the cat's curiosity. If the cat reaches a balcony, rescue it before the countdown expires.
- Survive four increasingly difficult stages without overheating or losing the cat.

## Design notes

The game has no external libraries, fonts, images, or network dependencies. The room, balconies, cat, effects, interface, and sound cues are generated in the browser with Canvas 2D, CSS, and the Web Audio API.
