import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChasePolicy, scoreTarget, selectTarget } from '../../src/combat/target-policy.js';

const base = { visible: true, destroyed: false, friendly: false, distance: 10, threat: 0.5, damagePotential: 0.5, health: 100, maxHealth: 100 };

test('profile weights favor intended target domains', () => {
  const infantry = scoreTarget({ ...base, id: 'i', domain: 'infantry' }, { profile: 'antiInfantry', maxRange: 20 });
  const armor = scoreTarget({ ...base, id: 'a', domain: 'armor' }, { profile: 'antiInfantry', maxRange: 20 });
  assert.ok(infantry > armor);
});

test('ineligible targets are rejected', () => {
  assert.equal(scoreTarget({ ...base, id: 'x', domain: 'infantry', visible: false }, { maxRange: 20 }), Number.NEGATIVE_INFINITY);
});

test('retaliation bonus can break a close score', () => {
  const selected = selectTarget([
    { ...base, id: 'a', domain: 'infantry' },
    { ...base, id: 'b', domain: 'infantry' },
  ], { maxRange: 20, lastAttackerId: 'b', retaliationBonus: 1 });
  assert.equal(selected.id, 'b');
});

test('tie breaking is deterministic by id', () => {
  const selected = selectTarget([
    { ...base, id: 'b', domain: 'vehicle' },
    { ...base, id: 'a', domain: 'vehicle' },
  ], { maxRange: 20 });
  assert.equal(selected.id, 'a');
});

test('closer targets receive a distance advantage', () => {
  const near = scoreTarget({ ...base, id: 'n', domain: 'vehicle', distance: 5 }, { maxRange: 20 });
  const far = scoreTarget({ ...base, id: 'f', domain: 'vehicle', distance: 20 }, { maxRange: 20 });
  assert.ok(near > far);
});

test('no-chase stance acquires without pursuing', () => {
  assert.deepEqual(resolveChasePolicy({ stance: 'no-chase', targetInRange: false, originDistance: 2, leashDistance: 10 }), { acquire: true, chase: false, reason: 'stance' });
});

test('leash prevents acquisition beyond the allowed distance', () => {
  assert.deepEqual(resolveChasePolicy({ stance: 'defensive', targetInRange: false, originDistance: 11, leashDistance: 10 }), { acquire: false, chase: false, reason: 'leash-exceeded' });
});
