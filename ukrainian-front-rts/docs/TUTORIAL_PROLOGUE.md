# Interactive Tutorial Prologue

`src/content/campaign/tutorial-prologue.js` defines **First Command**, the campaign-safe interactive tutorial and its pure progression reducer.

## Runtime integration

Create state with `createTutorialProgress()`. Forward normalized runtime events to `reduceTutorialProgress(progress, event)`, then render `getTutorialPrompt(progress)` in the objective/tutorial presentation layer.

The authored sequence covers:

1. click and box selection;
2. movement;
3. worker assignment and resource gathering;
4. structure placement and construction completion;
5. production queueing and unit completion;
6. attack-move and basic combat;
7. tactical ability use;
8. minimap camera navigation;
9. manual save creation;
10. accessibility review;
11. objective completion.

Multi-action steps only advance after all required events arrive. Out-of-order events are ignored, duplicate events are idempotent, and every snapshot is immutable. `tutorial.skip` completes the tutorial without campaign penalties; `tutorial.restart` creates a clean initial snapshot.

## Presentation and accessibility

Every step carries a title, prompt, persistent hint list, focus target, screen-reader announcement flag, and reduced-motion-safe flag. Runtime input glyphs should reflect the active device rather than being embedded in authored strings. Narration is optional, prompts remain available in the objective log, and no step depends on animation timing or audio playback.

This module intentionally owns no localization schema. Localized presentation should resolve the authored IDs through the localization system once UFR-143 is integrated.

## Browser replay checklist

Run the game through its normal local static-server workflow and verify:

- [ ] Click selection and drag selection each unlock their corresponding acknowledgement.
- [ ] Move orders do not accidentally satisfy attack-move.
- [ ] Resource progress requires both worker assignment and a gather result.
- [ ] Construction and production require completion, not only queue/placement.
- [ ] The combat step requires attack-move plus a destroyed training target.
- [ ] Ability and minimap prompts focus the correct controls for keyboard and pointer input.
- [ ] A manual save is visible in the save list before the tutorial advances.
- [ ] Accessibility review is operable by keyboard and screen-reader announcements are not duplicated.
- [ ] Skip completes without rewards or penalties; restart clears partial events.
- [ ] Reloading a saved tutorial restores the same active step and does not replay completed prompts.

## Verification

```sh
node --test tests/campaign/tutorial.test.mjs
./verify.sh
```
