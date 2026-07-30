# Campaign objective library

UFR-087 adds deterministic objective definition validation and evaluation in `src/systems/objective-library.js`.

Supported families are build, gather, capture, escort, defend, survive, destroy, disable, rescue, recon, and extract. Objectives may be optional, hidden, or timed, with explicit active/completed/failed/invalid states and normalized progress. Objective sets ignore optional failures when determining required mission completion or failure.

Mission scripting owns when evaluation occurs and how state snapshots are assembled. UI presentation, dialogue, map markers, and save/checkpoint integration remain consumers of the immutable results.
