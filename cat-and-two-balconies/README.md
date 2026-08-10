# Cat & Two Balconies

A self-contained canvas game about keeping an apartment cool without letting an unpredictable cat escape — or destroy the furniture.

## Run

```bash
python3 run.py
```

The launcher uses only Python's standard library, starts a local web server, and opens the game in the default browser. Use `python3 run.py --no-browser` for headless or remote environments.

## Controls

- **WASD / Arrow keys** — move
- **E / Space** — operate a nearby balcony door, calm/intercept the cat, rescue it from a balcony, shoo it away from the sofa, take a shrimp from the fridge, or feed a carried shrimp
- **P / Escape** — pause
- **R** — restart after winning or losing
- **M** — mute or unmute sound

## Rules

- Both doors closed: the apartment heats quickly.
- One door open: heat rises at roughly half speed.
- Both doors open: the apartment cools.
- Doors take a moment to latch. A committed cat can still slip through a door that has only just started closing.
- Random birds, knocks, traffic, and curtains pull the cat toward different balconies.
- The cat now builds escape pressure faster around an open door, prefers the less-defended exit, and jukes around the player while preserving forward progress toward a balcony.
- The cat may stalk, sprint, feint, abruptly double back, or abandon another plan when an open balcony becomes too tempting.
- Approach the cat and press **E** to calm it and interrupt a run. Calming has a short cooldown, so it cannot be spammed.
- The cat periodically targets the sofa. Its approach is telegraphed; get close and press **E** to shoo it away before scratching starts.
- Sofa damage is persistent for the whole run. Scratching drains score and composure, and reaching **0% sofa integrity** is a game over.
- The small fridge periodically supplies one shrimp. Pick it up, then approach the cat and press **E** to feed it.
- A shrimp sharply reduces curiosity, restores composure, cancels the current aggressive behavior, postpones the next sofa attack, and creates a short truce during which escape pressure grows more slowly and sofa attacks are suppressed.
- Shrimp restocks only after the carried shrimp has been fed, so it cannot be stockpiled.
- If the cat reaches a balcony, rescue it before the countdown expires.
- Survive four stages in which distractions become more frequent, escape thresholds fall, sofa attacks accelerate, scratch damage rises, direction changes become likelier, and rescue windows shrink.

## Design notes

The harder version adds a three-way resource problem rather than only speeding up the cat. Cooling requires opening doors, open doors create stronger escape pressure, closed-door downtime gives the cat opportunities to target the sofa, and shrimp provides a limited strategic reset that requires a trip to the fridge and then back to the cat.

Escape AI is intentionally player-aware: with both balconies available, the cat usually favors the exit the human is worse positioned to defend. When intercepted during a committed run, it blends doorward movement with a lateral dodge instead of simply fleeing away from the player, which keeps the cat dangerous without making its movement feel arbitrary.

Sofa attacks remain fair because they have an approach phase, a visible damage state, a contextual interaction prompt, and persistent claw marks in the room. The HUD exposes sofa integrity and shrimp availability so failure states are readable before they become irreversible.

The game has no external libraries, fonts, images, or network dependencies. The room, balconies, cat, effects, interface, furniture damage, shrimp iconography, and sound cues are generated in the browser with Canvas 2D, CSS, and the Web Audio API.
