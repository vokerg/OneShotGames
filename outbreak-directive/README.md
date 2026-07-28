# Outbreak Directive

A self-contained outbreak-management strategy game. You are the director of an under-resourced international response network facing a newly detected pathogen. Contain transmission, protect hospitals, preserve public trust, fund vaccine research, and decide which regions must wait.

## Run

Requires Python 3.8 or newer. No packages, build tools, or internet connection are required.

```bash
python run.py
```

The launcher starts a local web server on an available port and opens the game in your default browser. Press `Ctrl+C` in the terminal to stop it.

## How to play

- Select a region on the map.
- Spend the day's limited Operations Capacity on surveillance, isolation, treatment, travel controls, research, and eventually vaccination.
- End the day to advance the simulation.
- Keep deaths and public trust within the mission limits, and drive active cases to zero.

Every intervention has a tradeoff. Isolation and cordons suppress transmission but damage trust. Treatment saves lives but does not stop spread. Research consumes capacity that could be used on immediate emergencies. Vaccine deployment becomes decisive only after research is complete and production ramps up.

## Implementation

- `run.py` — one-command Python standard-library launcher.
- `index.html` — game interface and generated SVG map.
- `style.css` — responsive command-center visual design.
- `game.js` — simulation, balancing, interaction, audio, and scenario generation.
- No external assets or network calls.
