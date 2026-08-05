# Minimap and alert queue

Task: UFR-136  
Contract: `fields-of-resolve.minimap-snapshot` version 1

## Ownership

UFR-136 owns tactical-map presentation and the bounded player-facing alert queue. It consumes the current world, camera, terrain, visibility, entity, objective, and production state without changing simulation outcomes.

The component does not own:

- line-of-sight or fog authority, which remains UFR-033 ownership;
- mission objective evaluation or scripting, which remains UFR-086/UFR-087 ownership;
- camera rules and battlefield navigation, which remain the camera/input owners;
- production completion, combat damage, team assignment, or entity lifecycle;
- shared production UI frames and controls, which remain UFR-120/UFR-133 ownership.

## Runtime composition

`installMinimapAlerts` is installed through `src/main.js` as one application-composition module. It replaces only the active `Renderer` instance's `mini()` presentation method and restores the previous method on disposal. It does not patch the renderer class, add another render loop, or wrap a `Game` command.

The runtime exposes a presentation-only `game.minimapAlerts` adapter while installed:

- `push(alert)` adds a bounded alert and optional world ping;
- `remove(id)` removes an alert;
- `snapshot()` returns the immutable visible queue;
- `focus(position)` moves the camera through the existing camera state.

The previous property value is restored exactly during composition teardown.

## Snapshot contract

`createMinimapSnapshot` returns immutable data for:

- all 80 × 52 authored terrain cells;
- visible, explored, and hidden fog states;
- authored road points;
- filtered unit, building, resource, ally, neutral, and visible-hostile markers;
- active attack, objective, production, and informational pings;
- the clipped camera viewport rectangle;
- the active marker filters.

When the assembled game exposes an authoritative `canPlayerSee` or visibility-query API, the minimap consumes it. The current compatibility fallback mirrors the legacy friendly-sight fog policy and does not reveal hostile markers outside that result. The minimap never calculates combat targeting or mutates visibility state.

## Alerts and pings

The queue is deterministic for a supplied clock, bounded to eight visible alerts, priority ordered, deduplicated, and automatically expires entries. Attack alerts are observed from Ukrainian entity damage. Objective alerts are observed from objective-state transitions. Production alerts consume ordered production acknowledgements. Existing UI toast callers are unchanged unless they explicitly supply alert metadata such as `kind` or `worldPosition`; that opt-in route prevents ordinary status messages from duplicating observer-generated alerts. Message classification applies only to an explicit toast handoff without a supplied kind.

Every alert with a world position produces a minimap ping. Clicking its queue entry focuses the camera. Pressing near a visible ping focuses that alert and consumes that pointer event; all other minimap input remains with the existing battlefield-input camera owner. Mission changes and simulation-time rewinds clear stale alerts and explored-fog presentation before rebasing against the new mission state.

## Accessibility and filters

The minimap canvas has an explicit accessible name. Marker filters are native labelled checkboxes. The alert queue is an ordered live region with keyboard-focusable buttons. Color is reinforced by marker geometry, alert-kind labels, and queue text. Reduced-motion settings do not affect readability because ping state is rendered from deterministic elapsed time rather than CSS animation.

## Verification boundary

Focused tests cover coordinate conversion, viewport clipping, terrain/fog coverage, marker filtering, hostile fog exclusion, road normalization, queue bounds and expiry, damage pings, explicit toast handoff, mission reset rebasing, camera focus, renderer replacement, and exact teardown restoration. Assembled CI and browser smoke validate active composition.

A human-reviewed all-mission visual matrix at every zoom, grayscale mode, and color-vision preset is not part of this task. The highest completion evidence must not exceed `RUNTIME_INTEGRATED` without that additional review.
