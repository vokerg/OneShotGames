# Production command card

Task: UFR-135  
Contract: `fields-of-resolve.command-card` version 1

## Purpose and ownership

The production command card replaces the legacy unstructured command-button list with a deterministic 4-column by 3-row presentation model. It owns command grouping, paging, visible hotkeys, disabled explanations, armed-targeting and stance presentation, and local keyboard focus movement.

It does not own command validation or execution. Buttons continue to call the existing `Game`, tactical-command, stance, attack-ground, production, construction, ability, and research delegates. UFR-141 retains key rebinding and broader accessibility settings. UFR-133 retains screen and modal architecture.

## Runtime composition

`src/ui/command-card.js` installs through the existing `tactical-command-card` application module. The installer wraps these legacy UI seams reversibly:

- `commandStateSignature()` adds resources and armed presentation state;
- `shouldRenderCommands()` begins one deterministic capture when the existing UI decides commands changed;
- `commandButton()` captures the existing command definitions without changing their callbacks;
- `refresh()` commits one immutable model and DOM render after all command-card extensions have appended actions;
- mission/operation transitions reset page and focus state.

The tactical installer is composed before the stance installer, so base orders, tactical targeting, transport or other extensions, and all stances flow through one model. Disposal restores the exact previous functions and removes the dynamically mounted `command-card.css` link.

## Grid, grouping, and pages

The contract uses twelve slots per page:

```text
4 columns × 3 rows = 12 commands
```

Actions are grouped and ordered as:

1. orders;
2. targeting;
3. stances;
4. abilities;
5. construction;
6. production;
7. modernization.

Source order remains stable inside each group. Duplicate action identifiers receive deterministic numeric suffixes rather than overwriting another command. Selection changes reset to page one; state-only changes retain the active page when it remains valid.

The active combat card naturally exercises paging because its base, tactical, and stance actions exceed twelve slots. All action and page controls retain the production skin's 32-pixel minimum target. Grid columns use a zero intrinsic minimum so the four-column model contracts inside narrow panels instead of clipping horizontally.

## State presentation

Each command carries:

- stable ID, group, slot, row, and column;
- title and description;
- real hotkey when an active binding exists;
- supplemental metadata such as resource cost or cooldown;
- disabled state and a player-facing reason;
- pressed state for active stances or completed modernization;
- targeting state for attack-move, attack-ground, construction placement, patrol, guard, and follow.

Attack Ground is now exposed as a command-card button using the already-integrated UFR-036 controller. No new attack-ground simulation path was introduced.

## Keyboard and accessibility behavior

The visible page is a labeled ARIA toolbar containing native buttons. Native buttons retain Tab, Shift+Tab, Enter, and Space behavior. While a command has focus:

- Left/Right move through the visible page;
- Up/Down move by one grid row;
- Home/End move to the first/last visible command;
- PageUp/PageDown change pages and retain the nearest slot.

The renderer exposes deterministic row/column geometry as data attributes, `aria-keyshortcuts`, `aria-pressed`, `aria-current`, disabled explanations, visible `<kbd>` labels, reduced-motion treatment, and forced-colors fallback. It intentionally avoids grid-only ARIA indices on native toolbar buttons. Disabled reasons are available both inline and through the production tooltip surface.

## Styling

`command-card.css` is mounted by the installer after the existing stylesheets. It keeps model and visual geometry aligned at four columns and three rows, uses UFR-120 skin assets/tokens, and adds group, targeting, hotkey, disabled, and pager treatments without changing `index.html` or settings-owned styles.

## Verification and evidence boundary

Focused coverage:

```bash
node --test tests/ui/command-card.test.mjs
node scripts/verify-command-card.mjs
```

The tests cover model immutability, grouping, paging, navigation, targeting, disabled reasons, activation, focus, stylesheet lifecycle, UI capture, reset, and exact teardown. The dedicated verifier checks active composition, responsive targets, toolbar semantics, assistive hotkey metadata, and required CSS states.

Successful assembled verification and browser mission smoke justify `RUNTIME_INTEGRATED`: the active application installs the command card and renders it during normal mission refresh. Automated smoke does not constitute human verification of every command combination, viewport, or input device, so this task does not independently claim `PLAYER_VERIFIED` or `RELEASE_VERIFIED`.
