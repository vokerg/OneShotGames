import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_UI_SCREENS,
  UI_HUD_REGIONS,
  createUiScreenRegistry,
} from '../../src/ui/ui-contract.js';
import {
  UiRefreshStore,
  UiScreenStack,
  createUiState,
} from '../../src/ui/ui-state.js';

test('default registry defines base, overlay, modal, and HUD ownership contracts', () => {
  const registry = createUiScreenRegistry();
  assert.equal(registry.operations.layer, 'base');
  assert.equal(registry.pause.layer, 'overlay');
  assert.equal(registry.settings.layer, 'modal');
  assert.deepEqual(registry.battlefield.hudRegions, UI_HUD_REGIONS);
  assert.ok(Object.isFrozen(registry));
});

test('screen stack replaces base screens and derives gameplay input policy', () => {
  const stack = new UiScreenStack();
  assert.equal(stack.snapshot().baseScreen, 'operations');
  assert.equal(stack.inputPolicy().blocksGameplay, true);
  stack.replaceBase('battlefield', { missionId: 'donbas' });
  assert.equal(stack.snapshot().topScreen, 'battlefield');
  assert.equal(stack.inputPolicy().scope, 'gameplay');
  assert.deepEqual(stack.visibleHudRegions(), UI_HUD_REGIONS);
  assert.equal(stack.consumeFocusRequest(), 'battlefield');
});

test('overlay and modal transitions obey ordering and modal capture rules', () => {
  const stack = new UiScreenStack({ initialScreen: 'battlefield' });
  stack.push('pause');
  stack.push('settings');
  const snapshot = stack.snapshot();
  assert.deepEqual(snapshot.stack.map((entry) => entry.id), ['battlefield', 'pause', 'settings']);
  assert.equal(snapshot.modalDepth, 1);
  assert.deepEqual(snapshot.input, {
    screenId: 'settings',
    scope: 'modal',
    blocksGameplay: true,
    trapsFocus: true,
    dismissible: true,
  });
  assert.throws(() => stack.push('briefing'), /while a modal screen is open/);
});

test('closing screens restores semantic focus in last-in-first-out order', () => {
  const stack = new UiScreenStack({ initialScreen: 'battlefield' });
  stack.consumeFocusRequest();
  stack.setFocusTarget('command-attack');
  stack.push('pause');
  assert.equal(stack.consumeFocusRequest(), 'pause-resume');
  stack.setFocusTarget('pause-settings');
  stack.push('settings');
  assert.equal(stack.consumeFocusRequest(), 'settings-close');
  stack.closeTop();
  assert.equal(stack.consumeFocusRequest(), 'pause-settings');
  stack.closeTop();
  assert.equal(stack.consumeFocusRequest(), 'command-attack');
});

test('non-dismissible overlays require an explicit forced transition', () => {
  const stack = new UiScreenStack({ initialScreen: 'battlefield' });
  stack.push('endgame');
  assert.throws(() => stack.closeTop(), /not dismissible/);
  stack.closeTop({ force: true });
  assert.equal(stack.snapshot().topScreen, 'battlefield');
  assert.throws(() => stack.closeTop(), /base UI screen/);
});

test('focus recovery requests the top screen default when focus is missing', () => {
  const stack = new UiScreenStack({ initialScreen: 'battlefield' });
  stack.consumeFocusRequest();
  stack.setFocusTarget('missing-command');
  assert.equal(stack.recoverFocus((key) => key === 'battlefield'), 'battlefield');
  assert.equal(stack.consumeFocusRequest(), 'battlefield');
  assert.equal(stack.recoverFocus((key) => key === 'battlefield'), null);
});

test('semantic screen parameters reject mutable class and cyclic references', () => {
  const stack = new UiScreenStack();
  class BrowserLike {}
  assert.throws(() => stack.replaceBase('battlefield', { node: new BrowserLike() }), /plain object/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => stack.replaceBase('battlefield', cyclic), /cyclic references/);
});

test('refresh store batches canonical regions and suppresses equivalent semantic state', () => {
  const refresh = new UiRefreshStore();
  assert.equal(refresh.set('selection', { ids: [2, 1], summary: { tanks: 1 } }), true);
  assert.equal(refresh.set('selection', { summary: { tanks: 1 }, ids: [2, 1] }), false);
  refresh.set('resources', { fuel: 20, metal: 100 });
  refresh.invalidate('selection', 'selection-command-state');
  const plan = refresh.consume();
  assert.deepEqual(plan.regions, ['resources', 'selection']);
  assert.deepEqual(plan.reasons.selection, ['selection-command-state', 'state-change']);
  assert.equal(refresh.consume(), null);
});

test('semantic state is cloned, frozen, and cannot retain entity or DOM-style instances', () => {
  const refresh = new UiRefreshStore();
  const source = { nested: { value: 7 } };
  refresh.set('mission', source);
  source.nested.value = 9;
  assert.equal(refresh.get('mission').nested.value, 7);
  assert.ok(Object.isFrozen(refresh.get('mission').nested));
  assert.throws(() => refresh.set('mission', { entity: new Map() }), /plain object/);
  assert.throws(() => refresh.set('mission', { progress: Number.NaN }), /finite numbers/);
});

test('coordinator reserves screen regions and emits one batched refresh plan', () => {
  const state = createUiState({ initialScreen: 'battlefield' });
  state.setRegionState('resources', { metal: 100, fuel: 50, intel: 10 });
  state.setRegionState('objectives', [{ id: 'hold', complete: false }]);
  state.pushScreen('pause');
  const plan = state.consumeRefreshPlan();
  assert.deepEqual(plan.regions, ['screen', 'resources', 'objectives', 'modalLayer']);
  assert.equal(plan.state.screen.topScreen, 'pause');
  assert.equal(plan.state.modalLayer, null);
  assert.throws(() => state.setRegionState('screen', {}), /reserved UI region/);
});

test('coordinator exposes modal state separately and restores the prior stack', () => {
  const state = createUiState({ initialScreen: 'battlefield' });
  state.consumeRefreshPlan();
  state.pushScreen('pause');
  state.pushScreen('settings', { tab: 'controls' });
  let plan = state.consumeRefreshPlan();
  assert.equal(plan.state.screen.modalDepth, 1);
  assert.equal(plan.state.modalLayer.id, 'settings');
  assert.deepEqual(plan.state.modalLayer.params, { tab: 'controls' });
  state.closeTop();
  plan = state.consumeRefreshPlan();
  assert.equal(plan.state.screen.topScreen, 'pause');
  assert.equal(plan.state.modalLayer, null);
});

test('custom screen registries fail fast on invalid architecture declarations', () => {
  assert.throws(() => createUiScreenRegistry({ dialog: { layer: 'modal', inputScope: 'ui' } }), /must use modal input scope/);
  assert.throws(() => createUiScreenRegistry({ root: { layer: 'base', inputScope: 'ui', hudRegions: ['ghost'] } }), /unknown HUD region/);
  assert.throws(() => createUiScreenRegistry({ overlay: { layer: 'overlay', inputScope: 'ui' } }), /at least one base screen/);
  assert.deepEqual(createUiScreenRegistry(DEFAULT_UI_SCREENS), DEFAULT_UI_SCREENS);
});
