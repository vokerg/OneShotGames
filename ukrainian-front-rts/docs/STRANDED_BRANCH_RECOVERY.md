# Stranded interaction branch recovery

## Source

This recovery assesses `fix/ukrainian-rts-interactions` against the current `main` architecture and roadmap.

## Recovered now

- Stable command-card DOM nodes: unchanged command state no longer clears and recreates buttons every animation frame.
- Defensive pointer activation: primary pointer-down executes a command immediately, while the following pointer-generated click is ignored; keyboard-generated clicks remain supported.
- Double-click same-type selection: the existing current selection subsystem is reused to select matching friendly units in the visible viewport.
- Focused automated regression coverage for command-card stability and battlefield input wiring.

## Superseded or rejected

- Numeric construction shortcuts (`1`, `2`, `3`) are not recovered because number keys now own control groups.
- The production/rally prototype is not transplanted. It subclasses `Game`, monkey-patches `UI` and `Renderer`, installs competing capture-phase input handlers, and assigns `R` to rally while current construction placement uses `R` for rotation.
- The prototype implements only fragments of UFR-058 and UFR-059: it lacks queue reorder/repeat/pause/refund policy completeness and rally waypoint/blocking/acknowledgement requirements. It remains useful reference material for those tasks.
- Stale README and architecture snapshots are not copied over current documentation.

## Roadmap impact

The implementation queue and quality gates remain correct. This recovery closes an immediate interaction reliability defect and restores a familiar selection gesture, but it does not complete or reorder any queued production, rally, navigation, combat, campaign, visual, audio, or release task.
