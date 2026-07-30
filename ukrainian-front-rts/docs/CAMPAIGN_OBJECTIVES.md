# Campaign objective library

UFR-087 adds a versioned deterministic objective contract and runtime evaluator for authored campaign missions. Missions opt in with `mission.objectiveDefinitions`; legacy mission-specific objective functions and UFR-086 script-owned objectives remain compatible.

## Objective families

The library supports build, gather, capture, escort, defend, survive, destroy, disable, rescue, recon, and extract objectives. Definitions may additionally be optional, hidden, timed, explicitly failed by mission metrics, and configured to fail when protected targets are lost.

Each update publishes immutable `game.objectiveResults` and `game.objectiveLibrarySummary` descriptors with status, progress, current value, remaining time, visibility, and failure reason. Required failures resolve defeat through `game.finish`; optional failures do not fail the mission. Hidden objectives become visible only when completed or failed. Completing all required objectives resolves victory even when optional objectives remain incomplete.

## Integration

`src/systems/objective-system.js` detects `mission.objectiveDefinitions` and delegates to the library. The existing UFR-086 objective phase already invokes that public `Game.updateObjectives()` boundary for non-script-owned missions, so authored library objectives participate in the fixed-step lifecycle without moving rules into UI or renderer code. Missions using `objectiveMode: 'scripted'` retain script ownership.

Entity selectors use stable IDs, script IDs, types, teams, and tags. Region objectives may embed a rectangle/circle or reference an authored UFR-086 mission-script region. Destroy objectives may consume `game.objectiveMetrics.destroyed[objectiveId]` when a lifecycle owner provides aggregate destruction records; explicit seen targets are also tracked across removal. Mission scripts may set `game.objectiveMetrics.failed[objectiveId]` for authored fail states.
