# Ukrainian Front RTS

A self-contained browser RTS prototype set in a fictionalized Ukrainian defensive campaign. It uses original code, procedural pixel-art graphics, fictional units and commanders, and genre-standard RTS mechanics rather than Warcraft assets, story, names, maps, or source code.

## Run

```bash
chmod +x run.sh
./run.sh
```

The launcher starts a local server at `http://127.0.0.1:8080` and opens the game when the operating system supports it. Override the port with `PORT=9000 ./run.sh`.

## Controls

- Left click: select one unit or base.
- Drag left mouse: box-select units.
- Shift + left click: add or remove a unit from the selection.
- Right click: move, attack an enemy, or capture a supply point.
- `A`: attack-move selected units.
- `S`: stop selected units.
- `1`-`4`: recruit infantry, drone, medic, or commander when the base is selected.
- Arrow keys / WASD: move camera.
- Mouse wheel: zoom.

## Prototype scope

- Squad selection, formation movement, collision avoidance, attack-move and target acquisition.
- Infantry, reconnaissance/strike drones, medics, commanders and headquarters.
- Command aura, healing, ranged combat, projectile effects and veterancy.
- Supply-point capture, requisition income, unit production and population cap.
- Fog-of-war, minimap, camera controls, objective messaging and lightweight enemy AI.
- Procedural terrain and sprites rendered entirely with Canvas 2D; no external assets or dependencies.

## Design note

The balance targets readable, deliberate 1990s RTS pacing while remaining an original work. Historical conflict is treated as a fictionalized defensive scenario: there are no real political leaders, military insignia, casualty statistics, or recreations of specific battles.
