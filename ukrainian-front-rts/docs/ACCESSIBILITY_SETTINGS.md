# Accessibility settings and key bindings

UFR-141 extends the existing Audio & Accessibility dialog instead of creating a second settings surface. The runtime installer remains `src/audio/audio-settings-ui.js`; visual preferences, persistence, and reversible DOM application live beside it in `src/audio/accessibility-*.js`. The shared named-action contract lives in `src/core/input-action-map.js` and is re-exported by `src/input/action-map.js` for existing input consumers.

## Persistent contract

`fields-of-resolve.accessibility-settings` version 1 stores:

- UI scale: 80%, 100%, 115%, or 130%;
- text scale: 90%, 100%, 115%, or 130%;
- standard, deuteranopia-assist, protanopia-assist, or tritanopia-assist color treatment;
- standard or high contrast;
- reduced motion and reduced flash policies;
- standard, large, or extra-large cursor;
- focus-loss pause preference;
- an action-centric binding profile for every named gameplay action introduced by UFR-013.

Unknown schemas and future versions fail closed to repository defaults. Writes use the repository-owned browser storage capability, and storage failures leave preferences active for the current session. Returned settings, snapshots, binding profiles, and conflict results are immutable.

## Runtime ownership

`createAccessibilityRuntime()` applies reversible root attributes, custom properties, a repository-owned runtime stylesheet, and the active binding profile. Disposal restores every previous attribute, inline property, binding map, listener, and injected style.

The existing battlefield input installer keeps a read-only live binding view from the core action contract. A preference change therefore affects the next keyboard event without reinstalling input or replacing simulation methods. Explicit test-only binding overrides remain static.

Focus loss raises `fields-of-resolve:accessibility-pause`; focus return raises `fields-of-resolve:accessibility-resume`. The runtime accepts explicit `pause` and `resume` callbacks from the authoritative menu/runtime owner. Until the active menu-stack branch exposes those callbacks on `main`, the mounted settings adapter records the preference, presents the focus-paused state, and emits the shared lifecycle request without monkey-patching `Game.update` or `src/app/runtime.js`.

## Conflict policy

Each physical key can own at most one named action. Choosing an occupied key reports the existing action and makes no change. Repeating the same Assign operation explicitly replaces the old owner. Any action may be unbound, and Restore defaults reinstates the complete immutable default profile together with all visual preferences.

The settings UI uses an explicit key selector rather than collecting arbitrary keystrokes. This keeps the interaction reviewable, prevents accidental browser or modifier-chord capture, and supports keyboard-only operation through normal form controls.

## Verification

Run:

```bash
node --test tests/accessibility/accessibility-settings.test.mjs
node scripts/verify-accessibility-settings.mjs
bash verify.sh
```

The focused suite covers normalization, future-schema fallback, persistence, live installed binding updates, duplicate-key rejection, explicit conflict replacement, unbinding, visual runtime application, focus-loss lifecycle callbacks, and exact teardown. The assembled browser smoke remains authoritative for the injected dialog controls and startup compatibility.

## Parallel boundary

This implementation deliberately does not edit `src/main.js`, `src/app/runtime.js`, `index.html`, shared styles, menu-stack modules, or viewport modules. UFR-139 owns the active menu/runtime seam and UFR-142 owns the active viewport/index seam. Authoritative pause callback wiring must be rebased onto the menu owner after that branch lands; no hidden simulation phase is introduced here.
