import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquireBrowserCapability,
  acquireBrowserStorage,
} from '../../src/app/browser-capabilities.js';

test('returns available browser capabilities unchanged', () => {
  const capability = { ready: true };
  assert.equal(acquireBrowserCapability(() => capability), capability);
});

test('degrades to the configured fallback when acquisition throws', () => {
  const fallback = { safe: true };
  assert.equal(
    acquireBrowserCapability(() => {
      throw new Error('restricted capability');
    }, fallback),
    fallback,
  );
});

test('acquires usable local storage without aborting on restricted getters', () => {
  const storage = {
    length: 0,
    getItem() { return null; },
    setItem() {},
  };
  assert.equal(acquireBrowserStorage({ localStorage: storage }), storage);

  const restricted = {};
  Object.defineProperty(restricted, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(acquireBrowserStorage(restricted), null);
});
