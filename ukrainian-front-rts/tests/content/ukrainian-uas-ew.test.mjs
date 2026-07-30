import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UKRAINIAN_UAS_EW,
  UAS_EW_CAPABILITIES,
  resolveUasEwTaskGroup,
  validateUkrainianUasEw,
} from '../../src/content/ukrainian-uas-ew.js';

test('Ukrainian UAS/EW contract is valid and immutable', () => {
  assert.deepEqual(validateUkrainianUasEw(), []);
  assert.equal(Object.isFrozen(UKRAINIAN_UAS_EW), true);
  assert.equal(Object.isFrozen(UKRAINIAN_UAS_EW.profiles[0]), true);
});

test('covers every required UAS/EW capability', () => {
  const covered = new Set(UKRAINIAN_UAS_EW.profiles.flatMap((item) => item.capabilities));
  assert.deepEqual([...covered].sort(), [...UAS_EW_CAPABILITIES].sort());
});

test('preserves UFR-070 roster anchors and producer identities', () => {
  const ids = new Set(UKRAINIAN_UAS_EW.profiles.map((item) => item.id));
  assert.equal(ids.has('ua.recon-drone'), true);
  assert.equal(ids.has('ua.ew-team'), true);
  assert.equal(UKRAINIAN_UAS_EW.profiles.every((item) => item.producer.startsWith('ua.')), true);
});

test('task group resolution is stable and reports locked profiles', () => {
  const unlocked = ['ua.uas-ew-cell', 'ua.recon-drone', 'ua.shared-target-network'];
  const result = resolveUasEwTaskGroup(['ua.recon-drone', 'ua.fpv-strike-team', 'ua.relay-drone'], unlocked);
  assert.deepEqual(result.profileIds, ['ua.recon-drone', 'ua.fpv-strike-team']);
  assert.deepEqual(result.rejected, [{
    id: 'ua.relay-drone',
    reason: 'missing-requirements',
    missing: ['ua.spectrum-agility'],
  }]);
  assert.deepEqual(result.cost, { manpower: 54, materiel: 155, command: 2 });
  assert.equal(result.networkResilience, 0.16);
});

test('unknown profiles are rejected without changing valid order', () => {
  const result = resolveUasEwTaskGroup(['ua.unknown', 'ua.recon-drone'], ['ua.uas-ew-cell']);
  assert.deepEqual(result.profileIds, ['ua.recon-drone']);
  assert.deepEqual(result.rejected, [{ id: 'ua.unknown', reason: 'unknown-profile' }]);
});

test('validator returns actionable capability and ownership errors', () => {
  const broken = structuredClone(UKRAINIAN_UAS_EW);
  broken.profiles[0].faction = 'russia';
  broken.profiles[0].capabilities = ['invalid-capability'];
  const errors = validateUkrainianUasEw(broken);
  assert.equal(errors.includes('ua.recon-drone: invalid ownership'), true);
  assert.equal(errors.includes('ua.recon-drone: invalid capability invalid-capability'), true);
  assert.equal(errors.includes('missing capability reconnaissance'), true);
});
