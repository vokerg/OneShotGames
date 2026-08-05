# Gold-standard directional unit template

## Scope

UFR-109 defines the first production-grade source-to-runtime unit template for Fields of Resolve. The fictional `template.pathfinder-car` is a shared training/reference vehicle, not a roster entry and not a faction production family. UFR-110 through UFR-114 may copy its contracts and timing conventions but must author their own silhouettes and source art.

The template is integrated into `art-lab.html` through the UFR-107 sprite-atlas runtime. It does not change simulation balance, unit identifiers, targeting, collision, or active mission rendering.

## Direction and canvas contract

- Canvas: **48 × 48 logical pixels**.
- Gameplay anchor: **(24, 44)**, the ground-contact center.
- Direction order: `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`.
- Direction zero: north; positive indices proceed clockwise.
- Required transparent source padding: **4 px**.
- Selection attachment: `(24, 40)`.
- Shadow attachment: `(24, 39)`.
- Center/effect attachments: `(24, 24)` and `(24, 18)`.
- Muzzle attachment: authored per direction and rotated with the weapon axis.
- Selection and hit masks remain stable across every state.

The runtime helper `templateUnitDirectionFromAngle()` maps the current world-facing convention (`-π/2` north, `0` east) into the atlas direction order.

## State and timing matrix

| State | Coverage | Frames | Timing | Loop |
| --- | --- | ---: | --- | --- |
| Idle | shared | 2 | 240 ms each | loop |
| Move | 8 directions | 4 per direction | 90 ms each | loop |
| Attack | 8 directions | 3 per direction | 80 / 60 / 120 ms | once |
| Hit | shared | 1 | 100 ms | once |
| Damaged | shared | 2 | 220 ms each | loop |
| Death | shared | 6 | 90 / 90 / 100 / 110 / 120 / 140 ms | once |
| Wreck | shared | 1 | 1000 ms stable hold | hold |

Shared states intentionally preserve one stable silhouette while movement and weapon-axis states carry complete authored facing coverage. The atlas contains 68 template frames plus the conspicuous UFR-107 diagnostic fallback frame.

Presentation timing does not trigger attacks, damage, destruction, or obstruction changes. Simulation systems remain authoritative.

## Palette and value hierarchy

The frame family uses the art-bible value order:

1. `ink` / `template-deep`;
2. `template-shadow`;
3. `template-base`;
4. `template-light` / `neutral-metal`;
5. `template-accent` / `template-optic`;
6. `damage` only for hit, damaged, and destruction cues.

Faction identity is deliberately absent. The compact tracked silhouette, central sensor block, weapon axis, and recognition panels are teaching cues for downstream family authors.

## Runtime integration and review

`src/render/template-unit-atlas.js` owns the atlas URL, state/direction IDs, facing conversion, and loader. `src/art-lab.js` loads the diagnostic fallback first, then the template atlas with explicit degraded behavior.

In `art-lab.html`:

- `T` cycles the seven template states;
- `1`, `2`, and `3` exercise strategic, command, and inspection zoom;
- `V` toggles grayscale value review;
- `Space` freezes timing;
- `S` captures a state-labelled review image.

The generated source contact sheet and export manifest remain the deterministic review authority. The source provenance record discloses OpenAI-assisted vector generation and stays `pending` until a maintainer records human visual approval.

## Evidence limits

Automated verification proves source naming, palette declarations, padding metadata, provenance fields, frame counts, timing, direction order, anchors, attachments, atlas packing, runtime lookup, art-lab composition, and explicit fallback behavior.

It does not claim final human art approval, production faction coverage, active mission renderer adoption, color-vision certification, or a release performance budget. Those remain downstream review and release-gate responsibilities.
