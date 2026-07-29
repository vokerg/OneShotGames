import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCoverToAttack,
  COVER_TYPES,
  CONCEALMENT_TYPES,
  profileForTerrain,
  resolveCoverModifiers,
} from '../../src/combat/cover-concealment.js';

test('open terrain has no defensive modifiers', () => {
  assert.deepEqual(profileForTerrain('open'), { cover: 'none', concealment: 'none' });
  const result = resolveCoverModifiers({ terrain: 'open' });
  assert.equal(result.accuracyMultiplier, 1);
  assert.equal(result.damageMultiplier, 1);
});

test('rubble combines heavy cover with partial concealment', () => {
  const result = resolveCoverModifiers({ terrain: 'rubble' });
  assert.equal(result.cover, COVER_TYPES.HEAVY);
  assert.equal(result.concealment, CONCEALMENT_TYPES.PARTIAL);
  assert.equal(result.accuracyMultiplier, 0.68 * 0.88);
  assert.equal(result.damageMultiplier, 0.75);
});

test('explicit profiles override terrain defaults', () => {
  const result = resolveCoverModifiers({
    terrain: 'open',
    cover: COVER_TYPES.FORTIFIED,
    concealment: CONCEALMENT_TYPES.DENSE,
  });
  assert.equal(result.accuracyMultiplier, 0.55 * 0.72);
  assert.equal(result.damageMultiplier, 0.6);
});

test('ignore flags remove only the corresponding protection', () => {
  const coverIgnored = resolveCoverModifiers({ terrain: 'trench', ignoresCover: true });
  assert.equal(coverIgnored.damageMultiplier, 1);
  assert.equal(coverIgnored.accuracyMultiplier, 0.88);
  const concealmentIgnored = resolveCoverModifiers({ terrain: 'trench', ignoresConcealment: true });
  assert.equal(concealmentIgnored.accuracyMultiplier, 0.55);
});

test('attack application is deterministic and preserves feedback', () => {
  const result = applyCoverToAttack({ accuracy: 0.8, damage: 40, terrain: 'shelterbelt' });
  assert.equal(result.accuracy, 0.8 * 0.85 * 0.72);
  assert.equal(result.damage, 36);
  assert.equal(result.modifiers.feedback.protected, true);
  assert.equal(result.modifiers.feedback.concealed, true);
});

test('unknown explicit profile is rejected', () => {
  assert.throws(() => resolveCoverModifiers({ cover: 'bunker-wall' }), /Unknown cover type/);
});

test('invalid attack values are rejected', () => {
  assert.throws(() => applyCoverToAttack({ accuracy: -1 }), /Accuracy/);
  assert.throws(() => applyCoverToAttack({ damage: Number.NaN }), /Damage/);
});
