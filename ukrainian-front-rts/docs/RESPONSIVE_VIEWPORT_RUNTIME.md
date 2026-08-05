# Responsive Viewport Runtime

UFR-142 adds a presentation-only viewport layer for desktop browser play. It does not change fixed-step simulation, world coordinates, command semantics, or save data.

## Ownership

- `src/core/viewport-model.js` owns immutable viewport metrics, layout classification, DPR bounds, and camera-center calculations.
- `src/ui/viewport-runtime.js` owns renderer resize patching, responsive/fullscreen DOM state, safe teardown, and diagnostics.
- `src/ui/viewport-runtime-bootstrap.js` installs the renderer patch before `src/main.js` constructs `Renderer`.
- `viewport-runtime.css` owns safe-area, compact-layout, minimum-viewport, and fullscreen presentation.

The runtime deliberately does not own menu/settings flows, localization catalogs, minimap behavior, input commands, simulation scheduling, or game balance.

## Coordinate contract

Pointer and game-command coordinates remain CSS pixels. Device-pixel ratio is applied only to the main canvas backing store and its 2D context transform:

```text
CSS pointer coordinate -> Game.worldPos -> world coordinate
CSS canvas size × bounded DPR -> backing-store pixels
```

This prevents high-DPI rendering from multiplying command coordinates. DPR is bounded to `0.75–2`, preserving the previous maximum while handling browser zoom values below one.

## Resize behavior

The renderer patch snapshots the world-space point at the center of the old viewport, applies new canvas metrics, then restores that same world point to the center of the resized viewport. Camera zoom, simulation state, selection, orders, and mission state are not modified.

The main canvas receives a DPR-scaled backing store. The existing fog canvas remains in logical pixels because the main context scales it once during compositing.

## Responsive modes

The immutable model exposes three modes:

- `standard`: at least `1280 × 720` CSS pixels;
- `compact`: below the standard threshold but at least `960 × 600`;
- `minimum`: below `960 × 600`.

The minimum mode keeps the interface operable with bounded scrolling and displays a non-blocking status notice recommending fullscreen or a larger viewport.

## Fullscreen and safe areas

The top bar receives an accessible fullscreen toggle with `aria-pressed` state. Fullscreen failures are contained and exposed through the button title and diagnostics rather than throwing into gameplay.

CSS uses `env(safe-area-inset-*)` for display cutouts and fullscreen browser chrome. Resize, orientation, visual-viewport, fullscreen, DOM, stylesheet, diagnostic, and animation-frame ownership is explicitly restored on teardown.

## Diagnostics

The runtime exposes a read-only browser diagnostic while installed:

```js
window.__fieldsOfResolveViewport.snapshot()
```

The snapshot includes logical size, backing-store size, DPR, layout mode, fullscreen availability/state, and the most recent fullscreen error.

## Verification boundary

Focused tests cover metric normalization, DPR bounds, camera-center preservation, renderer patch restoration, responsive/fullscreen DOM ownership, teardown, and bootstrap order. The authoritative browser smoke verifies that the assembled application starts with the viewport bootstrap installed before the game runtime.
