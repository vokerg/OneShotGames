import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGINEER_ABILITY_PROFILES,
  ENGINEER_OBJECT_KINDS,
  ENGINEER_RESULTS,
  OBSTACLE_TYPES,
  armDemolitionCharge,
  beginObstacleConstruction,
  breachObstacle,
  clearMine,
  createEngineerMechanicsState,
  defuseDemolitionCharge,
  deployMine,
  engineerClearanceSnapshot,
  placeDemolitionCharge,
  resolveMineTriggers,
  scanForMines,
  tickEngineerMechanics,
  workObstacleConstruction,
} from '../../src/combat/engineer-mechanics-system.js';

const engineer = (overrides = {}) => ({
  id: 'eng-1',
  side: 'ua',
  x: 100,
  y: 100,
  hp: 100,
  buildRate: 2,
  clearanceRate: 2,
  mineDetection: 0.8,
  mineClearance: 0.8,
  chargeDefusal: 0.8,
  ...overrides,
});

const randomSequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

function enemyMineState(config = {}) {
  const base = createEngineerMechanicsState();
  return deployMine(base, engineer({ id: 'ru-eng', side: 'ru' }), { x: 110, y: 100 }, { armingTime: 0, ...config }).state;
}

test('exports immutable ability-compatible engineer profiles', () => {
  assert.equal(ENGINEER_ABILITY_PROFILES.deployMine.mode, 'point');
  assert.equal(ENGINEER_ABILITY_PROFILES.detectMines.mode, 'area');
  assert.equal(ENGINEER_ABILITY_PROFILES.breachObstacle.mode, 'unit');
  assert.ok(Object.isFrozen(ENGINEER_ABILITY_PROFILES));
  assert.ok(Object.isFrozen(createEngineerMechanicsState()));
});

test('deploys mines with monotonic ids without mutating prior state', () => {
  const state = createEngineerMechanicsState();
  const first = deployMine(state, engineer(), { x: 120, y: 100 }, { armingTime: 2 });
  const second = deployMine(first.state, engineer(), { x: 140, y: 100 }, { armingTime: 0 });
  assert.equal(first.mine.id, 'mine-0001');
  assert.equal(second.mine.id, 'mine-0002');
  assert.equal(state.mines.length, 0);
  assert.equal(second.state.mines[1].armed, true);
  assert.ok(Object.isFrozen(second.state.mines));
});

test('ticks mine arming and emits exactly one armed event', () => {
  const deployed = deployMine(createEngineerMechanicsState(), engineer(), { x: 120, y: 100 }, { armingTime: 2 }).state;
  const partial = tickEngineerMechanics(deployed, 1);
  assert.equal(partial.state.mines[0].armed, false);
  assert.equal(partial.events.length, 0);
  const armed = tickEngineerMechanics(partial.state, 1);
  assert.equal(armed.state.mines[0].armed, true);
  assert.deepEqual(armed.events, [{ kind: 'mine-armed', mineId: 'mine-0001' }]);
});

test('detects enemy mines deterministically and records observer side', () => {
  const state = enemyMineState({ detectionDifficulty: 0.4 });
  const result = scanForMines(state, engineer(), { x: 100, y: 100 }, randomSequence(0.1), { radius: 50 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.detectedIds, ['mine-0001']);
  assert.deepEqual(result.state.mines[0].detectedBy, ['ru', 'ua']);
  assert.equal(state.mines[0].detectedBy.includes('ua'), false);
});

test('triggers armed enemy mines by domain and avoidance policy', () => {
  const state = enemyMineState({ triggerChance: 0.8 });
  const ignored = resolveMineTriggers(state, { id: 'air-1', side: 'ua', x: 110, y: 100, domain: 'air' }, randomSequence(0));
  assert.equal(ignored.events.length, 0);
  const triggered = resolveMineTriggers(state, { id: 'unit-1', side: 'ua', x: 110, y: 100, domain: 'ground', mineAvoidance: 0.25 }, randomSequence(0.2));
  assert.equal(triggered.status, ENGINEER_RESULTS.TRIGGERED);
  assert.equal(triggered.state.mines.length, 0);
  assert.equal(triggered.events[0].damage, 80);
  assert.equal(triggered.events[0].probability, 0.6000000000000001);
});

test('clears detected mines or detonates them on failed clearance', () => {
  const detected = scanForMines(enemyMineState(), engineer(), { x: 100, y: 100 }, randomSequence(0), { radius: 50 }).state;
  const cleared = clearMine(detected, 'mine-0001', engineer(), randomSequence(0));
  assert.equal(cleared.status, ENGINEER_RESULTS.CLEARED);
  assert.equal(cleared.state.mines.length, 0);

  const failedState = scanForMines(enemyMineState({ clearanceDifficulty: 1 }), engineer(), { x: 100, y: 100 }, randomSequence(0), { radius: 50 }).state;
  const failed = clearMine(failedState, 'mine-0001', engineer({ mineClearance: 0 }), randomSequence(0.9));
  assert.equal(failed.status, ENGINEER_RESULTS.TRIGGERED);
  assert.equal(failed.state.mines.length, 0);
  assert.equal(failed.event.targetId, 'eng-1');
});

test('constructs obstacles deterministically until they become blocking', () => {
  const started = beginObstacleConstruction(createEngineerMechanicsState(), engineer(), { x: 140, y: 100 }, { obstacleType: OBSTACLE_TYPES.WIRE, buildWork: 4 });
  const half = workObstacleConstruction(started.state, started.obstacle.id, engineer(), 1);
  assert.equal(half.status, ENGINEER_RESULTS.CONSTRUCTING);
  assert.equal(half.obstacle.buildProgress, 0.5);
  assert.equal(half.obstacle.blocking, false);
  const built = workObstacleConstruction(half.state, started.obstacle.id, engineer(), 1);
  assert.equal(built.status, ENGINEER_RESULTS.BUILT);
  assert.equal(built.obstacle.blocking, true);
  assert.equal(built.obstacle.hp, built.obstacle.maxHp);
});

test('breaches completed hostile obstacles using clearance work', () => {
  const started = beginObstacleConstruction(createEngineerMechanicsState(), engineer({ side: 'ru' }), { x: 140, y: 100 }, { clearanceWork: 4, buildWork: 0 });
  const built = workObstacleConstruction(started.state, started.obstacle.id, engineer({ side: 'ru' }), 0).state;
  const partial = breachObstacle(built, started.obstacle.id, engineer(), 1);
  assert.equal(partial.status, ENGINEER_RESULTS.CLEARING);
  assert.equal(partial.obstacle.breachProgress, 0.5);
  assert.equal(partial.obstacle.blocking, true);
  const complete = breachObstacle(partial.state, started.obstacle.id, engineer(), 1);
  assert.equal(complete.status, ENGINEER_RESULTS.BREACHED);
  assert.equal(complete.obstacle.blocking, false);
  assert.equal(complete.obstacle.hp, 0);
});

test('places, arms, and detonates demolition charges on deterministic fuse expiry', () => {
  const placed = placeDemolitionCharge(createEngineerMechanicsState(), engineer(), { id: 'bunker-1', x: 120, y: 100 });
  const armed = armDemolitionCharge(placed.state, placed.charge.id, engineer(), { fuse: 2 });
  const ticking = tickEngineerMechanics(armed.state, 1);
  assert.equal(ticking.state.charges[0].fuseRemaining, 1);
  const detonated = tickEngineerMechanics(ticking.state, 1);
  assert.equal(detonated.status, ENGINEER_RESULTS.DETONATED);
  assert.equal(detonated.state.charges.length, 0);
  assert.equal(detonated.events[0].targetId, 'bunker-1');
  assert.equal(detonated.events[0].damageClass, 'shapedCharge');
});

test('defuses demolition charges using injected randomness', () => {
  const placed = placeDemolitionCharge(createEngineerMechanicsState(), engineer({ id: 'ru-eng', side: 'ru' }), { x: 120, y: 100 }, { defuseDifficulty: 0.4 });
  const result = defuseDemolitionCharge(placed.state, placed.charge.id, engineer(), randomSequence(0.1));
  assert.equal(result.status, ENGINEER_RESULTS.CHARGE_DEFUSED);
  assert.equal(result.state.charges.length, 0);
  assert.equal(result.event.engineerId, 'eng-1');
});

test('clearance feedback hides unknown enemy mines and exposes detected hazards', () => {
  const state = enemyMineState();
  const hidden = engineerClearanceSnapshot(state, 'ua');
  assert.deepEqual(hidden.mines, []);
  const detected = scanForMines(state, engineer(), { x: 100, y: 100 }, randomSequence(0), { radius: 50 }).state;
  const visible = engineerClearanceSnapshot(detected, 'ua', { x: 100, y: 100 }, 100);
  assert.equal(visible.owner, 'presentation');
  assert.equal(visible.mines[0].kind, ENGINEER_OBJECT_KINDS.MINE);
  assert.equal(visible.mines[0].action, 'clear');
  assert.ok(Object.isFrozen(visible));
});
