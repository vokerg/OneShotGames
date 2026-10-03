# Live visual readability repair

PR: [#306](https://github.com/vokerg/OneShotGames/pull/306)

Base: `24fddcbf3182b3278f7b42e32c9b9cc42c57a77f`.

The maintainer explicitly requested visual fixes after inspecting the running game. This is a focused corrective change, rather than completion of a conveyor art task. Building atlas work remains owned by PR #305.

## Runtime changes

- The renderer previously treated all runtime terrain values beyond mud/shelterbelt as grass. Water, road, rubble and blocked cells now use their actual meanings; water has ripples and banks, and bridge decking follows the authored bridge cells. Grass variation is quieter. Tile textures are cached per renderer and drawing is bounded to the viewport.
- The minimap uses the same numeric terrain meanings. Navigation, fog, simulation values and visibility filtering retain their existing owners.
- Friendly unit marks are circles and hostile marks diamonds, with an outline; selection has a contrasting double ring. Undamaged, unselected buildings no longer show redundant health bars.
- Machine resource labels become player-facing English/Ukrainian labels. Operation headers omit internal map IDs, fake zero-wave summaries and script-trigger counts. The map label draws after fog as HUD information.
- `release-ui.css` owns the final system-font typography, flat control surfaces, dark panel palette, spacing and readable disabled/locked states across the HUD, economy, technology tree and campaign pages. Briefings have a dedicated text/action layout instead of the thumbnail grid.
- Stop, hold, attack-move, attack-ground, patrol, guard, follow and repair orders have different glyph silhouettes.

## Verification

Highest evidence level: **RUNTIME_INTEGRATED**, with partial manual player review. This does not claim full campaign or release verification.

- `node --check src/render/battlefield-terrain.js`: passed.
- Focused terrain/command/tech/minimap tests: 18 passed.
- New terrain/cache/bridge/resource-label/icon tests: 4 passed.
- Effects plus new terrain tests: 9 passed.
- `bash verify.sh` in an isolated native worktree containing only this change: 639 stages passed, including 1,352 unit tests, five performance tests, runtime composition and architecture checks. Release automation: 307 checksums and seven HTTP checks passed.
- `git diff --check`: passed.
- Browser review: actual `localhost:8080` and isolated `localhost:8081`; Hold the Crossing briefing, mission, selection, command card, economy and technology tree inspected. Right-click movement and attack-move were exercised; attack-move targeting cleared after the destination order. Mouse zoom, four WASD keys and minimap navigation were exercised with the pause menu closed. Combat alerts and damage continued normally during observation.
- Art Lab: roster inspected at 0.65, 0.85 and 1.15 zoom in grayscale; color inspection included minimum zoom. The existing harness has overlapping review strips and dual grayscale handlers. It was not treated as proof of a complete art or all-zoom color review.

## Integration follow-up

The maintainer subsequently requested committing all remaining local edits and
squash merging. PR #306 now includes those input, rendering and skin changes:
keyboard focus guards, Shift order queueing/selection, HUD drag release handling,
visible accepted-order feedback, and visible contact/portrait fallback while
production sprites load. `UI.refresh` tolerates fixtures without a mouse state.
Focused gesture/interaction/localization tests pass. Missing-sprite tests check
that units remain visible and selectable without changing simulation state.

The Ukrainian campaign metadata now translates objective counts and restores
English exactly. Its browser smoke checks the actual authored-operation count,
rather than the removed fake zero-wave text. Art Lab profile deletion retries
transient Chromium teardown races without hiding renderer/test failures.

Building silhouettes are supplied by PR #305. Integration review corrected its
installer order, active wreck traversal, Retina review coordinates, and grayscale
presentation. Startup checks now require actual atlas draws. The combined tree
is validated with the assembled verifier and final-head browser CI before merge.
Automated mission startup covers authored missions; manual review focuses on the
publicly available first operation, Prologue, Skirmish, controls, panels and Art
Lab. No full campaign playthrough or `PLAYER_VERIFIED` release claim is made.

The native clean verification checkout uses canonical Git fixture bytes to avoid
user-global CRLF conversion breaking generated-art checksum tests. No generated
asset or global Git setting is changed by this repair.

## Captures

The before/after battlefield captures are from the original user working tree with its pre-existing changes preserved, at the same 1728 × 891 viewport. They show the visual repair layered onto that starting point. The isolated briefing capture independently verifies the PR without those local changes, at 1728 × 1028.

- [Before battlefield](reviews/visual-readability/before-battlefield.png)
- [After battlefield](reviews/visual-readability/after-battlefield.png)
- [After economy](reviews/visual-readability/after-economy.png)
- [After technology tree](reviews/visual-readability/after-tech-tree.png)
- [Isolated briefing](reviews/visual-readability/clean-after-briefing.png)
- [Art Lab grayscale](reviews/visual-readability/after-art-lab-gray.png)

## Final combined review

PR #305 was squash merged at `689d65a9d0e0faff745490c45b71d6617884fcc1`
after verification run 37103256230 and headed browser QA 37103256197 passed.
This PR is refreshed onto that exact main revision.

- Combined `bash verify.sh`: 646 stages, 1,362 unit tests, five performance tests,
  264-module architecture/runtime composition, 312 checksums and seven HTTP checks.
- Focused gesture, interaction, localization and missing-sprite regressions: 14 passed.
- Art Lab buildings inspected at 0.65, 0.85 and 1.15, in color and grayscale.
- First mission: visible atlas buildings, mixed selection, Tab cycling both from
  canvas and command-card focus, right-click/attack-move, zoom and minimap exercised.
- Compact minimap filters wrap within their frame; browser smoke now asserts
  their containment, including minimum viewports. Tab remains a subgroup shortcut.
- Final-head CI covers authored mission startup and cross-browser presentation.
- Warnings: existing Node module-type warnings and historical completion markers
  missing evidence levels. No simulation or save schema change is introduced.

The final startup smoke now advances through all nine operations in its disposable
Chromium profile, asserts distinct mounted maps and a ready atlas (with actual draws required in the
first mission), and
captures each battlefield at the minimum and maximum wheel-zoom bounds. It uses
the existing campaign smoke finish diagnostic only in that isolated test profile.
This is startup/render coverage, not a claim of completing every mission's gameplay.

The expanded nine-map startup check found an existing fourth-operation debrief
failure: later operation titles live in mission/briefing data. Next-operation
titles now resolve those existing authored fields, as the operation selector
already does. An assembled browser-runtime regression test completes the full
nine-operation sequence, checks the next unlocked title, and verifies repeated
UI refresh does not duplicate campaign results.
