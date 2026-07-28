# Fields of Resolve art pipeline

## Quality target

The visual target is the readability and material richness of a polished mid-1990s RTS, not a copy of Warcraft II. The game must use original silhouettes, markings, palettes, portraits, terrain, and interface art.

At normal gameplay zoom, every unit should communicate four things in under a second:

1. faction;
2. unit class;
3. facing;
4. current state.

The renderer therefore prioritizes silhouette and value grouping over realism. Small battlefield units cannot carry photographic detail; they need exaggerated shapes, dark outlines, bright top planes, controlled faction accents, and stable shadows.

## Current implementation

`src/art-pass.js` is an additive procedural art layer. It overrides the renderer's unit and portrait drawing methods without changing simulation code or unit configuration.

The pass adds:

- stronger dark outer contours;
- distinct light, base, and shadow planes;
- broader vehicle silhouettes and readable track masses;
- faction-specific palettes and markings;
- equipment cues for medics, engineers, infantry, heroes, drones, IFVs, tanks, and artillery;
- subtle infantry bob and drone rotor pulse;
- larger, consistent unit portraits generated from the same rendering vocabulary.

This approach is appropriate for the current prototype because it keeps iteration fast and preserves the dependency-free runtime.

## Production workflow

### 1. Define the gameplay read

Before drawing, write one sentence describing the unit's battlefield read. Example: “Bradley: wide tracked hull, compact turret, blue identification panel, fast mechanized support.”

### 2. Block the silhouette

Work at the final intended screen footprint first. For this game, use roughly:

- infantry: 20–28 logical pixels tall;
- light vehicles: 34–42 logical pixels wide;
- tanks: 38–46 logical pixels wide;
- artillery: 40–54 logical pixels long;
- portraits: 64–96 source pixels before nearest-neighbor scaling.

Do not add detail until the black silhouette is identifiable beside other roster units.

### 3. Establish value groups

Use three primary values:

- dark contour and recesses;
- faction base color;
- light-facing surfaces.

Reserve the brightest value for faction marks, optics, medical signs, muzzle flashes, and selection feedback.

### 4. Add class cues

Class cues must remain visible at normal zoom:

- infantry: weapon axis and backpack or pouch mass;
- engineer: tool silhouette and warm utility belt;
- medic: large medical panel;
- drone: rotor or wing geometry;
- IFV: boxier troop-carrying hull;
- tank: dominant turret and long gun;
- artillery: elongated gun and rear fighting compartment;
- hero: stronger accent band and distinctive equipment.

### 5. Animate economically

Use two to four frames for small units. Prioritize movement readability rather than smoothness:

- idle: one base frame plus occasional accent motion;
- move: alternating body bob or track phase;
- attack: recoil, flash, or launch frame;
- damaged: smoke, sparks, or palette shift;
- death: short collapse or wreck transition.

### 6. Validate in context

Review units on actual terrain with fog, effects, buildings, selection rings, and UI present. A sprite that looks attractive on a transparent sheet can fail when placed on green-brown terrain.

Recommended checks:

- recognize every class at 100% zoom;
- distinguish factions without relying only on tiny insignia;
- identify facing during movement;
- preserve health bars and selection rings;
- avoid bright noise competing with projectiles and ability effects.

## Moving from procedural renders to sprite sheets

Procedural art is the first production stage, not necessarily the final one. When a unit design stabilizes:

1. capture the procedural design as a reference;
2. redraw or render an original high-resolution source asset;
3. reduce it to the target pixel footprint;
4. hand-correct silhouette, clusters, and contrast;
5. create directional and action frames;
6. pack the frames into a sprite atlas;
7. replace that unit's procedural method with an atlas-backed renderer;
8. retain the procedural renderer as a fallback and rapid-prototyping tool.

A future atlas schema should contain unit ID, frame dimensions, direction count, animation ranges, frame timing, anchor point, shadow anchor, selection radius, and optional faction-color masks.

## Definition of done for a unit

A unit art task is complete when:

- its silhouette is unique within its faction roster;
- faction and class are readable at normal zoom;
- movement and attack states have visible feedback;
- portrait and battlefield representation agree;
- no copyrighted game assets or traced sprites are used;
- the unit has been reviewed on all three campaign terrain palettes.
