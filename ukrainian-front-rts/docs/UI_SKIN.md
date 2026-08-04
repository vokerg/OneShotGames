# Production UI skin

Task: UFR-120  
Contract: `fields-of-resolve.ui-skin` version 1

## Purpose and ownership

UFR-120 replaces the prototype visual treatment of the active browser interface with an original production skin while preserving the existing DOM, UI component ownership, input handling, simulation commands, and semantic state APIs.

The implementation consumes:

- UFR-106 for the production art bible, 4-pixel spacing basis, 32-pixel minimum target, value hierarchy, palette families, nearest-neighbor presentation, and scalable nine-slice requirement;
- UFR-119 for shared semantic palette tokens and the boundary between reusable UI art and active UI adoption;
- UFR-133 for screen, HUD, overlay, modal, focus, and component-ownership semantics.

UFR-120 owns the active skin stylesheet, reusable frame assets, visual state treatment, tooltip frame, and scrollbar presentation. It does not own gameplay rules, command validation, campaign content, localization, audio, or the semantic UI architecture.

## Runtime composition

`index.html` loads `ui-skin.css` after the existing base and component stylesheets. The final stylesheet is an intentional compatibility layer over the current markup:

```text
styles.css
  → economy-hud.css
  → selection-panel.css
  → ui-skin.css
```

The ordering lets existing component geometry remain stable while the production skin replaces prototype colors, bevels, borders, focus states, modal treatment, and scrollbar presentation. No second UI renderer or application installer is introduced.

The active runtime uses the production skin for:

- top resource and alert bar;
- command and selection panel;
- portrait and minimap frames;
- command buttons and state variants;
- selection subgroup tabs and entity cards;
- objective and economy overlays;
- operation selection book and mission cards;
- toast/tooltip presentation;
- endgame report;
- standard and WebKit scrollbars.

## Scalable nine-slice assets

`src/ui/ui-skin.js` is the authoritative versioned contract. It defines nine deterministic assets:

| Asset | Role | Source size | Slice |
| --- | --- | ---: | ---: |
| `panel` | primary HUD panel | 48 × 48 | 12 |
| `panel-accent` | accented HUD panel | 48 × 48 | 12 |
| `overlay` | objectives/economy/modal frame | 48 × 48 | 12 |
| `parchment` | operation/debrief frame | 48 × 48 | 12 |
| `button` | compact and primary controls | 36 × 36 | 9 |
| `tab` | active/selected control | 36 × 36 | 9 |
| `tooltip` | toast and tooltip frame | 40 × 40 | 10 |
| `scroll-thumb` | scrollbar thumb | 24 × 36 | 8 |
| `missing` | visible diagnostic fallback | 32 × 32 | 8 |

The contract validates stable IDs, CSS-variable names, positive integer dimensions, non-empty center regions, bounded border widths, complete component references, minimum target sizes, and accessibility metadata. Unknown asset lookups return the visible red diagnostic fallback instead of silently omitting presentation.

`assets/ui/skin/*.svg` contains the materialized runtime assets. They are crisp-edge, text-free SVGs generated exactly from the contract. Each asset has fixed corners and edges suitable for CSS `border-image`; only the center and edge spans scale.

## State and semantic treatment

The skin explicitly covers:

- default, hover, active, keyboard focus, and disabled control states;
- selected, primary, researched, and active-tab states;
- neutral, objective, benefit, warning, and danger semantics;
- damaged, critical, capacity-near, capacity-over, and completed presentation;
- tooltip appearance through mouse hover and keyboard focus.

Geometry and value changes reinforce state so meaning does not depend on color alone. Essential labels remain live text rather than painted into reusable assets.

## Accessibility and scale

The current skin contract provides:

- 32-pixel minimum targets and 32/40-pixel control height tokens;
- a high-visibility `:focus-visible` ring;
- reduced-motion removal of transitions and press translation;
- increased-contrast palette overrides;
- forced-colors fallback that removes border images and uses system colors;
- text-free frames compatible with future localization expansion;
- responsive preservation of the current 1050-pixel and 760-pixel layout boundaries.

UFR-141 retains broader user-configurable UI/text scale, color-vision, contrast, reduced-motion, cursor, and key-rebinding ownership. UFR-142 retains complete viewport, fullscreen, high-DPI, safe-area, and resize validation.

## Source, generation, and provenance

`art-src/ui/ui-skin-source.json` records the source authority, asset set, required states, constraints, runtime paths, and provenance.

All nine assets are original repository-authored vector geometry created for Fields of Resolve. They use no external images, fonts, commercial-game material, public-figure likenesses, or embedded player-facing text. License: CC0-1.0; redistribution allowed.

Generate or verify the committed runtime assets with:

```bash
node scripts/build-ui-skin.mjs
node scripts/build-ui-skin.mjs --check
node scripts/verify-ui-skin.mjs
```

The authoritative repository verifier runs the focused tests and the dedicated UI-skin verifier in addition to browser startup smoke.

## Verification and evidence boundary

`tests/ui/ui-skin.test.mjs` verifies contract versioning, deep immutability, geometry, deterministic SVG generation, artifact coverage, visible fallback, and malformed-contract rejection.

`scripts/verify-ui-skin.mjs` verifies source provenance, exact generated asset equality, crisp-edge/text-free output, active stylesheet composition, component coverage, interactive states, tooltips, scrollbars, reduced motion, and high contrast.

Because `ui-skin.css` is loaded by the active browser entry point, successful assembled verification and browser mission smoke justify `RUNTIME_INTEGRATED` evidence. They do not constitute a human visual matrix across every supported zoom, resolution, grayscale, color-vision mode, and UI screen. UFR-122 retains deterministic screenshot-scene and complete visual-regression ownership, so UFR-120 does not claim `PLAYER_VERIFIED` or release-level visual closure without that later evidence.
