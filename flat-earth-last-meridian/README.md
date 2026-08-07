# Flat Earth: Last Meridian

A short top-down expedition game set in an alternate world where flat-Earth cosmology is literally true. The player crosses a circular Disc to restore three meridian stations while a nearby Sun circles overhead, carrying a local patch of daylight and warmth across the surface.

The cosmology is not just visual flavor: it is the game's route-planning system.

> This is fictional alternate-world physics, not a scientific model of the real Earth.

## Run

Requires Python 3.8 or newer. No packages, build tools, external assets, or network connection are required.

```bash
cd flat-earth-last-meridian
python3 run.py
```

The launcher starts a local server on an available port and opens the game in the default browser.

## Controls

- `WASD` or arrow keys — travel across the Disc.
- `Shift` — overdrive; faster, but drains more battery.
- Hold `E` — service a nearby meridian station or enter the Rim Observatory.
- `Space` — take a firmament star fix while in local night. For 10 seconds, the fix reveals true bearings and strongly reduces rim-wind drift.
- `R` — restart the expedition.

## Flat-world mechanics

### Low circling Sun

The Sun's ground projection follows a circular track around the central pole. Daylight is a moving radial footprint rather than a global day/night switch. The sledge's solar panel charges only inside that footprint, and the Solar Ephemeris station can only be serviced while the local Sun is present.

### Moving day and night

Ambient temperature is calculated from local daylight and distance from the rim. Darkness therefore moves physically across the Disc. The player can chase the Sun for warmth and energy or deliberately travel in darkness for other advantages.

### Freeze/thaw routes

Survey lanes crossing the Disc become hard, fast ice in darkness. Under strong local daylight they turn to slush and slow the sledge. This makes the same route change value as the Sun moves.

### Rotating firmament

Stars rotate around the central pole as a coherent firmament. In darkness, the player can use them for a temporary navigation fix. Mechanically, that fix reveals direct bearings to unfinished objectives and cuts wind drift to roughly one third.

### Ice Wall and rim wind

The outer edge is a physical encircling Ice Wall. A cold outward/tangential wind rises sharply in the rim belt, pushing the light survey sledge toward the boundary. The edge also imposes an additional temperature penalty, so the final stations are materially more dangerous than inner travel.

### Gnomon shadows

The player's sledge draws a local shadow away from the moving Sun projection, providing a diegetic directional cue even without reading the HUD.

## One-shot structure

The expedition is designed around a single compact run:

1. Restore the **Solar Ephemeris**, which requires local daylight.
2. Restore the **Firmament Sextant**, which requires local darkness.
3. Restore the **Wall Anemometer**, which sits in the dangerous rim belt and requires battery reserve.
4. Reach the **Rim Observatory**.
5. Choose whether to stabilize the approved inward-looking Sun Track or turn the final instrument outward beyond the Ice Wall.

The station order is not forced, so the moving illumination, available battery, freeze state, and current wind can change the optimal route.

## Implementation

- `index.html` — HUD, briefing, field log, and ending UI.
- `styles.css` — responsive expedition-terminal presentation.
- `physics.mjs` — pure world/cosmology functions: solar track, local illumination, temperature, firmament rotation, freeze/thaw lanes, gnomon direction, and rim wind.
- `game.mjs` — input, resource simulation, objectives, rendering, narrative state, and endings.
- `run.py` — dependency-free Python standard-library launcher.
- `tests/physics.test.mjs` — deterministic tests for the core cosmology mechanics.

All map geometry, land silhouettes, stars, effects, and UI graphics are generated in code. No third-party art is bundled.

## Verification

From the repository root:

```bash
node --check flat-earth-last-meridian/physics.mjs
node --check flat-earth-last-meridian/game.mjs
node --test flat-earth-last-meridian/tests/physics.test.mjs
python3 -m py_compile flat-earth-last-meridian/run.py
```
