import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMBAT_CUE_KINDS,
  COMBAT_CUE_SEVERITIES,
  COMBAT_IMPACT_OUTCOMES,
  COMBAT_READABILITY_VERSION,
  advanceCombatReadability,
  createCombatReadabilitySnapshot,
  createCombatReadabilityState,
  createRangeRingSnapshot,
  createTargetLineSnapshot,
  enqueueCombatCue,
  setDamageNumbersVisible,
} from '../../src/ui/combat-readability.js';

function cue(state, overrides = {}) {
  return enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.IMPACT,
    createdTick: 10,
    position: { x: 40, y: 50 },
    outcome: COMBAT_IMPACT_OUTCOMES.HIT,
    ...overrides,
  });
}

test('creates frozen versioned readability state', () => {
  const state = createCombatReadabilityState();
  assert.equal(state.version, COMBAT_READABILITY_VERSION);
  assert.equal(state.preferences.showDamageNumbers, true);
  assert.deepEqual(state.cues, []);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.preferences), true);
});

test('builds stable selected range rings and target lines', () => {
  const rings = createRangeRingSnapshot([
    { id: 9, x: 90, y: 40, selected: true, range: 200 },
    { id: 2, x: 20, y: 30, selected: true, minRange: 50, maxRange: 300, domain: 'ground' },
    { id: 1, x: 0, y: 0, selected: false, range: 100 },
  ]);
  assert.deepEqual(rings.map((ring) => ring.entityId), [2, 9]);
  assert.equal(rings[0].minRange, 50);
  assert.equal(rings[0].maxRange, 300);

  const lines = createTargetLineSnapshot([
    { sourceId: 7, position: { x: 1, y: 2 }, targetId: 20, targetPosition: { x: 8, y: 9 }, selected: true, command: 'attack' },
    { sourceId: 3, position: { x: 4, y: 5 }, targetPosition: { x: 10, y: 11 }, selected: true },
  ]);
  assert.deepEqual(lines.map((line) => line.sourceId), [3, 7]);
  assert.equal(Object.isFrozen(lines[0]), true);
});

test('orders cues by severity, kind, tick, and sequence', () => {
  let state = createCombatReadabilityState();
  state = cue(state, { severity: COMBAT_CUE_SEVERITIES.INFO });
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.INCOMING,
    createdTick: 11,
    position: { x: 5, y: 6 },
    severity: COMBAT_CUE_SEVERITIES.CRITICAL,
  });
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.ARMOR,
    createdTick: 9,
    position: { x: 7, y: 8 },
    severity: COMBAT_CUE_SEVERITIES.WARNING,
    outcome: COMBAT_IMPACT_OUTCOMES.DEFLECT,
  });
  const snapshot = createCombatReadabilitySnapshot({ state, currentTick: 12 });
  assert.deepEqual(snapshot.cues.map((item) => item.kind), ['incoming', 'armor', 'impact']);
  assert.ok(snapshot.cues.every((item) => item.remainingTicks > 0));
});

test('expires cues on deterministic tick boundaries', () => {
  const state = cue(createCombatReadabilityState(), { durationTicks: 5 });
  assert.equal(advanceCombatReadability(state, 14).cues.length, 1);
  assert.equal(advanceCombatReadability(state, 15).cues.length, 0);
});

test('deduplicates repeated incoming alerts by authored key', () => {
  let state = createCombatReadabilityState();
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.INCOMING,
    createdTick: 1,
    position: { x: 0, y: 0 },
    dedupeKey: 'target-4-shell',
    text: 'Incoming shell',
  });
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.INCOMING,
    createdTick: 2,
    position: { x: 1, y: 1 },
    dedupeKey: 'target-4-shell',
    text: 'Incoming shell updated',
  });
  assert.equal(state.cues.length, 1);
  assert.equal(state.cues[0].createdTick, 2);
  assert.equal(state.cues[0].text, 'Incoming shell updated');
});

test('damage-number preference suppresses and removes damage cues', () => {
  let state = createCombatReadabilityState();
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.DAMAGE,
    createdTick: 3,
    position: { x: 10, y: 20 },
    value: 42,
  });
  assert.equal(state.cues.length, 1);
  state = setDamageNumbersVisible(state, false);
  assert.equal(state.cues.length, 0);
  const unchanged = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.DAMAGE,
    createdTick: 4,
    position: { x: 10, y: 20 },
    value: 9,
  });
  assert.deepEqual(unchanged, state);
});

test('supports status, armor, miss, and deflect cues with strict outcomes', () => {
  let state = createCombatReadabilityState();
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.STATUS,
    createdTick: 1,
    position: { x: 1, y: 2 },
    targetId: 4,
    severity: COMBAT_CUE_SEVERITIES.WARNING,
    text: 'Pinned',
  });
  state = enqueueCombatCue(state, {
    kind: COMBAT_CUE_KINDS.ARMOR,
    createdTick: 2,
    position: { x: 3, y: 4 },
    targetId: 4,
    outcome: COMBAT_IMPACT_OUTCOMES.DEFLECT,
  });
  state = cue(state, { createdTick: 3, outcome: COMBAT_IMPACT_OUTCOMES.MISS });
  assert.deepEqual(state.cues.map((item) => item.kind), ['status', 'armor', 'impact']);
  assert.throws(
    () => cue(state, { outcome: 'ricochet' }),
    /Unknown combat impact outcome/,
  );
});

test('bounds transient cues by retaining the newest sequences', () => {
  let state = createCombatReadabilityState({ preferences: { showDamageNumbers: true, maxTransientCues: 3 } });
  for (let index = 0; index < 5; index += 1) {
    state = cue(state, { createdTick: index, position: { x: index, y: index } });
  }
  assert.equal(state.cues.length, 3);
  assert.deepEqual(state.cues.map((item) => item.sequence), [3, 4, 5]);
});

test('rejects invalid geometry, ranges, values, and preferences', () => {
  assert.throws(
    () => createRangeRingSnapshot([{ id: 1, x: 0, y: 0, selected: true, minRange: 20, maxRange: 10 }]),
    /minRange must not exceed/,
  );
  assert.throws(
    () => enqueueCombatCue(createCombatReadabilityState(), {
      kind: COMBAT_CUE_KINDS.DAMAGE,
      createdTick: 0,
      position: { x: 0, y: 0 },
      value: 0,
    }),
    /positive value/,
  );
  assert.throws(() => setDamageNumbersVisible(createCombatReadabilityState(), 'yes'), /must be a boolean/);
});
