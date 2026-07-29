import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainEventStream } from '../../src/core/events.js';
import { MORALE_STATES, applySuppression, createSuppressionStatus, emitStatusTransition, recoverSuppression, resolveMoraleState, setCommandAura } from '../../src/status/suppression-morale.js';

test('resolves ordered morale thresholds deterministically', () => {
  assert.equal(resolveMoraleState(0), MORALE_STATES.STEADY);
  assert.equal(resolveMoraleState(35), MORALE_STATES.SHAKEN);
  assert.equal(resolveMoraleState(60), MORALE_STATES.PINNED);
  assert.equal(resolveMoraleState(90), MORALE_STATES.BROKEN);
});

test('accumulates and clamps suppression', () => {
  const result = applySuppression(createSuppressionStatus({ unitId: 'alpha' }), 140);
  assert.equal(result.current.suppression, 100);
  assert.equal(result.current.morale, MORALE_STATES.BROKEN);
});

test('reports pinned entry and order restrictions', () => {
  const result = applySuppression(createSuppressionStatus({ unitId: 'alpha', suppression: 40 }), 25);
  assert.equal(result.enteredPinned, true);
  assert.equal(result.orderRestrictions.canAdvance, false);
  assert.equal(result.orderRestrictions.canRetreat, true);
});

test('recovers suppression according to elapsed seconds', () => {
  const result = recoverSuppression(createSuppressionStatus({ unitId: 'alpha', suppression: 70 }), 2);
  assert.equal(result.current.suppression, 58);
  assert.equal(result.current.morale, MORALE_STATES.SHAKEN);
});

test('command aura raises thresholds and accelerates recovery', () => {
  const aura = setCommandAura(createSuppressionStatus({ unitId: 'alpha', suppression: 65 }), true);
  assert.equal(aura.current.morale, MORALE_STATES.SHAKEN);
  assert.equal(recoverSuppression(aura.current, 2).current.suppression, 47);
});

test('no-op recovery is reported without emitting an event', () => {
  const stream = createDomainEventStream();
  const result = recoverSuppression(createSuppressionStatus({ unitId: 'alpha' }), 2);
  assert.equal(result.changed, false);
  assert.equal(emitStatusTransition(stream, result), null);
  assert.equal(stream.size, 0);
});

test('emits immutable status transition data through the domain stream', () => {
  const stream = createDomainEventStream();
  const event = emitStatusTransition(stream, applySuppression(createSuppressionStatus({ unitId: 'alpha' }), 65), { tick: 12 });
  assert.equal(event.tick, 12);
  assert.equal(event.payload.category, 'unit-status');
  assert.equal(event.payload.morale, MORALE_STATES.PINNED);
  assert.equal(Object.isFrozen(event.payload), true);
});
