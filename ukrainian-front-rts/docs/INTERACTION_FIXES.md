# RTS Interaction Reliability Pass

## Scope

This pass is limited to `ukrainian-front-rts/` and addresses command-card input, construction input, production input, and same-type selection.

## Root cause of inactive command cards

`UI.refresh()` runs from the animation frame loop. It previously cleared `#abilities` and recreated every command button on every frame. A normal mouse activation spans pointer-down and click; replacing the button between those events prevented the browser from delivering the click to the original element. That made production, construction, research, and auto-fire cards appear interactive while their handlers frequently never ran. Keyboard focus was also discarded continuously.

The command panel now uses a state signature derived from the current selection, command cooldowns, production queue composition, construction state, upgrades, hero availability, and pending placement. The panel is rebuilt only when one of those command-relevant values changes. Resource counters, health text, queue timers, objectives, and wave timers still update continuously.

Command buttons also activate on the primary pointer press and ignore the later pointer-generated click. Keyboard-generated clicks remain supported. This provides a defensive input path if a legitimate command-state transition rebuilds the card during the same interaction.

## Selection behavior

Double-clicking a friendly unit now selects all friendly units of the same type that are inside the current battlefield viewport. Units outside the viewport and units of other types remain unselected. Buildings are intentionally excluded from this behavior.

## Construction shortcuts

With a Ukrainian combat engineer selected:

- `1` arms placement of a logistics depot.
- `2` arms placement of an infantry assembly area.
- `3` arms placement of a repair workshop.

The same validation and error reporting used by command-card construction applies to these shortcuts.

## Automated regression coverage

`scripts/verify-interactions.mjs` uses dependency-free DOM and event-target fakes to verify that:

1. unchanged command cards survive consecutive frame refreshes;
2. a primary pointer press activates production exactly once;
3. keyboard-generated button clicks still work;
4. double-click selects matching friendly units only within the visible viewport;
5. construction hotkey `1` invokes logistics-depot placement;
6. disposing battlefield input removes the double-click listener.

`bash verify.sh` runs these checks after syntax and architecture verification.

## Browser validation checklist

1. Select the infantry assembly area and queue both available unit types by clicking their cards.
2. Select the command post and queue an engineer.
3. Select a combat engineer and start each building type from both its card and keys `1`, `2`, and `3`.
4. Toggle auto-fire from the card and with `T`; verify the displayed stance changes once per activation.
5. Double-click an infantry squad with matching squads both on-screen and off-screen; only the visible matching squads should join the selection.
6. Hold the pointer over a command card while queue and cooldown timers update; activation must remain reliable.
