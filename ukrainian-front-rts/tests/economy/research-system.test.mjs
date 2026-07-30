import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESEARCH_CONTENTION_POLICIES,
  RESEARCH_RESULTS,
  cancelResearch,
  createResearchProfile,
  createResearchState,
  enqueueResearch,
  researchProgressSnapshot,
  setResearchPaused,
  tickResearch,
} from '../../src/systems/research-system.js';

const profile = (id, overrides = {}) => createResearchProfile({
  id,
  label: id.toUpperCase(),
  duration: 10,
  cost: { metal: 100, intel: 20 },
  ...overrides,
});

const queue = (state, tech, overrides = {}) => enqueueResearch(state, tech, {
  facilityId: 'lab-a',
  faction: 'ukraine',
  missionId: 'mission-1',
  availableResources: { metal: 1000, fuel: 1000, intel: 1000 },
  ...overrides,
});

test('creates immutable validated profiles and research state', () => {
  const tech = profile('armor-1', { requires: ['root'], factions: ['ukraine'] });
  const state = createResearchState({ completedTechIds: ['root'] });
  assert.equal(tech.duration, 10);
  assert.deepEqual(tech.requires, ['root']);
  assert.deepEqual(state.completedTechIds, ['root']);
  assert.ok(Object.isFrozen(tech));
  assert.ok(Object.isFrozen(state));
  assert.throws(() => createResearchProfile({ id: '', duration: 1 }), /stable/);
  assert.throws(() => createResearchState({ contentionPolicy: 'bogus' }), /Unknown/);
});

test('queues deterministically and emits a payment record without mutating resources', () => {
  const resources = { metal: 200, intel: 50 };
  const result = enqueueResearch(createResearchState(), profile('armor-1'), {
    facilityId: 'lab-b',
    availableResources: resources,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, RESEARCH_RESULTS.QUEUED);
  assert.equal(result.item.id, 'research:1');
  assert.deepEqual(result.payment, { intel: 20, metal: 100 });
  assert.deepEqual(resources, { metal: 200, intel: 50 });
  assert.deepEqual(Object.keys(result.state.queues), ['lab-b']);
});

test('validates prerequisites, faction, mission availability, and resources', () => {
  const tech = profile('advanced', {
    requires: ['root'],
    factions: ['ukraine'],
    missionLocks: ['mission-2'],
  });
  const state = createResearchState();
  assert.equal(queue(state, tech).status, RESEARCH_RESULTS.PREREQUISITE_MISSING);
  const withRoot = createResearchState({ completedTechIds: ['root'] });
  assert.equal(queue(withRoot, tech, { faction: 'russia' }).status, RESEARCH_RESULTS.FACTION_LOCKED);
  assert.equal(queue(withRoot, tech, { missionId: 'mission-2' }).status, RESEARCH_RESULTS.MISSION_LOCKED);
  assert.equal(queue(withRoot, tech, { lockedTechIds: ['advanced'] }).status, RESEARCH_RESULTS.MISSION_LOCKED);
  assert.equal(queue(withRoot, tech, { availableResources: { metal: 10, intel: 0 } }).status, RESEARCH_RESULTS.INSUFFICIENT_RESOURCES);
});

test('rejects completed, duplicate queued, and mutually exclusive technology', () => {
  const completed = createResearchState({ completedTechIds: ['done'] });
  assert.equal(queue(completed, profile('done')).status, RESEARCH_RESULTS.ALREADY_COMPLETED);

  const first = queue(createResearchState(), profile('choice-a', { exclusiveGroup: 'doctrine' })).state;
  assert.equal(queue(first, profile('choice-a')).status, RESEARCH_RESULTS.ALREADY_QUEUED);
  assert.equal(queue(first, profile('choice-b', { exclusiveGroup: 'doctrine' })).status, RESEARCH_RESULTS.EXCLUSIVE_CONFLICT);

  const completedChoice = tickResearch(first, 10).state;
  assert.equal(queue(completedChoice, profile('choice-b', { exclusiveGroup: 'doctrine' })).status, RESEARCH_RESULTS.EXCLUSIVE_CONFLICT);
});

test('maintains independent stable queues per facility', () => {
  let state = createResearchState();
  state = queue(state, profile('a')).state;
  state = queue(state, profile('b'), { facilityId: 'lab-b' }).state;
  state = queue(state, profile('c')).state;
  assert.deepEqual(state.queues['lab-a'].map((item) => item.techId), ['a', 'c']);
  assert.deepEqual(state.queues['lab-b'].map((item) => item.techId), ['b']);
  assert.deepEqual(state.queues['lab-a'].map((item) => item.id), ['research:1', 'research:3']);
});

test('production-priority pauses research only at busy facilities', () => {
  let state = createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.PRODUCTION_PRIORITY });
  state = queue(state, profile('a')).state;
  state = queue(state, profile('b'), { facilityId: 'lab-b' }).state;
  const result = tickResearch(state, 4, { productionActiveByFacility: { 'lab-a': true } });
  assert.equal(result.state.queues['lab-a'][0].remaining, 10);
  assert.equal(result.state.queues['lab-b'][0].remaining, 6);
  assert.deepEqual(result.contention.pausedResearchFacilityIds, ['lab-a']);
});

test('research-priority advances and explicitly blocks production', () => {
  let state = createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.RESEARCH_PRIORITY });
  state = queue(state, profile('a')).state;
  const result = tickResearch(state, 3, { productionActiveByFacility: { 'lab-a': true } });
  assert.equal(result.state.queues['lab-a'][0].remaining, 7);
  assert.deepEqual(result.contention.blockedProductionFacilityIds, ['lab-a']);
});

test('independent contention advances alongside production', () => {
  let state = createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.INDEPENDENT });
  state = queue(state, profile('a')).state;
  const result = tickResearch(state, 3, { productionActiveByFacility: { 'lab-a': true } });
  assert.equal(result.state.queues['lab-a'][0].remaining, 7);
  assert.deepEqual(result.contention.blockedProductionFacilityIds, []);
  assert.deepEqual(result.contention.pausedResearchFacilityIds, []);
});

test('completes multiple queued items deterministically and emits typed events', () => {
  let state = createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.INDEPENDENT });
  state = queue(state, profile('a', { duration: 2 })).state;
  state = queue(state, profile('b', { duration: 3 })).state;
  const result = tickResearch(state, 6, { tick: 42 });
  assert.deepEqual(result.state.completedTechIds, ['a', 'b']);
  assert.equal(result.state.queues['lab-a'], undefined);
  assert.deepEqual(result.events.map((event) => event.type), ['economy.research', 'economy.research']);
  assert.deepEqual(result.events.map((event) => event.payload.techId), ['a', 'b']);
  assert.deepEqual(result.events.map((event) => event.tick), [42, 42]);
});

test('cancellation gives full refund before start and proportional refund after progress', () => {
  let state = queue(createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.INDEPENDENT }), profile('a')).state;
  const untouched = cancelResearch(state, 'lab-a', 0);
  assert.deepEqual(untouched.refund, { fraction: 1, resources: { intel: 20, metal: 100 } });

  state = tickResearch(state, 4).state;
  const progressed = cancelResearch(state, 'lab-a', 'research:1');
  assert.equal(progressed.refund.fraction, 0.6);
  assert.deepEqual(progressed.refund.resources, { intel: 12, metal: 60 });
  assert.equal(progressed.state.queues['lab-a'], undefined);
  assert.equal(cancelResearch(progressed.state, 'lab-a', 0).status, RESEARCH_RESULTS.ITEM_NOT_FOUND);
});

test('manual pause/resume and progress snapshots expose UI-safe state', () => {
  let state = queue(createResearchState({ contentionPolicy: RESEARCH_CONTENTION_POLICIES.RESEARCH_PRIORITY }), profile('a')).state;
  state = setResearchPaused(state, 'lab-a', true).state;
  state = tickResearch(state, 5).state;
  assert.equal(state.queues['lab-a'][0].remaining, 10);
  let snapshot = researchProgressSnapshot(state);
  assert.equal(snapshot.facilities[0].paused, true);
  assert.equal(snapshot.facilities[0].pauseReason, 'manual');
  assert.equal(snapshot.facilities[0].blocksProduction, true);
  assert.equal(snapshot.facilities[0].current.progress, 0);

  state = setResearchPaused(state, 'lab-a', false).state;
  state = tickResearch(state, 5).state;
  snapshot = researchProgressSnapshot(state);
  assert.equal(snapshot.facilities[0].current.progress, 0.5);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.facilities));
});
