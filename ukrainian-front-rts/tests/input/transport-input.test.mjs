import assert from 'node:assert/strict';
import test from 'node:test';

import { createKeyBindings, INPUT_ACTIONS, resolveInputAction } from '../../src/input/action-map.js';
import { installTransportInput } from '../../src/input/transport-input.js';

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); },
    listeners,
  };
}

test('maps E to the named disembark action while preserving overrides', () => {
  const defaults = createKeyBindings();
  assert.equal(resolveInputAction(defaults, 'E'), INPUT_ACTIONS.DISEMBARK);
  const overridden = createKeyBindings({ e: null, r: INPUT_ACTIONS.DISEMBARK });
  assert.equal(resolveInputAction(overridden, 'e'), null);
  assert.equal(resolveInputAction(overridden, 'R'), INPUT_ACTIONS.DISEMBARK);
});

test('shows embark feedback only when the command boundary reports transport activity', () => {
  const toasts = [];
  let refreshes = 0;
  const game = {
    lastCommandMessage: '',
    lastError: '',
    issue() {
      this.lastCommandMessage = '2 squads embarked.';
      return true;
    },
  };
  const target = eventTarget();
  const dispose = installTransportInput({
    game,
    ui: { toast: (message) => toasts.push(message), refresh: () => { refreshes += 1; } },
    windowTarget: target,
  });

  assert.equal(game.issue(1, 2, null), true);
  assert.deepEqual(toasts, ['2 squads embarked.']);
  assert.equal(refreshes, 1);
  assert.equal(game.lastCommandMessage, '');

  dispose();
  assert.equal(target.listeners.size, 0);
});

test('invokes disembark through the named action and reports blocked exits', () => {
  const toasts = [];
  let refreshes = 0;
  let prevented = false;
  const game = {
    gameOver: false,
    lastCommandMessage: '',
    lastError: '',
    issue() { return true; },
    disembarkSelected() {
      this.lastError = 'No safe disembark position is available near the transport.';
      return false;
    },
  };
  const target = eventTarget();
  installTransportInput({
    game,
    ui: { toast: (message) => toasts.push(message), refresh: () => { refreshes += 1; } },
    windowTarget: target,
  });

  target.dispatch('keydown', { key: 'e', repeat: false, preventDefault: () => { prevented = true; } });

  assert.equal(prevented, true);
  assert.deepEqual(toasts, ['No safe disembark position is available near the transport.']);
  assert.equal(refreshes, 1);
});
