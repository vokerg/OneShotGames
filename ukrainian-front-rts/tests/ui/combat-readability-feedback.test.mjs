import assert from 'node:assert/strict';
import test from 'node:test';

import { installCombatReadabilityFeedback } from '../../src/ui/combat-readability-feedback.js';

function setup() {
  let visible = true;
  let cues = [];
  const buttons = [];
  const toasts = [];
  const game = {
    unitStats: () => ({ damage: 10 }),
    combatReadabilitySnapshot: () => ({ preferences: { showDamageNumbers: visible }, cues }),
    toggleDamageNumbers() {
      visible = !visible;
      return visible;
    },
  };
  const ui = {
    commandSignature: 'x',
    appendUnitCommands() {},
    commandButton(input) { buttons.push(input); },
    refresh() {},
    setMission() {},
    toast(message) { toasts.push(message); },
  };
  return { game, ui, buttons, toasts, setCues: (value) => { cues = value; } };
}

test('adds a persisted damage-number command for armed selections', () => {
  const context = setup();
  installCombatReadabilityFeedback(context);
  context.ui.appendUnitCommands([{ type: 'tank' }]);
  assert.equal(context.buttons[0].title, 'Damage Numbers: ON');
  context.buttons[0].onClick();
  assert.match(context.toasts[0], /disabled/);
  assert.equal(context.ui.commandSignature, '');
});

test('announces each incoming cue once', () => {
  const context = setup();
  installCombatReadabilityFeedback(context);
  context.setCues([{ id: 'incoming:1', kind: 'incoming', text: 'Incoming heavy fire' }]);
  context.ui.refresh();
  context.ui.refresh();
  assert.deepEqual(context.toasts, ['Incoming heavy fire']);
});

test('disposer restores exact UI method identities', () => {
  const context = setup();
  const originalRefresh = context.ui.refresh;
  const originalCommands = context.ui.appendUnitCommands;
  const dispose = installCombatReadabilityFeedback(context);
  dispose();
  assert.equal(context.ui.refresh, originalRefresh);
  assert.equal(context.ui.appendUnitCommands, originalCommands);
});

test('mission changes clear the announcement cache', () => {
  const context = setup();
  installCombatReadabilityFeedback(context);
  context.setCues([{ id: 'incoming:1', kind: 'incoming', text: 'Incoming' }]);
  context.ui.refresh();
  context.ui.setMission();
  context.ui.refresh();
  assert.deepEqual(context.toasts, ['Incoming', 'Incoming']);
});
