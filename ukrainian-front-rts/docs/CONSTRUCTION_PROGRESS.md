# Construction progress policy

`src/systems/construction-progress-system.js` owns the browser-independent work, builder contribution, pause, cancellation, and refund contract introduced by UFR-056. `src/systems/construction-progress-runtime.js` applies that contract to live buildings and engineers. Placement validity, footprint geometry, terrain flattening, and navigation blockers remain owned by UFR-055.

## State contract

A normalized construction-progress record contains:

- a stable building ID;
- required and completed work, where authored `buildTime` is the required work at one full builder;
- stable sorted builder IDs;
- paused, completed, and cancelled state;
- the original paid resource cost used for cancellation refunds;
- schema version `1`.

Records and nested collections are frozen. Callers replace the progress record rather than mutating it.

## Multiple builders

Builder contribution is deterministic and based only on the sorted eligible-builder set. The default effective contribution is:

- first builder: `1.0`;
- second builder: `0.7`;
- third builder: `0.5`;
- fourth builder: `0.35`;
- each additional builder: `0.2`.

Only assigned engineers within the 55-world-unit construction interaction range contribute. Engineers moving toward a site do not add work until they arrive. This gives useful acceleration without linear construction stacking. `effectiveConstructionBuilders()` exposes the exact aggregate for UI estimates and AI planning.

## Runtime lifecycle

`createConstructionProgressController()` composes after placement and worker/drop-off controllers. It:

- attaches one progress record whenever an `underConstruction` building is created;
- converts right-clicks on unfinished friendly sites into builder assignments;
- exposes `assignConstructionBuilders()`, `pauseConstruction()`, `resumeConstruction()`, and `cancelConstructionSite()` application commands;
- replaces the legacy per-engineer HP construction branch while delegating unrelated worker orders unchanged;
- clears gathering and queued orders when an engineer is reassigned to construction;
- removes dead, invalid, reassigned, or out-of-range builders without resetting completed work.

`updateConstructionProgress()` runs once after unit movement inside the existing fixed-step units phase. It applies aggregate work in stable building-ID order, advances construction HP, completes exactly without overshoot, grants building capacity once, and clears all builder orders when the site finishes.

A site with no active builders simply applies zero work. Pausing preserves progress and builder assignments. Resuming continues from the same work total.

## Refund policy

The default cancellation refund is 75% of the uncompleted fraction of each originally paid resource, rounded down to whole resource units. Completed construction cannot be cancelled. The refund rate is validated between zero and one.

Example: cancelling a 100-metal structure at 50% progress returns `floor(100 × 0.5 × 0.75) = 37` metal.

Cancellation clears construction orders, removes the unfinished building, and applies the immutable refund to player resources. It does not restore flattened terrain; foundation and terrain restoration remain outside UFR-056.

## Presentation contract

`constructionPresentation()` returns a frozen snapshot containing building ID, progress fraction, paused state, active builder count, and completion state. UI and AI consumers must use this snapshot rather than calculate progress or refund rules independently.

## Ownership boundaries

- UFR-055 owns placement evaluation, previews, terrain flattening, and blocker metadata.
- UFR-056 owns construction work, builder scaling, runtime assignment, pause/resume, builder removal, completion, cancellation, and proportional refunds.
- UFR-057 owns later building lifecycle, capture, sell/scuttle, rubble, repairable construction stages, and capacity recalculation after lifecycle transitions.
- UFR-052 owns worker overview presentation; UFR-053 owns drop-off capabilities and travel-cost selection.
- Production, research, combat stances, navigation caching, campaign state, renderer art, and audio remain separate owners.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/construction-progress-system.js
node --check src/systems/construction-progress-runtime.js
node --check src/systems/simulation-phases.js
node --check src/main.js
node --check tests/economy/construction-progress-system.test.mjs
node --check tests/economy/construction-progress-runtime.test.mjs
node --test tests/economy/construction-progress-system.test.mjs tests/economy/construction-progress-runtime.test.mjs
bash verify.sh
```

The focused suites cover immutable state, stable builder ordering, diminishing returns, in-range contribution, pause/resume, builder death and reassignment, exact completion, one-time capacity activation, right-click assignment, proportional refunds, site removal, and delegation of unrelated worker commands.
