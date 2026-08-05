import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCESSIBILITY_REBINDABLE_KEYS } from '../../src/audio/accessibility-settings-ui.js';
import { normalizeInputKey } from '../../src/input/action-map.js';

test('rebinding catalog covers standard non-modifier keyboard families without duplicates', () => {
  assert.equal(new Set(ACCESSIBILITY_REBINDABLE_KEYS).size, ACCESSIBILITY_REBINDABLE_KEYS.length);
  for (const key of ['a', 'z', '0', '9', 'f1', 'f12', 'arrowup', 'arrowright', 'space', 'escape', 'tab', 'enter', 'delete', 'home', 'pagedown', '-', '[', ';', '/', '\\', '`']) {
    assert.ok(ACCESSIBILITY_REBINDABLE_KEYS.includes(key), key);
  }
  assert.ok(ACCESSIBILITY_REBINDABLE_KEYS.length >= 65);
  assert.equal(normalizeInputKey(' '), 'space');
  assert.equal(normalizeInputKey('Spacebar'), 'space');
  assert.equal(normalizeInputKey('F12'), 'f12');
});
