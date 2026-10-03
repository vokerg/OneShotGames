# Battlefield input actions and key bindings

`src/input/action-map.js` is the authoritative keyboard-action boundary for battlefield controls. Browser events resolve a physical key through the binding map before the input adapter invokes a command or records a held camera action.

## Named actions

The initial action set covers camera pan up/down/left/right, cancel, attack-move, stop, and auto-fire toggle. Callers should use `INPUT_ACTIONS` rather than branching on literal key strings.

## Default bindings

The defaults preserve existing controls:

- camera: WASD and arrow keys;
- cancel construction placement: Escape;
- attack-move: Q;
- stop: X;
- toggle auto-fire: T.

## Configuration

`installBattlefieldInput` accepts an optional `keyBindings` object. Keys are case-insensitive browser `KeyboardEvent.key` values. Values are members of `INPUT_ACTIONS`.

An override replaces a default physical-key mapping. Setting a key to `null` removes that key's mapping. Overrides do not mutate `DEFAULT_KEY_BINDINGS`, so settings previews and mission restarts can create independent maps safely.

```js
installBattlefieldInput({
  game,
  ui,
  canvas,
  minimap,
  keyBindings: {
    i: INPUT_ACTIONS.CAMERA_UP,
    w: null,
  },
});
```

A future settings UI should persist only overrides, validate duplicate bindings for mutually exclusive actions, and pass the resolved overrides into the input installer. The input adapter remains responsible for keydown/keyup and blur cleanup; simulation and UI code should consume actions or public game commands rather than browser keys.

## Gesture and focus behavior

- Drag selection has a visible rectangle; Shift-drag adds living field units.
- Only a selection gesture started on the battlefield can finish selection. A
  force-fire click captured by its input owner no longer clears the selected force.
- Releasing over the HUD clears drag state without issuing a selection through it.
- Text fields, selects, editable content, and dialogs own their keyboard events.
  Command-button activation keys remain native; Escape can still cancel a command.
- Escape cancels construction or armed targeting before opening Pause on a later press.
- Holding both aliases of a camera direction (for example W and Up) continues moving
  until both release. Focus changes and browser blur clear held camera input.
- Accepted right-click orders show a brief destination marker; Shift state is passed
  explicitly to the public order command. Only left-clicks navigate the minimap.
