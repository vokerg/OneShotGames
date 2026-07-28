# Red Fortress

A dependency-free, original retro raycasting FPS inspired by the speed and atmosphere of early-1990s shooters. It does **not** use Quake code, maps, textures, sounds, or other proprietary assets.

## Run

From the repository root:

```bash
python3 red-fortress/run.py
```

The launcher starts a local web server on an available port and opens the game in the default browser. Python 3 is the only requirement.

## Controls

- `WASD` — move and strafe
- Mouse — aim
- Left click — fire
- `1`, `2`, `3` — Tokarev, trench gun, PPSh-41
- `Shift` — sprint
- `Esc` — release mouse capture

## Included systems

- Three complete sectors with distinct layouts
- Clearance-validated enemy placement that relocates invalid wall spawns while preserving encounter areas
- Higher-resolution textured raycasting with perspective-mapped floors and ceilings
- Procedural concrete, painted steel, bunker, floor, and extraction-gate materials
- Soviet propaganda posters, red-star stencils, brass Lenin reliefs, Cyrillic wall markings, and industrial warning panels
- Distance fog, directional shading, red practical-light glow, final-frame color grading, screen grain, and vignette effects
- Detailed generated enemy, corpse, pickup, gate, and first-person weapon sprites
- Additional uniform insignia, weapon highlights, surface wear, pickup glow, and environmental material detail
- Three weapons with separate fire rates, spread, damage, recoil, muzzle effects, and ammunition pools
- Four enemy classes, pursuit, line-of-sight attacks, collision, and visible enemy muzzle flashes
- Health and ammunition pickups
- Score awards, sector-clear bonuses, victory and defeat screens
- Procedural sound effects through Web Audio
- Rebuilt minimap, objective display, HUD, pointer-lock mouse aiming, sprinting, hit markers, particles, recoil, and damage feedback

The game remains fully local and dependency-free. `index.html` loads the local renderer, spawn validation, art-pass, and gameplay scripts; `run.py` remains the one-command launcher.
