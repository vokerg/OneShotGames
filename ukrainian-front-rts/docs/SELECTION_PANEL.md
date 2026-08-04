# Selection panel

## Scope

UFR-134 adds the battlefield selection-panel owner for the `selection` HUD region defined by UFR-133. It presents the current authoritative selection without owning selection membership, unit state, transport state, garrison state, veterancy, or gameplay commands.

The implementation is split into:

- `src/ui/selection-panel-model.js` — browser-independent, deeply immutable presentation projection;
- `src/ui/selection-panel.js` — DOM rendering, subgroup filtering, direct selection interaction, and exact lifecycle restoration;
- `selection-panel.css` — isolated selection-region layout and status styling;
- the `selection-panel` application module in `src/main.js` — deterministic installation and disposal.

## Presentation contract

`createSelectionPanelModel(game, entities)` returns a reference-free model containing:

- deterministic primary-selection ordering using `game.primarySelectedId` with stable fallback;
- subgroup descriptors by selected unit type;
- a unit/building grid with names, health ratio, health state, and team metadata;
- visible status indicators for damaged, critical, construction, disabled, burning, pinned, suppression, morale, embarkation, garrison, and hold-fire state when the authoritative entity exposes them;
- veterancy badge, rank, XP, and progress through `veterancyPresentation()`;
- transport passenger and garrison occupant summaries when the selected host exposes those authoritative collections.

The model never stores mutable entity references. Numeric entity IDs sort numerically; non-numeric stable IDs use direct binary ordering. The primary entity is placed first while preserving deterministic order for all other entries.

## Interaction contract

The panel supports two interaction layers:

1. **Subgroup tabs** filter which selected unit cards are visible. Filtering does not modify authoritative selection or the active subgroup owned by `src/input/selection-subgroups.js`.
2. **Unit cards** invoke `game.select(entity, additive)` through the existing public command. Normal click replaces the selection; Shift-click toggles membership using existing `Game.select` semantics.

Canvas selection, control groups, Tab subgroup cycling, Ctrl-select-all-of-type, and stable primary ownership remain in the input layer. The panel does not replace or duplicate those rules.

## Contained units

Transport and garrison contents are read-only summaries:

- transport passengers come from the selected entity's `passengers` collection established by the transport system;
- garrison occupants come from `garrisonState.occupants`, `garrison.occupants`, or a compatible host `occupants` collection;
- contained-unit cards are informational because disembark and garrison-exit commands remain with their authoritative systems and command-card owners.

## Runtime lifecycle

`installSelectionPanel()` wraps only `UI.refresh`, `UI.setMission`, and `UI.showMissionSelect` as a presentation adapter. It:

- renders after the existing UI refresh completes;
- clears panel state during mission transitions and return-to-operations;
- restores the exact original UI methods during reverse-order application disposal;
- never replaces `Game.update`, changes simulation phase order, reads hidden enemy information, or mutates authoritative state outside `game.select()`.

## Verification

Focused verification:

```bash
node --check src/ui/selection-panel-model.js
node --check src/ui/selection-panel.js
node --check tests/ui/selection-panel.test.mjs
node --test tests/ui/selection-panel.test.mjs
```

Repository verification:

```bash
bash verify.sh
```

Manual browser review should cover:

1. single and mixed unit selections;
2. subgroup filtering and existing Tab/Shift+Tab subgroup cycling;
3. direct card selection and Shift-toggle behavior;
4. health/status/veterancy changes during combat;
5. transport passenger and garrison occupant summaries;
6. command-card behavior after primary selection changes;
7. mission restart and return-to-operations cleanup;
8. supported desktop sizes, browser zoom, and keyboard focus visibility.
