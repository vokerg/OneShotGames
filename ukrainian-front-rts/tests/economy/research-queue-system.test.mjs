import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESEARCH_CONTENTION_POLICIES,
  RESEARCH_EVENT_TYPES,
  RESEARCH_ITEM_STATUSES,
  cancelResearch,
  createResearchDefinition,
  createResearchQueueState,
  describeResearchQueue,
  queueResearch,
  resolveResearchContention,
  setResearchPaused,
  totalResearchRefund,
  updateResearchQueue,
  validateResearchRequest,
} from '../../src/systems/research-queue-system.js';

const doctrine = (overrides = {}) => createResearchDefinition({
  id: 'combined-arms-doctrine',
  name: 'Combined Arms Doctrine',
  researchTime: 10,
  cost: { metal: 100, fuel: 40 },
  ...overrides,
});

function funded() {
  return { availableResources: { metal: 1000, fuel: 1000, intel: 1000 } };
}

test('definitions and queue state normalize deterministically and freeze deeply', () => {
  const definition = createResearchDefinition({
    id: ' doctrine ',
    researchTime: 12,
    cost: { metal: 50, fuel: 0, intel: 20 },
    requires: ['b', 'a', 'b'],
  });
  const state = createResearchQueueState({
    facilityId: ' hq ',
    completedTechIds: ['root-b', 'root-a', 'root-b'],
  });

  assert.deepEqual(definition, {
    id: 'doctrine',
    name: 'doctrine',
    researchTime: 12,
    cost: { intel: 20, metal: 50 },
    requires: ['a', 'b'],
    exclusiveGroup: null,
  });
  assert.deepEqual(state.completedTechIds, ['root-a', 'root-b']);
  assert.equal(state.facilityId, 'hq');
  assert.ok(Object.isFrozen(definition.cost));
  assert.ok(Object.isFrozen(state));
});

test('queueing charges resources and emits a reference-free descriptor', () => {
  const state = createResearchQueueState({ facilityId: 'hq' });
  const result = queueResearch(state, doctrine(), funded());

  assert.equal(result.ok, true);
  assert.deepEqual(result.charged, { fuel: 40, metal: 100 });
  assert.equal(result.state.queue[0].id, 'hq:research:1');
  assert.equal(result.event.type, RESEARCH_EVENT_TYPES.QUEUED);
  assert.deepEqual(result.event, {
    version: 1,
    type: 'researchQueued',
    facilityId: 'hq',
    itemId: 'hq:research:1',
    techId: 'combined-arms-doctrine',
    sequence: 1,
  });
  assert.equal(state.queue.length, 0);
});

test('request validation rejects missing prerequisites, duplicates, completion, exclusivity, funds, and full queues', () => {
  const base = createResearchQueueState({ facilityId: 'hq' });
  const prerequisite = doctrine({ requires: ['field-command'] });
  assert.equal(validateResearchRequest(base, prerequisite, funded()).reason, 'Research prerequisites are incomplete.');
  assert.equal(validateResearchRequest(base, doctrine(), { availableResources: { metal: 99, fuel: 40 } }).reason, 'Insufficient resources for research.');

  const queued = queueResearch(base, doctrine(), funded()).state;
  assert.equal(validateResearchRequest(queued, doctrine(), funded()).reason, 'Technology is already queued.');

  const complete = updateResearchQueue(queued, 10).state;
  assert.equal(validateResearchRequest(complete, doctrine(), funded()).reason, 'Technology is already researched.');

  const exclusive = createResearchQueueState({
    facilityId: 'hq',
    exclusiveSelections: { doctrine: 'defensive-doctrine' },
  });
  assert.equal(
    validateResearchRequest(exclusive, doctrine({ exclusiveGroup: 'doctrine' }), funded()).reason,
    'A mutually exclusive technology has already been selected.',
  );

  const oneSlot = createResearchQueueState({ facilityId: 'hq', maxQueueLength: 1 });
  const full = queueResearch(oneSlot, doctrine(), funded()).state;
  assert.equal(validateResearchRequest(full, doctrine({ id: 'other' }), funded()).reason, 'Research queue is full.');
});

test('fixed-step progress carries overflow across multiple queued technologies', () => {
  let state = createResearchQueueState({ facilityId: 'academy' });
  state = queueResearch(state, doctrine({ id: 'first', researchTime: 2 }), funded()).state;
  state = queueResearch(state, doctrine({ id: 'second', researchTime: 3 }), funded()).state;
  const result = updateResearchQueue(state, 4);

  assert.deepEqual(result.completedTechIds, ['first']);
  assert.equal(result.state.queue.length, 1);
  assert.equal(result.state.queue[0].techId, 'second');
  assert.equal(result.state.queue[0].remaining, 1);
  assert.equal(result.consumedSeconds, 4);
  assert.equal(result.unusedSeconds, 0);
  assert.deepEqual(result.events.map((entry) => entry.type), [
    RESEARCH_EVENT_TYPES.STARTED,
    RESEARCH_EVENT_TYPES.COMPLETED,
    RESEARCH_EVENT_TYPES.STARTED,
  ]);
});

test('completion records mutually exclusive selections and leaves unused time explicit', () => {
  let state = createResearchQueueState({ facilityId: 'academy' });
  state = queueResearch(state, doctrine({ researchTime: 2, exclusiveGroup: 'doctrine' }), funded()).state;
  const result = updateResearchQueue(state, 5);

  assert.deepEqual(result.state.completedTechIds, ['combined-arms-doctrine']);
  assert.deepEqual(result.state.exclusiveSelections, { doctrine: 'combined-arms-doctrine' });
  assert.equal(result.unusedSeconds, 3);
  assert.equal(result.events.at(-1).type, RESEARCH_EVENT_TYPES.COMPLETED);
});

test('queued cancellation refunds fully while active cancellation refunds remaining value', () => {
  let state = createResearchQueueState({ facilityId: 'hq' });
  state = queueResearch(state, doctrine(), funded()).state;
  state = queueResearch(state, doctrine({ id: 'queued', cost: { metal: 30 }, researchTime: 4 }), funded()).state;

  const active = updateResearchQueue(state, 2.5).state;
  const activeCancel = cancelResearch(active, active.queue[0].id);
  assert.equal(activeCancel.refundFraction, 0.75);
  assert.deepEqual(activeCancel.refunded, { fuel: 30, metal: 75 });

  const queuedCancel = cancelResearch(activeCancel.state, activeCancel.state.queue[0].id);
  assert.equal(queuedCancel.refundFraction, 1);
  assert.deepEqual(queuedCancel.refunded, { metal: 30 });
  assert.equal(queuedCancel.event.type, RESEARCH_EVENT_TYPES.CANCELLED);
});

test('manual pause preserves progress and exposes paused UI state', () => {
  let state = createResearchQueueState({ facilityId: 'hq' });
  state = queueResearch(state, doctrine(), funded()).state;
  state = updateResearchQueue(state, 2).state;
  state = setResearchPaused(state, true).state;
  const result = updateResearchQueue(state, 5);
  const view = describeResearchQueue(result.state);

  assert.equal(result.consumedSeconds, 0);
  assert.equal(result.state.queue[0].remaining, 8);
  assert.equal(view.active.status, RESEARCH_ITEM_STATUSES.PAUSED);
  assert.equal(view.blockedReason, 'Research is paused.');
});

test('research-pauses contention gives production priority', () => {
  let state = createResearchQueueState({
    facilityId: 'factory',
    contentionPolicy: RESEARCH_CONTENTION_POLICIES.RESEARCH_PAUSES,
  });
  state = queueResearch(state, doctrine(), funded()).state;
  const result = updateResearchQueue(state, 3, { productionBusy: true });

  assert.equal(result.state.queue[0].remaining, 10);
  assert.equal(result.productionBlocked, false);
  assert.equal(result.blockedReason, 'Production is using this facility.');
});

test('production-pauses contention advances research and returns a production block directive', () => {
  let state = createResearchQueueState({
    facilityId: 'factory',
    contentionPolicy: RESEARCH_CONTENTION_POLICIES.PRODUCTION_PAUSES,
  });
  state = queueResearch(state, doctrine(), funded()).state;
  const result = updateResearchQueue(state, 3, { productionBusy: true });

  assert.equal(result.state.queue[0].remaining, 7);
  assert.equal(result.productionBlocked, true);
  assert.equal(resolveResearchContention(state, { productionBusy: true }).reason, 'Research is using this facility.');
});

test('parallel contention advances without blocking production', () => {
  let state = createResearchQueueState({
    facilityId: 'lab',
    contentionPolicy: RESEARCH_CONTENTION_POLICIES.PARALLEL,
  });
  state = queueResearch(state, doctrine(), funded()).state;
  const result = updateResearchQueue(state, 3, { productionBusy: true });

  assert.equal(result.state.queue[0].remaining, 7);
  assert.equal(result.productionBlocked, false);
  assert.equal(result.blockedReason, '');
});

test('progress descriptors are immutable, stable, and UI-ready', () => {
  let state = createResearchQueueState({ facilityId: 'hq' });
  state = queueResearch(state, doctrine(), funded()).state;
  state = queueResearch(state, doctrine({ id: 'follow-up', researchTime: 5 }), funded()).state;
  state = updateResearchQueue(state, 2.55).state;
  const view = describeResearchQueue(state);

  assert.equal(view.active.progress, 0.255);
  assert.equal(view.active.percent, 25);
  assert.equal(view.active.status, RESEARCH_ITEM_STATUSES.ACTIVE);
  assert.equal(view.items[1].status, RESEARCH_ITEM_STATUSES.QUEUED);
  assert.ok(Object.isFrozen(view.items));
  assert.ok(Object.isFrozen(view.active));
});

test('total refund summarizes deterministic cancellation value and invalid elapsed time fails', () => {
  let state = createResearchQueueState({ facilityId: 'hq' });
  state = queueResearch(state, doctrine(), funded()).state;
  state = queueResearch(state, doctrine({ id: 'second', cost: { metal: 25 }, researchTime: 5 }), funded()).state;
  state = updateResearchQueue(state, 5).state;

  assert.deepEqual(totalResearchRefund(state), { fuel: 20, metal: 75 });
  assert.throws(() => updateResearchQueue(state, -1), /non-negative finite/);
  assert.throws(() => createResearchQueueState({ facilityId: 'hq', contentionPolicy: 'unknown' }), /Unknown/);
});
