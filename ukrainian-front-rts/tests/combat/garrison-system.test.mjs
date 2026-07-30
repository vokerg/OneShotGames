import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GARRISON_KINDS,
  GARRISON_RESULTS,
  canEnterGarrison,
  createGarrisonState,
  enterGarrison,
  exitGarrison,
  garrisonSnapshot,
  planGarrisonExit,
  resolveGarrisonClearance,
  resolveGarrisonDestruction,
} from '../../src/combat/garrison-system.js';

const host = (overrides = {}) => ({ id: 'host-1', x: 100, y: 100, team: 'ua', hp: 500, ...overrides });
const infantry = (id, overrides = {}) => ({
  id,
  x: 110,
  y: 100,
  team: 'ua',
  hp: 100,
  maxHp: 100,
  infantry: true,
  ...overrides,
});
const exits = (...points) => points.map(([id, x, y, extra = {}]) => ({ id, x, y, ...extra }));
const sequenceRandom = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

test('creates kind-specific immutable occupancy snapshots', () => {
  const state = createGarrisonState(host({ garrisonKind: GARRISON_KINDS.TRENCH }));
  const snapshot = garrisonSnapshot(state);
  assert.equal(snapshot.kind, GARRISON_KINDS.TRENCH);
  assert.equal(snapshot.capacity, 4);
  assert.equal(snapshot.terrain, 'trench');
  assert.deepEqual(snapshot.occupantIds, []);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(snapshot));
});

test('validates infantry, team, range, and capacity before entry', () => {
  const state = createGarrisonState(host(), { capacity: 1 });
  assert.equal(canEnterGarrison(state, infantry('far', { x: 500 })).status, GARRISON_RESULTS.OUT_OF_RANGE);
  assert.equal(canEnterGarrison(state, infantry('tank', { infantry: false, armor: true })).status, GARRISON_RESULTS.INVALID_UNIT);
  assert.equal(canEnterGarrison(state, infantry('enemy', { team: 'ru' })).status, GARRISON_RESULTS.WRONG_TEAM);

  const first = enterGarrison(state, [infantry('a')]);
  assert.equal(first.ok, true);
  assert.equal(canEnterGarrison(first.state, infantry('b')).status, GARRISON_RESULTS.CAPACITY_EXCEEDED);
  assert.equal(garrisonSnapshot(state).used, 0, 'entry must not mutate the original state');
});

test('entry is atomic and deterministically ordered', () => {
  const state = createGarrisonState(host(), { capacity: 2 });
  const result = enterGarrison(state, [infantry('b'), infantry('a')]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.occupants.map((occupant) => occupant.id), ['a', 'b']);
  assert.deepEqual(result.unitTransitions.map((transition) => transition.unitId), ['a', 'b']);

  const rejected = enterGarrison(state, [infantry('a'), infantry('far', { x: 900 })]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, GARRISON_RESULTS.OUT_OF_RANGE);
  assert.equal(rejected.state, state);
});

test('transport-compatible entry returns dismount transitions without mutating cargo', () => {
  const passenger = infantry('p1', { embarkedIn: 7, x: 100, y: 100 });
  const state = createGarrisonState(host());
  const result = enterGarrison(state, [passenger], {
    dismountFromTransportId: 7,
    transportPassengers: [passenger],
  });
  assert.equal(result.ok, true);
  assert.equal(result.unitTransitions[0].clearEmbarkedIn, true);
  assert.deepEqual(result.transportTransition, { transportId: '7', removePassengerIds: ['p1'] });
  assert.equal(passenger.embarkedIn, 7);

  const mismatch = enterGarrison(state, [passenger], {
    dismountFromTransportId: 8,
    transportPassengers: [passenger],
  });
  assert.equal(mismatch.status, GARRISON_RESULTS.TRANSPORT_MISMATCH);
});

test('hostile occupancy blocks normal entry until clearing succeeds', () => {
  const hostile = createGarrisonState(host({ team: 'ru' }), { capacity: 2 });
  const occupied = enterGarrison(hostile, [infantry('d1', { team: 'ru' })]).state;
  const verdict = canEnterGarrison(occupied, infantry('a1', { team: 'ua' }));
  assert.equal(verdict.status, GARRISON_RESULTS.HOSTILE_OCCUPANCY);
});

test('exit planning is deterministic and blocked exits do not change state', () => {
  const state = enterGarrison(createGarrisonState(host(), { capacity: 2 }), [infantry('a'), infantry('b')]).state;
  const candidates = exits(
    ['west', 70, 100, { priority: 1 }],
    ['east', 130, 100, { priority: 2 }],
    ['blocked', 100, 130, { blocked: true, priority: 10 }],
  );
  const plan = planGarrisonExit(state, ['b', 'a'], candidates);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.placements.map((placement) => placement.exitId), ['east', 'west']);
  assert.deepEqual(plan.placements.map((placement) => placement.unitId), ['a', 'b']);

  const blocked = exitGarrison(state, ['a', 'b'], exits(['only', 130, 100]));
  assert.equal(blocked.status, GARRISON_RESULTS.EXIT_BLOCKED);
  assert.equal(blocked.state, state);
});

test('successful exit removes occupants and returns world-restoration transitions', () => {
  const state = enterGarrison(createGarrisonState(host()), [infantry('a')]).state;
  const result = exitGarrison(state, ['a'], exits(['door', 130, 100]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.occupants, []);
  assert.deepEqual(result.unitTransitions[0], {
    unitId: 'a',
    position: { x: 130, y: 100 },
    removeGarrisonedIn: true,
    restoreToWorld: true,
  });
});

test('building clearing uses injected randomness and can transfer control', () => {
  const enemyState = enterGarrison(
    createGarrisonState(host({ team: 'ru' }), { capacity: 2 }),
    [infantry('d1', { team: 'ru', garrisonDefense: 1 }), infantry('d2', { team: 'ru', garrisonDefense: 1 })],
  ).state;
  const attackers = [
    infantry('a1', { clearingPower: 3, breachBonus: 0.2 }),
    infantry('a2', { clearingPower: 3, breachBonus: 0.2 }),
  ];
  const result = resolveGarrisonClearance(enemyState, attackers, sequenceRandom(0.01, 0.01));
  assert.equal(result.ok, true);
  assert.equal(result.cleared, true);
  assert.deepEqual(result.eliminatedDefenderIds, ['d1', 'd2']);
  assert.equal(result.state.team, 'ua');
  assert.deepEqual(result.state.occupants, []);
});

test('failed clearing attacks can produce deterministic attacker casualties', () => {
  const enemyState = enterGarrison(
    createGarrisonState(host({ team: 'ru' })),
    [infantry('d1', { team: 'ru', garrisonDefense: 4 })],
  ).state;
  const result = resolveGarrisonClearance(
    enemyState,
    [infantry('a1', { clearingPower: 0 })],
    sequenceRandom(0.99, 0.01),
  );
  assert.equal(result.cleared, false);
  assert.deepEqual(result.attackerCasualtyIds, ['a1']);
  assert.deepEqual(result.state.occupants.map((occupant) => occupant.id), ['d1']);
});

test('destruction resolves survival rolls, safe placement, and blocked-exit casualties', () => {
  const occupied = enterGarrison(
    createGarrisonState(host(), { capacity: 3 }),
    [infantry('a'), infantry('b'), infantry('c')],
  ).state;
  const result = resolveGarrisonDestruction(
    occupied,
    exits(['safe', 130, 100]),
    sequenceRandom(0.1, 0.2, 0.9),
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.destroyed, true);
  assert.deepEqual(result.state.occupants, []);
  assert.deepEqual(result.survivorIds, ['a']);
  assert.deepEqual(result.casualtyIds, ['b', 'c']);
  assert.deepEqual(result.placements[0].position, { x: 130, y: 100 });
});

test('empty neutral positions can be captured explicitly', () => {
  const neutral = createGarrisonState(host({ team: null }));
  const result = enterGarrison(neutral, [infantry('a')], { allowCaptureEmpty: true });
  assert.equal(result.ok, true);
  assert.equal(result.state.team, 'ua');
  assert.equal(garrisonSnapshot(result.state).contested, false);
});
