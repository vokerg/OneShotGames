import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainEventStream, DOMAIN_EVENT_TYPES } from '../../src/core/events.js';
import {
  DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS,
  NEUTRAL_STRUCTURE_CATALOG,
  aggregateNeutralStructureEffects,
  advanceNeutralStructureCapture,
  beginNeutralStructureCapture,
  createNeutralStructureCatalog,
  createNeutralStructureState,
  emitNeutralStructureDomainEvents,
  neutralStructureEffectSnapshot,
  neutralStructureScriptFacts,
  neutralStructureScriptVariables,
  validateNeutralStructureDefinition,
} from '../../src/systems/neutral-structure-system.js';

const TEAM = { UA: 0, RU: 1 };
const site = (overrides = {}) => ({
  id: 'yard-1', type: 'neutral-yard', team: null, x: 100, y: 100,
  hp: 500, maxHp: 500, queue: [], underConstruction: false, ...overrides,
});
const unit = (id, team, x = 100, y = 100) => ({ id, team, x, y, hp: 100 });

test('validates and freezes the three required neutral structure families', () => {
  assert.deepEqual(DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS.map((entry) => entry.kind), ['civilian', 'industrial', 'logistics']);
  assert.equal(Object.isFrozen(NEUTRAL_STRUCTURE_CATALOG), true);
  assert.equal(Object.isFrozen(NEUTRAL_STRUCTURE_CATALOG['neutral.logistics-site'].effects), true);
  assert.throws(() => validateNeutralStructureDefinition({
    id: 'bad', kind: 'military', label: 'Bad', description: 'Bad', effects: {},
  }), /Unknown neutral structure kind/);
  assert.throws(() => createNeutralStructureCatalog([
    DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS[0], DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS[0],
  ]), /Duplicate neutral structure/);
});

test('creates neutral state with inactive ownership effects', () => {
  const state = createNeutralStructureState(site(), 'neutral.logistics-site');
  assert.equal(state.ownerTeam, null);
  assert.equal(state.controlled, false);
  assert.deepEqual(neutralStructureEffectSnapshot(state).effects, {});
  assert.equal(Object.isFrozen(state), true);
});

test('delegates deterministic capture progress and completes at the exact threshold', () => {
  const target = site();
  const attacker = unit('ua-1', TEAM.UA);
  const initial = createNeutralStructureState(target, 'neutral.civilian-site');
  const started = beginNeutralStructureCapture(initial, target, TEAM.UA, [attacker]);
  assert.equal(started.ok, true);
  assert.equal(started.state.lifecycle.capture.requiredSeconds, 10);
  const half = advanceNeutralStructureCapture(started.state, target, 5, { units: [attacker] });
  assert.equal(half.state.lifecycle.capture.progressSeconds, 5);
  const completed = advanceNeutralStructureCapture(half.state, target, 5, { units: [attacker] });
  assert.equal(completed.ownerChanged, true);
  assert.equal(completed.state.ownerTeam, TEAM.UA);
  assert.equal(completed.state.controlled, true);
});

test('pauses while contested and decays when capturers leave', () => {
  const target = site();
  const attacker = unit('ua-1', TEAM.UA);
  const defender = unit('ru-1', TEAM.RU);
  const started = beginNeutralStructureCapture(createNeutralStructureState(target, 'neutral.industrial-site'), target, TEAM.UA, [attacker]);
  const progressed = advanceNeutralStructureCapture(started.state, target, 4, { units: [attacker] });
  const contested = advanceNeutralStructureCapture(progressed.state, target, 2, { units: [attacker, defender] });
  assert.equal(contested.reason, 'contested');
  assert.equal(contested.state.lifecycle.capture.progressSeconds, 4);
  assert.equal(neutralStructureScriptFacts(contested.state).contested, true);
  const decayed = advanceNeutralStructureCapture(contested.state, target, 2, { units: [] });
  assert.equal(decayed.reason, 'paused');
  assert.equal(decayed.state.lifecycle.capture.progressSeconds, 3);
});

test('supports recapture while rejecting duplicate and overlapping capture attempts', () => {
  const target = site();
  const ua = unit('ua-1', TEAM.UA);
  const ru = unit('ru-1', TEAM.RU);
  let state = createNeutralStructureState(target, 'neutral.logistics-site');
  state = advanceNeutralStructureCapture(beginNeutralStructureCapture(state, target, TEAM.UA, [ua]).state, target, 11, { units: [ua] }).state;
  assert.equal(beginNeutralStructureCapture(state, target, TEAM.UA, [ua]).reason, 'already-owned');
  const recapture = beginNeutralStructureCapture(state, target, TEAM.RU, [ru]);
  assert.equal(recapture.ok, true);
  assert.equal(beginNeutralStructureCapture(recapture.state, target, TEAM.UA, [ua]).reason, 'active-capture');
  state = advanceNeutralStructureCapture(recapture.state, target, 11, { units: [ru] }).state;
  assert.equal(state.ownerTeam, TEAM.RU);
});

test('aggregates additive, multiplicative, drop-off, and script effects deterministically', () => {
  const ua = unit('ua-1', TEAM.UA);
  const controlled = DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS.map((definition, index) => {
    const target = site({ id: `site-${index}` });
    const started = beginNeutralStructureCapture(createNeutralStructureState(target, definition.id), target, TEAM.UA, [ua]);
    return advanceNeutralStructureCapture(started.state, target, definition.captureSeconds, { units: [ua] }).state;
  });
  const effects = aggregateNeutralStructureEffects([...controlled].reverse(), TEAM.UA);
  assert.equal(effects.metalPerMinute, 12);
  assert.equal(effects.fuelPerMinute, 8);
  assert.equal(effects.intelPerMinute, 4);
  assert.equal(effects.productionRateMultiplier, 1.08);
  assert.equal(effects.repairRateMultiplier, 1.1);
  assert.equal(effects.resupplyRateMultiplier, 1.1);
  assert.deepEqual(effects.dropOffResources, ['ammunition', 'fuel', 'repair-parts']);
  assert.deepEqual(effects.scriptFlags, ['civilian-network']);
  assert.deepEqual(effects.siteIds, ['site-0', 'site-1', 'site-2']);
});

test('exposes stable mission-script facts and flat variables', () => {
  const target = site({ id: 'relay-yard' });
  const attacker = unit('ua-1', TEAM.UA);
  const started = beginNeutralStructureCapture(createNeutralStructureState(target, 'neutral.civilian-site'), target, TEAM.UA, [attacker]);
  const progressed = advanceNeutralStructureCapture(started.state, target, 2.5, { units: [attacker] });
  const facts = neutralStructureScriptFacts(progressed.state);
  assert.equal(facts.captureProgressRatio, 0.25);
  assert.deepEqual(neutralStructureScriptVariables(progressed.state), {
    'neutral.relay-yard.captureProgress': 0.25,
    'neutral.relay-yard.captureTeam': TEAM.UA,
    'neutral.relay-yard.controlled': false,
    'neutral.relay-yard.contested': false,
    'neutral.relay-yard.owner': null,
  });
});

test('adapts neutral transitions into the central domain-event taxonomy', () => {
  const target = site();
  const attacker = unit('ua-1', TEAM.UA);
  const started = beginNeutralStructureCapture(createNeutralStructureState(target, 'neutral.logistics-site'), target, TEAM.UA, [attacker]);
  const completed = advanceNeutralStructureCapture(started.state, target, 11, { units: [attacker] });
  const stream = new DomainEventStream();
  const emitted = emitNeutralStructureDomainEvents(stream, [...started.events, ...completed.events], { tick: 42 });
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].type, DOMAIN_EVENT_TYPES.CAPTURE);
  assert.equal(emitted[1].payload.ownerTeam, TEAM.UA);
  assert.equal(emitted[1].tick, 42);
  assert.deepEqual(stream.drain(), emitted);
});
