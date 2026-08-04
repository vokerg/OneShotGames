import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES, WORLD } from '../../src/config.js';
import { setSimulationSeed } from '../../src/core/random.js';
import { Game } from '../../src/game.js';
import {
  createTacticalAiController,
  tacticalAiSnapshot,
  updateTacticalAi,
} from '../../src/systems/tactical-ai-system.js';
import { updateUnitsWithNavigation } from '../../src/systems/navigation-movement-system.js';

function mockUnit(id, type, team, x, y) {
  const stats = UNIT_TYPES[type];
  return {
    id,
    type,
    team,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    order: null,
    target: null,
    buffs: {},
    autoFire: true,
  };
}

function mockGame() {
  return {
    units: [
      mockUnit(1, 'ruInfantry', TEAM.RU, 100, 100),
      mockUnit(2, 'ruTank', TEAM.RU, 125, 100),
      mockUnit(3, 'uaInfantry', TEAM.UA, 2200, 1200),
    ],
    buildings: [{ id: 10, type: 'hq', team: TEAM.RU, x: 120, y: 120, hp: 1000, maxHp: 1000 }],
    gameOver: false,
    startCalls: 0,
    start() {
      this.startCalls += 1;
      return this.startCalls;
    },
    unitStats(type) {
      return UNIT_TYPES[type];
    },
  };
}

function install(game, overrides = {}) {
  return createTacticalAiController(game, {
    doctrine: {
      decisionIntervalTicks: 1,
      decisionOffsetTicks: 0,
      contactStaleAfterTicks: 1,
      contactForgetAfterTicks: 3,
      riskTolerance: 0.7,
      retreatThreshold: 0.3,
    },
    ...overrides,
  });
}

test('uses observed-only contacts and changes from scouting to defensive response', () => {
  const game = mockGame();
  const dispose = install(game);

  let snapshot = updateTacticalAi(game);
  assert.equal(snapshot.lastPlan.posture, 'scouting');
  assert.equal(snapshot.blackboard.summary.knownContacts, 0);
  assert.equal(game.units[0].order.kind, 'move');

  game.units[2].x = 250;
  game.units[2].y = 130;
  snapshot = updateTacticalAi(game);
  assert.equal(snapshot.blackboard.summary.confirmedContacts, 1);
  assert.equal(snapshot.lastPlan.posture, 'defending');
  assert.equal(['attack', 'attackMove'].includes(game.units[0].order.kind), true);
  assert.equal(snapshot.commandMetrics.assigned, 2);

  assert.equal(dispose(), true);
  assert.equal(game.tacticalAiSnapshot, undefined);
  assert.equal(game.setTacticalAiEnabled, undefined);
});

test('forgets lost contacts and returns to scouting without reading hidden death state', () => {
  const game = mockGame();
  game.units[2].x = 250;
  game.units[2].y = 130;
  const dispose = install(game);

  let snapshot = updateTacticalAi(game);
  assert.equal(snapshot.lastPlan.posture, 'defending');
  game.units[2].hp = 0;
  snapshot = updateTacticalAi(game);
  assert.equal(snapshot.blackboard.summary.knownContacts, 1);
  updateTacticalAi(game);
  snapshot = updateTacticalAi(game);
  assert.equal(snapshot.blackboard.summary.knownContacts, 0);
  assert.equal(snapshot.lastPlan.posture, 'scouting');
  dispose();
});

test('produces identical tactical snapshots for identical fixed-step inputs', () => {
  const left = mockGame();
  const right = mockGame();
  left.units[2].x = right.units[2].x = 260;
  left.units[2].y = right.units[2].y = 135;
  const disposeLeft = install(left);
  const disposeRight = install(right);

  for (let tick = 0; tick < 6; tick += 1) {
    if (tick === 2) {
      left.units[0].hp = right.units[0].hp = 25;
      left.units[1].hp = right.units[1].hp = 80;
    }
    updateTacticalAi(left);
    updateTacticalAi(right);
    assert.deepEqual(tacticalAiSnapshot(right), tacticalAiSnapshot(left));
  }

  disposeLeft();
  disposeRight();
});

test('bounds observation comparisons and resets deterministically on mission start', () => {
  const game = mockGame();
  for (let index = 0; index < 20; index += 1) {
    game.units.push(mockUnit(20 + index, 'uaInfantry', TEAM.UA, 200 + index, 150));
  }
  const originalStart = game.start;
  const dispose = install(game, {
    maxObservers: 2,
    maxHostiles: 3,
    canObserve: () => true,
  });

  let snapshot = updateTacticalAi(game);
  assert.equal(snapshot.observationMetrics.observers, 2);
  assert.equal(snapshot.observationMetrics.hostiles, 3);
  assert.ok(snapshot.observationMetrics.comparisons <= 6);
  assert.equal(snapshot.tick, 1);

  assert.equal(game.start(), 1);
  snapshot = game.tacticalAiSnapshot();
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.blackboard.summary.knownContacts, 0);
  assert.equal(dispose(), true);
  assert.equal(game.start, originalStart);
});

function navigationGame() {
  setSimulationSeed('ufr-081-navigation-integration');
  const game = new Game();
  game.player = {
    metal: 0,
    fuel: 0,
    intel: 0,
    pop: 0,
    cap: 100,
    mined: 0,
    objectives: [false, false, false],
    upgrades: new Set(),
  };
  game.enemy = { clock: Number.POSITIVE_INFINITY, pausedForCap: false };
  game.units = [];
  game.buildings = [];
  game.nodes = [];
  game.effects = [];
  game.projectiles = [];
  game.terrain = Array((WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile)).fill(0);
  game.road = [];
  game.shelterbelts = [];
  game.bridges = [];
  game.gameOver = false;
  game.lastError = '';
  game.nextId = 1;
  return game;
}

test('projects attack routes into the authoritative navigation system around blockers', () => {
  const game = navigationGame();
  const attacker = game.addUnit('ruTank', TEAM.RU, 160, 320);
  const target = game.addUnit('uaInfantry', TEAM.UA, 900, 320);
  target.autoFire = false;
  game.addBuilding('depot', TEAM.RU, 480, 320);
  const dispose = install(game, {
    canObserve: () => true,
    policy: {
      defenseRadius: 200,
      directEngageDistance: 100,
      attackStrengthRatio: 0.2,
      flankMinimumUnits: 6,
    },
  });

  const snapshot = updateTacticalAi(game);
  assert.equal(['attacking', 'assembling'].includes(snapshot.lastPlan.posture), true);
  assert.equal(['attackMove', 'move'].includes(attacker.order.kind), true);

  const start = { x: attacker.x, y: attacker.y };
  for (let tick = 0; tick < 240; tick += 1) updateUnitsWithNavigation(game, 1 / 30);
  assert.ok(attacker.x > start.x + 80);
  assert.ok(attacker.order?.navigationRoute || attacker.order === null || attacker.target);
  assert.equal(game.navigationState.pathService.metrics().failures, 0);
  dispose();
});
