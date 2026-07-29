import assert from 'node:assert/strict';
import test from 'node:test';

import { DOMAIN_EVENT_TYPES, DomainEventStream } from '../../src/core/events.js';

test('emits deterministic tick and sequence ordering', () => {
  const stream = new DomainEventStream();
  stream.setTick(12);
  const first = stream.emit(DOMAIN_EVENT_TYPES.SHOT, { actorId: 7 }, { source: 'combat' });
  const second = stream.emit(DOMAIN_EVENT_TYPES.IMPACT, { targetId: 9 });

  assert.deepEqual(stream.peek(), [first, second]);
  assert.equal(first.tick, 12);
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(first.source, 'combat');
});

test('drain preserves order and empties the buffer', () => {
  const stream = new DomainEventStream();
  stream.emit(DOMAIN_EVENT_TYPES.PRODUCTION, { unitType: 'uaInfantry' });
  stream.emit(DOMAIN_EVENT_TYPES.RESEARCH, { upgradeId: 'thermal' });

  assert.equal(stream.size, 2);
  assert.deepEqual(stream.drain().map((event) => event.type), [
    DOMAIN_EVENT_TYPES.PRODUCTION,
    DOMAIN_EVENT_TYPES.RESEARCH,
  ]);
  assert.equal(stream.size, 0);
});

test('typed and wildcard subscribers receive events synchronously', () => {
  const stream = new DomainEventStream();
  const received = [];
  const unsubscribeTyped = stream.subscribe(DOMAIN_EVENT_TYPES.OBJECTIVE, (event) => received.push(`typed:${event.sequence}`));
  stream.subscribe('*', (event) => received.push(`all:${event.sequence}`));

  stream.emit(DOMAIN_EVENT_TYPES.OBJECTIVE, { objectiveId: 'hold-crossing' });
  unsubscribeTyped();
  stream.emit(DOMAIN_EVENT_TYPES.OBJECTIVE, { objectiveId: 'secure-road' });

  assert.deepEqual(received, ['typed:1', 'all:1', 'all:2']);
});

test('rejects unknown types and invalid event data', () => {
  const stream = new DomainEventStream();
  assert.throws(() => stream.emit('unknown.event'), /Unknown domain event type/);
  assert.throws(() => stream.emit(DOMAIN_EVENT_TYPES.ALERT, []), /payload must be an object/);
  assert.throws(() => stream.setTick(-1), /non-negative integer/);
  assert.throws(() => stream.subscribe(DOMAIN_EVENT_TYPES.AUDIO, null), /listener must be a function/);
});

test('events and payload snapshots are immutable', () => {
  const stream = new DomainEventStream();
  const event = stream.emit(DOMAIN_EVENT_TYPES.TELEMETRY, { metric: 'unit-count', value: 10 });
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.payload), true);
  assert.throws(() => {
    event.payload.value = 11;
  }, TypeError);
});
