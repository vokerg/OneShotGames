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

Focus loss raises `fields-of-resolve:accessibility-pause`; focus return raises `fields-of-resolve:accessibility-resume`. The menu composition owns the bridge from those events into the authoritative game runtime. `createGameRuntime()` tracks named pause reasons, so `accessibility-focus-loss` can overlap with a menu pause and focus return removes only the accessibility reason. Starting a mission clears stale reasons, and composition teardown releases only the focus reason it owns.

## Conflict policy

Each physical key can own at most one named action. Choosing an occupied key reports the existing action and makes no change. Repeating the same Assign operation explicitly replaces the old owner. Any action may be unbound, and Restore defaults reinstates the complete immutable default profile together with all visual preferences.

The settings UI uses an explicit key selector rather than collecting arbitrary keystrokes. This keeps the interaction reviewable, prevents accidental browser or modifier-chord capture, and supports keyboard-only operation through normal form controls.

## Verification

Run:

```bash
node --test tests/accessibility/accessibility-settings.test.mjs
node scripts/verify-accessibility-settings.mjs
bash verify.sh
node scripts/browser-accessibility-settings-smoke.mjs
```

The focused suite covers normalization, future-schema fallback, persistence, live installed binding updates, duplicate-key rejection, explicit conflict replacement, unbinding, visual runtime application, independent menu/focus pause ownership, lifecycle events, and exact teardown. The mounted Chromium smoke verifies the injected dialog, live root attributes, local persistence, attack-move rebinding, authoritative focus pause acquisition/release, preservation of pre-existing pause reasons, disabled-focus-pause behavior, and zero page failures.

## Integration boundary

The branch was synchronized after UFR-139 landed, then integrated only through its public runtime and menu-composition ownership seams. It does not edit `index.html`, shared styles, viewport modules, campaign systems, gameplay rules, balance, or sibling games. UI styling is repository-owned and injected by the reversible accessibility runtime rather than competing with UFR-142's viewport stylesheet work.
