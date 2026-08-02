import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStableContentOwnership,
  DECLARATIVE_CONTENT_FAMILIES,
  validateStableContentOwnership,
} from '../../src/content/runtime-content-ownership.js';

test('merged UFR-071 through UFR-078 families have exclusive stable ID ownership', () => {
  assert.deepEqual(validateStableContentOwnership(), []);
  const snapshot = assertStableContentOwnership();
  assert.equal(snapshot.familyCount, 8);
  assert.ok(snapshot.stableIdCount > 40);
});

test('duplicate stable IDs are rejected across content families', () => {
  const families = [
    { owner: 'family-a', ids: ['ua.example', 'ua.unique'] },
    { owner: 'family-b', ids: ['ua.example'] },
  ];

  assert.deepEqual(
    validateStableContentOwnership(families),
    ['ua.example: redefined by family-a, family-b'],
  );
  assert.throws(
    () => assertStableContentOwnership(families),
    /ua\.example: redefined by family-a, family-b/,
  );
});

test('the ownership manifest remains immutable', () => {
  assert.equal(Object.isFrozen(DECLARATIVE_CONTENT_FAMILIES), true);
  assert.equal(Object.isFrozen(DECLARATIVE_CONTENT_FAMILIES[0]), true);
  assert.throws(() => DECLARATIVE_CONTENT_FAMILIES.push({ owner: 'extra', ids: [] }), TypeError);
});
