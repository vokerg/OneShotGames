import test from 'node:test';
import assert from 'node:assert/strict';

import { validateTaskMarkerState } from '../../scripts/lib/task-marker-state.mjs';

test('active checked-in claim marker is valid when exactly one open PR owns it', () => {
  assert.deepEqual(validateTaskMarkerState({
    claimIds: ['UFR-154'],
    completedIds: [],
    activeClaimCounts: { 'UFR-154': 1 },
  }), []);
});

test('default branch cannot retain an active claim marker', () => {
  assert.deepEqual(validateTaskMarkerState({
    claimIds: ['UFR-154'],
    completedIds: [],
    activeClaimCounts: { 'UFR-154': 1 },
    forbidCheckedInClaims: true,
  }), [
    'default branch contains active claim marker(s): UFR-154',
  ]);
});

test('orphaned checked-in claim marker fails closed', () => {
  assert.deepEqual(validateTaskMarkerState({
    claimIds: ['UFR-154'],
    completedIds: [],
    activeClaimCounts: {},
  }), [
    'UFR-154 has a checked-in claim marker but no matching open PR title claim',
  ]);
});

test('claim and completion markers cannot coexist for one task', () => {
  assert.deepEqual(validateTaskMarkerState({
    claimIds: ['ufr-154'],
    completedIds: ['UFR-154'],
    activeClaimCounts: { 'UFR-154': 1 },
  }), [
    'UFR-154 exists in both tasks/claims and tasks/completed',
  ]);
});

test('checked-in claim marker rejects duplicate open PR ownership', () => {
  assert.deepEqual(validateTaskMarkerState({
    claimIds: ['UFR-154'],
    completedIds: [],
    activeClaimCounts: new Map([['UFR-154', 2]]),
  }), [
    'UFR-154 has a checked-in claim marker but 2 matching open PR title claims',
  ]);
});
