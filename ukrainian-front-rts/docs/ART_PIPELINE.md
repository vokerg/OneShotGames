# Fields of Resolve production art bible

## Status and authority

This document is the normative visual-production contract for Fields of Resolve. UFR-106 freezes the standards consumed by UFR-107 through UFR-123: atlas schema and loading, source exports, unit/building/terrain/effect families, UI assets, campaign art, visual regression, and renderer performance.

The target is the control clarity, information density, material richness, and confident silhouettes of a polished mid-1990s RTS. It is **not** permission to copy Warcraft II or any other commercial game's sprites, palettes, maps, portraits, interface layout, animation, text, or source material. All shipped work must be original or properly licensed and traceable.

When a later asset conflicts with this bible, change the asset unless a dedicated art-direction PR deliberately updates this document and records downstream compatibility implications.

## Product read

At normal gameplay zoom, a player must identify these properties in under one second:

1. faction or neutral ownership;
2. battlefield class and broad counter role;
3. facing and movement intent;
4. selected, damaged, disabled, firing, constructing, capturing, or destroyed state;
5. whether an effect is dangerous, beneficial, informational, or decorative.

Readability outranks realism, particle density, fine texture, and historical micro-detail. A sprite that is attractive on a contact sheet but ambiguous under fog, movement, effects, or grayscale is not production-ready.

## Technical coordinate system

### World and tile basis

- Authoritative world tiles are **32 × 32 logical pixels**.
- Terrain, footprints, anchors, selection geometry, and effect placement use logical world coordinates; source-pixel resolution may be higher but exports must resolve to this grid.
- The battlefield camera is orthographic/top-down with a slight illustrative bias toward visible top planes. Do not introduce perspective convergence that changes footprint readability or selection accuracy.
- Pixel art is rendered with nearest-neighbor sampling. Runtime smoothing must remain disabled.

### Viewport and device pixels

- Required desktop viewports begin at **1280 × 720 CSS pixels**.
- The current renderer supports device-pixel ratios up to 2. Atlas assets must remain crisp at 1× and 2× backing resolution without assuming that CSS pixels equal source pixels.
- UI and battlefield art must survive browser resizing and high-DPI scaling without fractional seams, blurred one-pixel lines, or shifted anchors.

### Camera zoom bands

The supported battlefield zoom range is **0.55–1.45**. Review assets at all three production bands:

| Band | Zoom | Required read |
| --- | ---: | --- |
| Strategic | 0.55–0.71 | faction, class silhouette, selection, health, major threats |
| Command | 0.72–1.10 | standard play read and complete primary detail |
| Inspection | 1.11–1.45 | material detail without exposed padding, seams, or unstable clusters |

Detail that appears only above 0.72 is secondary. No required class, faction, facing, or damage cue may depend on it.

## Silhouette and footprint standards

Design the black silhouette first at final logical size. Adjacent roster entries must not share the same outer mass with only a weapon or color swap.

| Family | Typical logical footprint | Mandatory silhouette cue |
| --- | --- | --- |
| Infantry section | 20–28 px tall, 16–24 px wide | weapon axis plus role equipment mass |
| Light transport / support vehicle | 34–42 px wide | cabin, cargo, bridge, recovery, or transport volume |
| IFV / APC | 36–44 px wide | troop-carrying hull distinct from tank turret mass |
| Tank | 38–46 px wide | dominant turret and readable gun axis |
| Artillery / rocket system | 40–56 px long | elongated weapon or launcher and deployment mass |
| Drone / UAS | 24–42 px span | rotor, fixed-wing, relay, or payload geometry |
| Small building | 2–3 tiles | entrance and function silhouette |
| Major production building | 3–5 tiles | production function, roof mass, and readable entrance |

Source canvases may exceed these dimensions for recoil, smoke, or collapse, but the gameplay footprint and anchor do not change between animation states.

### Clear zones

Every frame must reserve visual clearance for:

- selection ring or footprint outline;
- health/status bars above the sprite;
- target lines and range rings;
- embark/garrison/capture indicators;
- shadows below the unit;
- projectile origin and impact anchors.

Decorative antennas, dust, smoke, flags, or foliage must not obscure these cues.

## Anchors and orientation

- Units that can turn require **eight directions** ordered consistently clockwise from north.
- Direction zero, atlas ordering, and rotation conventions must be declared in the atlas manifest; individual families may not invent their own order.
- The gameplay anchor is the unit's ground contact center, not the transparent canvas center.
- Shadow, weapon muzzle, projectile origin, selection, portrait crop, and effect attachment anchors are explicit data.
- Mirroring is allowed only when faction markings, handed equipment, text, asymmetrical turrets, shadows, and muzzle anchors remain correct. Prefer authored eight-direction coverage for final battlefield units.
- Buildings use a stable footprint-origin anchor and declared entrances/exits. Construction, active, damaged, destroyed, and rubble frames must align exactly.

## Value hierarchy

Use a controlled five-step hierarchy:

1. **Ink/deep recess** — outer contour, track gaps, wheel wells, deep windows;
2. **Shadow plane** — undersides, rear planes, cavities;
3. **Base plane** — dominant faction/material mass;
4. **Light plane** — upward-facing surfaces and role-defining edges;
5. **Reserved highlight** — optics, medical marks, faction accents, UI focus, muzzle flashes, and critical effects.

The current procedural ink reference is `#111512`. Production sprites may adjust local hues, but the darkest contour must remain separable from terrain at strategic zoom. Avoid pure black interior carpets and pure white surface noise.

### Contrast budget

- The largest value contrast belongs to silhouette boundaries and gameplay-critical state.
- Fine texture stays within one neighboring value step.
- Selection, targeting, objectives, projectiles, and dangerous effects must remain brighter or more chromatically distinct than ordinary surface detail.
- Damage states may darken, desaturate, expose under-material, or add smoke; they may not erase faction/class recognition.
- All required reads must survive grayscale. Color is reinforcement, not the only carrier.

## Palette families

These tokens freeze the starting production families. UFR-107 manifests should name semantic tokens rather than scatter raw colors across assets.

### Shared semantic tokens

| Token | Reference | Use |
| --- | --- | --- |
| `ink` | `#111512` | outer contour and deepest separation |
| `neutral-metal` | `#9aa291` | exposed metal, highlights, mechanisms |
| `selection` | `#ffe47b` | selected state only |
| `danger` | warm red/orange family | hostile warning, fire, critical damage |
| `benefit` | cool cyan/green family | repair, heal, friendly support |
| `objective` | restrained gold family | mission and capture emphasis |

### Ukraine — Networked Maneuver

Reference battlefield family:

- deep `#18271f`
- shadow `#293c30`
- base `#50684c`
- light `#81956a`
- metal `#9aa291`
- accent `#e4ca54`
- optic/network `#4e8db2`
- UI primary `#3978ad`
- UI secondary `#e0c75b`

Visual identity emphasizes distributed systems, compact modular equipment, clear sensor/relay cues, mobile recovery, and responsive fires. Use blue/yellow accents sparingly on readable panels, optics, command links, or recognition marks. Do not make every surface blue or yellow.

### Russia — Echeloned Pressure

Reference battlefield family:

- deep `#2a211b`
- shadow `#41342a`
- base `#6c5947`
- light `#94775a`
- metal `#918d7d`
- accent `#cdbd9d`
- optic `#786957`
- UI primary `#7c5043`
- UI secondary `#c9b998`

Visual identity emphasizes larger prepared masses, supply depth, layered air defense, echelon control, and concentrated fires. Use warm earth and muted recognition marks; preserve distinct silhouettes rather than relying on brown color alone.

### Neutral and environment

Neutral civilian, industrial, and logistics sites use material-led palettes with restrained ownership overlays. Civilian abstraction must not use faction uniforms or combatant silhouettes. Capture ownership appears through flags, light panels, signage, or UI overlays that can switch without repainting the entire structure.

Terrain palettes must leave both faction families readable. Avoid terrain greens or browns that match the dominant unit base value without a separating contour or shadow.

## Faction and class cues

Faction must be recognizable through at least two channels:

- silhouette or equipment language;
- stable marking geometry;
- palette/accent family;
- support-effect or UI motif.

Class must remain visible at strategic zoom:

- engineer: tools, breaching/repair equipment, utility mass;
- medic: large medical panel and non-weapon emphasis;
- line infantry: primary weapon axis and squad kit;
- anti-armor: launcher/tube silhouette;
- reconnaissance: optics, mast, light kit, or sensor geometry;
- command: antenna/relay and stronger but restrained accent;
- transport: passenger/cargo volume and entry geometry;
- recovery: crane, winch, tow gear, or repair boom;
- bridging: folded span or deployment apparatus;
- artillery/rockets: weapon length, launcher bank, stabilizers, or setup state;
- air defense: radar/sensor and elevation/launcher geometry;
- logistics: cargo, tankage, pallets, or transfer equipment.

Do not encode class only through tiny icons painted on otherwise identical bodies.

## Animation coverage

Animation timing is simulation-independent presentation data. Gameplay hit timing and projectile creation remain authoritative in systems; atlas events may align visual frames to those events but never decide outcomes.

### Battlefield units

| State | Infantry | Vehicle | Drone / UAS |
| --- | ---: | ---: | ---: |
| Idle | 2–4 frames | 1–3 frames | 2–4 frames |
| Move | 6–8 frames × 8 dirs | 4–6 frames × 8 dirs | 4–6 frames × 8 dirs |
| Attack / launch | 3–6 frames × 8 dirs | 3–6 frames × 8 dirs | 3–6 frames × relevant dirs |
| Ability / deploy / channel | 3–8 frames | 3–8 frames | 3–8 frames |
| Hit reaction | 2–3 frames | 1–3 frames | 1–3 frames |
| Damaged loop | 2–4 frames or attachment | 2–4 frames or attachment | 2–4 frames or attachment |
| Death / destruction | 5–10 frames | 6–12 frames | 4–8 frames |
| Wreck / remains | 1 stable frame | 1–3 stable variants | 1 stable frame where applicable |

Frame counts are ranges, not a requirement to animate static mass unnecessarily. Use the minimum that clearly communicates state. No shipped unit may omit idle, move, attack/ability where applicable, damaged, death, and wreck/remains coverage.

### Timing ranges

- Idle ambient motion: 160–320 ms per frame, with long deterministic holds permitted.
- Infantry movement: 80–130 ms per frame.
- Vehicle track/wheel phase: 70–120 ms per frame.
- Attack anticipation/recoil: 40–120 ms per frame around the authoritative fire event.
- Death/destruction: 60–140 ms per frame, then settle into a stable obstruction/read.
- UI hover/press transitions: 60–120 ms unless reduced-motion mode removes them.

Do not animate every pixel continuously. Stable frames improve recognition and reduce visual fatigue.

## Buildings and neutral sites

Every production building family must include:

1. footprint/placement preview;
2. foundation, frame, fit-out, and complete construction stages;
3. idle operational state;
4. active production/research/support state;
5. damaged state below the authoritative threshold;
6. critical/burning or disabled state where supported;
7. destruction transition;
8. rubble/wreck state aligned to obstruction;
9. readable entrance, production exit, rally origin, and capture/ownership overlay anchors.

Neutral civilian, industrial, and logistics sites additionally require uncontrolled, Ukrainian-controlled, Russian-controlled, contested, and disabled/destroyed presentation. Ownership overlays must not alter the footprint or imply that civilian sites are military targets.

## Terrain scale and autotiling

### Base grid

- One gameplay tile is 32 logical pixels.
- Authored terrain may use 32, 64, or 96 logical-pixel source motifs, but passability and elevation boundaries must align to the gameplay grid.
- Ground texture repetition should not become obvious within a 6 × 6 tile view at command zoom.

### Required terrain families

Ground, road, mud, rubble, shallow/deep water, banks, cliffs, bridges, settlement surfaces, industrial surfaces, fields, shelterbelts, and mission biome variants require explicit transition coverage.

Autotiles must declare:

- edge and corner masks;
- inner corners;
- T and cross junctions where applicable;
- elevation/cliff top and face;
- bridge approach, span, and exit;
- damaged/destroyed variants;
- passability and line-of-sight correspondence.

Art may decorate a tile but must not imply passability, cover, height, or water depth that differs from authoritative map data.

### Props and layering

Props use stable feet/obstruction anchors and one of these layers: ground decal, low prop, unit-height prop, tall occluder, canopy/roof fade, foreground effect. Tall props must preserve selection and visibility through fade, cutaway, or outline policy. Destructible variants retain the same obstruction semantics until the authoritative state changes.

## Effects hierarchy

Effects are grouped by gameplay function:

- **dangerous** — muzzle flash, tracer, shell, missile, explosion, fire, hostile area warning;
- **state-changing** — smoke, suppression, repair, healing, capture, build, disable;
- **informational** — selection, range, path, target, ping, objective, incoming alert;
- **ambient** — dust, wind, rain, distant fire, harmless debris.

Dangerous and state-changing effects receive the strongest timing and contrast. Ambient effects remain beneath target lines, health bars, objective markers, and cursor feedback. Smoke may obscure vision only when authoritative smoke state says it does; decorative smoke cannot create false cover.

Effect atlases declare origin, radius, blend mode, loop policy, maximum concurrent instances, reduced-motion alternative, and grayscale role. Flash coverage must respect screen-flash reduction.

## Portraits, icons, and cursors

### Portraits

- Standard portrait viewport: **144 × 112 logical pixels** in the current UI.
- Source portraits should be authored at 2× or 4×, then reduced and hand-corrected for nearest-neighbor display.
- Portrait and battlefield sprite must agree on silhouette, equipment, faction accent, and damage/role identity.
- Keep face/equipment inside a safe area with room for faction/role labels and status overlays.

### Icons

- Primary command/ability icon design grid: 32 × 32 logical pixels.
- High-DPI source: 64 × 64 or 128 × 128 with a deterministic downsample/export step.
- One dominant shape, one supporting cue, and no more than three major value masses at 32 px.
- Disabled, unavailable, active, cooldown, queued, researched, and selected states are UI treatments, not separate inconsistent illustrations.

### Cursors and pings

Cursors require 1×/2× coverage, hotspot coordinates, valid/invalid/targeting variants, and high-contrast outlines. Pings require faction/neutral/objective variants, a reduced-motion alternative, and a bounded animation duration.

## UI density and skin rules

The UI must preserve battlefield area and information hierarchy at 1280 × 720. Production frames use scalable nine-slice assets rather than stretching pixel corners.

- Base spacing unit: 4 logical pixels.
- Compact control height: 28–32 px.
- Primary control height: 36–40 px.
- Minimum keyboard/mouse target: 32 × 32 px; use 40 px where layout permits.
- Panel borders: 1–2 logical pixels at 1×, never blurred fractional lines.
- Text contrast must meet the later accessibility contract; do not bake essential text into raster panels.
- Resource, objective, selection, command-card, minimap, notification, modal, and screen-host regions remain visually distinct without ornamental frames consuming more space than content.
- Faction styling may accent panels but may not recolor semantic warning/success/disabled states into ambiguity.

The UI skin must support UI scale, text scale, color-vision presets, contrast mode, reduced motion, and localization expansion. Decorative labels belong in externalized text, not painted into reusable assets.

## Source-file rules

### Repository layout

UFR-108 should establish this source pattern:

```text
art-src/
  units/<faction>/<family>/<asset-id>/
  buildings/<faction>/<asset-id>/
  terrain/<biome>/<family>/
  effects/<family>/<asset-id>/
  ui/<family>/<asset-id>/
  campaign/<operation-or-screen>/
assets/
  atlases/
  manifests/
  contact-sheets/
```

Source files are not runtime files. Runtime exports and manifests are generated reproducibly.

### Naming

Use lowercase stable IDs matching content contracts where practical:

```text
<asset-id>__<animation>__d<direction>__f<frame>.<ext>
```

Examples:

```text
ua.line-infantry__move__d03__f05.png
ru.breakthrough-tank__attack__d06__f02.png
neutral.logistics-site__controlled-ua__d00__f00.png
```

Do not encode temporary artist initials, dates, or display names in runtime IDs.

### Source layers

Layered sources should separate, when applicable:

- silhouette/base mass;
- light/shadow planes;
- faction-color mask;
- markings/decals;
- weapon/equipment variants;
- damage overlays;
- shadow;
- effect attachments;
- guides/anchors excluded from export.

Keep editable vectors, pixel layers, or 3D sources as appropriate, but every output must pass the same pixel-footprint and provenance rules.

## Export and atlas handoff

Exports must be deterministic and fail on invalid input. UFR-107/UFR-108 tooling must validate:

- stable asset and animation IDs;
- declared frame dimensions and direction count;
- no accidental color-profile conversion;
- nearest-neighbor scaling only for pixel exports;
- transparent padding bounds and no clipped non-transparent pixels;
- identical anchors across compatible states;
- explicit duration for every frame;
- faction-color masks restricted to declared palette slots;
- source and license metadata;
- no duplicate runtime path or atlas key;
- contact-sheet generation for human review.

Each atlas entry must include at minimum:

```text
schemaVersion
assetId
family
frameSize
animations[]
  id
  directions
  frames[]
    rect
    durationMs
anchor
shadowAnchor
selectionRadius or footprint
attachments (muzzle, effect, entrance, exit, portrait crop)
factionMask (optional)
fallbackId
sourceManifestId
```

Atlas packing may trim transparent bounds only when the manifest preserves the logical frame box and all anchors. Runtime fallback is for development resilience, not permission to ship missing production states.

## Provenance and licensing

Every source input—including sketches, photographs, 3D models, textures, fonts, generated references, and external color/reference material—requires a manifest record with:

- stable source ID;
- creator and date;
- original repository path or external source reference;
- license/permission and redistribution status;
- transformations performed;
- related runtime assets;
- whether generative tools were used and the human-authored correction process;
- reviewer and approval state.

Do not trace, recolor, kitbash, or closely reproduce commercial game sprites. Reference boards may study broad shape language, material behavior, and historical equipment, but final clusters, proportions, animation, markings, and composition must be original.

No asset without complete provenance and a repeatable export path is release-ready.

## Review workflow

### Before production

1. Write a one-sentence gameplay read.
2. Identify content ID, family, footprint, anchors, and required states.
3. Produce black silhouettes at strategic zoom.
4. Compare against every same-faction and counter-role silhouette.
5. Confirm no copied composition or unlicensed source input.

### During production

1. Review strategic, command, and inspection zoom bands.
2. Review on every affected terrain palette under fog.
3. Pause on each frame to inspect anchor jitter and padding.
4. Review movement, attack, damage, death, and wreck transitions with health bars and selection.
5. Review grayscale, color-vision presets, high-contrast mode, and reduced motion.
6. Confirm UI/objective/projectile cues remain dominant.

### Final acceptance

A production asset family is complete only when:

- all required IDs and states exist;
- silhouettes are unique and readable at 0.55 zoom;
- faction and role are not encoded by color alone;
- anchors do not jitter between frames or directions;
- state timing aligns with authoritative events without deciding them;
- terrain/footprint art matches passability and obstruction data;
- portraits/icons agree with battlefield art;
- transparent padding, palette, manifest, and provenance checks pass;
- contact sheets and deterministic visual-regression scenes exist;
- normal, grayscale, color-vision, high-DPI, and reduced-motion reviews pass;
- no copied or unlicensed material is present.

## Family-specific definition of done

### Unit family

Eight-direction idle/move/attack or ability coverage where applicable, hit/damaged/death/wreck states, portrait, icon, faction mask if used, all anchors, contact sheet, provenance, and in-mission review.

### Building family

Placement, four construction stages, operational/active, damage/critical, destruction/rubble, ownership/capture overlays where applicable, entrance/exit/attachment anchors, icon, contact sheet, provenance, and footprint review.

### Terrain biome

All base and transition masks, roads/water/cliffs/bridges, props and destructibles, seasonal or mission variants, passability correspondence, contact sheets, grayscale/zoom scenes, and provenance.

### Effect family

All gameplay-required variants, origin/radius/blend/timing metadata, concurrency budget, reduced-motion and flash-reduction alternatives, grayscale meaning, contact sheet, and provenance.

### UI family

Nine-slice frames, controls and semantic states, icons/cursors/pings, scale/localization expansion, keyboard focus, contrast/color-vision/reduced-motion checks, contact sheet, and provenance.

## Change control

The following require an art-bible or atlas-schema decision before production assets proceed:

- tile size, camera orientation, or supported zoom range;
- direction count/order or anchor semantics;
- semantic palette-token changes;
- mandatory animation-state changes;
- source naming/layout changes;
- atlas manifest field or version changes;
- UI density baseline changes;
- provenance/license requirements.

Balance, simulation, map passability, objective state, and input behavior are outside this document. Visual work reads those contracts; it does not redefine them.
