import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UKRAINIAN_INFANTRY_BRANCH,
  validateUkrainianInfantryBranch,
} from '../../src/content/ukrainian-infantry.js';

test('validator reports malformed nested collections instead of throwing', () => {
  const invalid = structuredClone(UKRAINIAN_INFANTRY_BRANCH);
  invalid.units[0].weapons = {};
  invalid.units[1].capabilities = {};
  invalid.units[2].supportLinks = {};
  invalid.units[3].counterDomains = {};
  invalid.units[4].vulnerabilityDomains = {};
  invalid.units[5].weapons = [null];

  let errors;
  assert.doesNotThrow(() => {
    errors = validateUkrainianInfantryBranch(invalid);
  });
  assert.ok(errors.some((error) => error.includes('weapons must be an array')));
  assert.ok(errors.some((error) => error.includes('capabilities must be an array')));
  assert.ok(errors.some((error) => error.includes('supportLinks must be an array')));
  assert.ok(errors.some((error) => error.includes('counterDomains must be an array')));
  assert.ok(errors.some((error) => error.includes('vulnerabilityDomains must be an array')));
  assert.ok(errors.some((error) => error.includes('weapons[0] must be an object')));
  assert.equal(Object.isFrozen(errors), true);
});
