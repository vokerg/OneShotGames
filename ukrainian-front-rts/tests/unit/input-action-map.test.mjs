import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createKeyBindings,
  DEFAULT_KEY_BINDINGS,
  INPUT_ACTIONS,
  isHeldInputAction,
  normalizeInputKey,
  resolveInputAction,
} from '../../src/input/action-map.js';

test('default bindings resolve movement and command keys to named actions', () => {
  const bindings = createKeyBindings();

  assert.equal(resolveInputAction(bindings, 'W'), INPUT_ACTIONS.CAMERA_UP);
  assert.equal(resolveInputAction(bindings, 'ArrowLeft'), INPUT_ACTIONS.CAMERA_LEFT);
  assert.equal(resolveInputAction(bindings, 'q'), INPUT_ACTIONS.ATTACK_MOVE);
  assert.equal(resolveInputAction(bindings, 'T'), INPUT_ACTIONS.TOGGLE_AUTO_FIRE);
});

test('binding overrides can rebind and unbind physical keys without mutating defaults', () => {
  const bindings = createKeyBindings({
    i: INPUT_ACTIONS.CAMERA_UP,
    w: null,
    q: INPUT_ACTIONS.STOP,
  });

  assert.equal(resolveInputAction(bindings, 'i'), INPUT_ACTIONS.CAMERA_UP);
  assert.equal(resolveInputAction(bindings, 'w'), null);
  assert.equal(resolveInputAction(bindings, 'q'), INPUT_ACTIONS.STOP);
  assert.equal(DEFAULT_KEY_BINDINGS.w, INPUT_ACTIONS.CAMERA_UP);
  assert.equal(DEFAULT_KEY_BINDINGS.q, INPUT_ACTIONS.ATTACK_MOVE);
});

test('key normalization and held-action classification are deterministic', () => {
  assert.equal(normalizeInputKey(' ArrowUp '), 'arrowup');
  assert.equal(normalizeInputKey(null), '');
  assert.equal(isHeldInputAction(INPUT_ACTIONS.CAMERA_RIGHT), true);
  assert.equal(isHeldInputAction(INPUT_ACTIONS.CANCEL), false);
});
