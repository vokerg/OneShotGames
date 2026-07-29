# Semantic UI architecture

## Purpose

The UI layer translates read-only game state and domain events into player-facing information, and
translates player intent into public commands. It never owns authoritative resources, combat results,
objectives, production completion, campaign progression, or simulation timing.

UFR-133 establishes a browser-independent semantic contract under `src/ui/`. The current `src/ui.js`
remains the legacy DOM adapter until later screen and HUD tasks migrate it incrementally. This task does
not create a second runtime UI, replace existing markup, or change player-visible behavior.

## Owners

| Owner | Responsibility |
| --- | --- |
| `src/ui/ui-contract.js` | Screen definitions, screen layers, input scopes, HUD regions, refresh regions, and component ownership names. |
| `src/ui/ui-state.js` | Screen-stack transitions, modal policy, semantic focus restoration, immutable presentation state, and batched refresh plans. |
| `src/ui.js` | Existing DOM queries, command-button rendering, mission cards, endgame presentation, and current browser integration. |
| `src/input/` | Browser gestures and configurable actions; consults UI input policy before routing gameplay actions. |
| `src/main.js` | Composition only; constructs and wires UI adapters and state coordinators. |
| `Game` and `src/systems/` | Authoritative gameplay state and commands. UI modules do not import `Game`. |

`src/ui/` is classified as the existing `ui` architecture layer. It may import `core`, `schema`,
`config`, or sibling `ui` modules. It may not import `game`, `systems`, `input`, `render`, `audio`, or
`main`. DOM adapters may live in the UI layer, but semantic contract/state modules should remain
DOM-free so they can be tested under Node.

## Screen stack

A UI session contains exactly one base screen and zero or more overlays or modals.

### Layers

- **Base** replaces the complete navigation stack. Base screens are never dismissible.
- **Overlay** sits above a base screen and may replace or inherit visible HUD regions. An overlay cannot
  be pushed while a modal is open.
- **Modal** sits at the top of the stack, captures UI input, traps focus, and may be nested. Closing is
  last-in-first-out.

The default registry defines:

| Screen | Layer | Input scope | HUD behavior | Default focus |
| --- | --- | --- | --- | --- |
| `operations` | base | UI | replace with no battlefield HUD | `operations-primary` |
| `battlefield` | base | gameplay | all HUD regions | `battlefield` |
| `briefing` | overlay | UI | mission, objectives, notifications | `briefing-primary` |
| `pause` | overlay | UI | inherit | `pause-resume` |
| `endgame` | overlay | UI | mission, objectives, notifications | `endgame-primary` |
| `settings` | modal | modal | inherit | `settings-close` |
| `confirmation` | modal | modal | inherit | `confirmation-primary` |

Feature tasks may extend this registry. Every definition must use a declared layer and input scope,
reference only known HUD regions, provide a semantic focus key or `null`, and keep base screens
non-dismissible. Modal screens must use the modal input scope.

## Input capture

The top screen determines the input policy:

- `gameplay`: gameplay actions may be routed to public game commands;
- `ui`: gameplay actions are blocked while ordinary UI navigation remains active;
- `modal`: gameplay actions are blocked and focus is trapped inside the top modal.

Input adapters consume this policy; they do not infer modal state from CSS classes or DOM visibility.
Escape/back handling asks the screen stack to close the top entry. Non-dismissible entries require an
explicit forced transition from the owning flow, such as accepting an endgame result.

## Focus protocol

Focus is represented by semantic keys, never DOM nodes. Examples include `pause-resume`,
`settings-close`, and `command-attack`.

When a screen opens, its default focus key becomes the pending focus request. The entry records the
previous semantic focus target. Closing restores that target, or the newly exposed screen's default if
the previous target is unavailable. The browser adapter:

1. registers rendered controls by semantic focus key;
2. consumes at most one pending focus request after applying the refresh plan;
3. focuses the matching element;
4. calls `recoverFocus` when the requested target no longer exists;
5. never stores an element reference in semantic state.

This makes focus restoration deterministic across rerenders and allows keyboard navigation without
coupling the state contract to HTML structure.

## HUD regions and ownership

The canonical refresh order is stable:

1. `screen`
2. `resources`
3. `mission`
4. `objectives`
5. `selection`
6. `commandCard`
7. `minimap`
8. `notifications`
9. `modalLayer`

| Region | Component owner | Intended state |
| --- | --- | --- |
| `screen` | screen host | Navigation snapshot, stack, input policy, visible HUD set. |
| `resources` | resource strip | Resource values, rates, and command-capacity presentation. |
| `mission` | mission header | Mission identity, phase, timer, and high-level status. |
| `objectives` | objective panel | Objective IDs, text keys, status, progress, and optionality. |
| `selection` | selection panel | Stable entity IDs, type groups, health/status summaries, and primary selection. |
| `commandCard` | command card | Command IDs, hotkeys, enabled state, disabled reason, page, and targeting state. |
| `minimap` | minimap panel | Read-only markers, pings, filters, and viewport metadata. |
| `notifications` | notification feed | Stable message/event records and acknowledgement state. |
| `modalLayer` | modal host | Top modal entry or `null`. |

`screen` and `modalLayer` are reserved for navigation synchronization. Feature code writes semantic HUD
state only through declared HUD regions.

## Semantic state

Presentation state contains JSON-like values only: finite numbers, strings, booleans, `null`, arrays,
and plain objects. Values are cloned, key-normalized, and frozen when accepted. The contract rejects:

- mutable entity references;
- DOM, canvas, audio, renderer, or class instances;
- maps, sets, dates, functions, symbols, and `undefined`;
- non-finite numbers;
- cyclic object graphs.

Use stable IDs and copied values. A selection snapshot may contain entity IDs and displayed health, but
not entity objects. A command-card entry may contain a public command ID and disabled reason, but not a
callback closure.

## Refresh strategy

`UiRefreshStore` separates semantic state publication from DOM work.

- `set(region, state)` normalizes and compares the state with the prior semantic value.
- Equivalent values do not schedule another render.
- `invalidate(region, reason)` requests a render without replacing the region state.
- Multiple changes and reasons accumulate until `consume()`.
- `consume()` returns one immutable plan in canonical region order and clears pending invalidations.
- An animation frame should consume at most one plan after authoritative fixed-step updates complete.

The browser adapter renders only listed regions. A region renderer must be idempotent: applying the same
semantic state twice yields the same DOM. DOM signatures may optimize an adapter, but they are not the
source of truth.

## Typical composition

```js
import { createUiState } from './ui/ui-state.js';

const uiState = createUiState({ initialScreen: 'operations' });

uiState.replaceBase('battlefield', { missionId: 'donbas' });
uiState.setRegionState('resources', { metal: 240, fuel: 90, intel: 15 });
uiState.setRegionState('selection', { ids: [17, 23], primaryId: 17 });

const plan = uiState.consumeRefreshPlan();
uiAdapter.apply(plan);
uiAdapter.focus(uiState.consumeFocusRequest());
```

The adapter may invoke public commands in response to browser input, but callbacks and command handlers
remain outside semantic state.

## Event and command flow

```text
authoritative mutation
  → optional domain event / read-only state snapshot
  → semantic region state
  → one batched refresh plan
  → DOM adapter updates named components

browser gesture
  → top-screen input policy
  → UI navigation action or public Game command
```

A presentation consumer may be absent without changing gameplay results. UI state revisions are not
simulation ticks and are not replay-authoritative.

## Extension recipe

For a new screen:

1. Add one registry definition with layer, input scope, default focus, HUD mode, and HUD regions.
2. Add deterministic transition, input-capture, and focus-restoration tests.
3. Implement the browser component separately from semantic state.
4. Register every focusable control with a semantic key.
5. Route gameplay intent through existing named actions and public game commands.
6. Update this document if layer or ownership rules change.

For a new HUD component:

1. Add a canonical region and owner in `ui-contract.js`.
2. Define a JSON-like state shape in the feature documentation.
3. Add state equivalence and refresh-plan tests.
4. Render only from the region state; never read authoritative state from arbitrary DOM callbacks.
5. Keep player-visible strings ready for later localization ownership.

## Verification

Run:

```bash
node --check src/ui/ui-contract.js
node --check src/ui/ui-state.js
node --check tests/ui/ui-state.test.mjs
node --test tests/ui/ui-state.test.mjs
node --test tests/tooling/architecture-verifier.test.mjs
bash verify.sh
```

Browser checks become required when a later task wires the coordinator into `src/ui.js` or introduces a
new player-visible screen. The UFR-133 contract itself is browser-independent and intentionally leaves
current runtime presentation unchanged.
