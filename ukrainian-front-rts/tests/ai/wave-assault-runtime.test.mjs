import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES, WORLD } from '../../src/config.js';
import { setSimulationSeed } from '../../src/core/random.js';
import { Game } from '../../src/game.js';
import {
  createTacticalAiController,
  updateTacticalAi,
} from '../../src/systems/tactical-ai-system.js';
import { updateUnitsWithNavigation } from '../../src/systems/navigation-movement-system.js';

function mockUnit(id, type, team, x, y, extra = {}) {
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
    ...extra,
  };
}

function mockBuilding(id, type, team, x, y) {
  return { id, type, team, x, y, hp: 1000, maxHp: 1000 };
}

function mockGame() {
  const uaHq = mockBuilding(20, 'hq', TEAM.UA, 2200, 1200);
  return {
    units: [
      mockUnit(1, 'ruInfantry', TEAM.RU, 100, 100, { waveSpawned: true, waveId: 1 }),
      mockUnit(2, 'uaInfantry', TEAM.UA, 2100, 1200),
    ],
    buildings: [mockBuilding(10, 'hq', TEAM.RU, 120, 120), uaHq],
    uaHQ: uaHq,
    gameOver: false,
    start() {},
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
    canObserve: () => false,
    waveReacquireTicks: 3,
    ...overrides,
  });
}

test('wave assault retains its operational objective without initial line of sight', () => {
  const game = mockGame();
  const dispose = install(game);

  const snapshot = updateTacticalAi(game);
  const wave = game.units[0];
  assert.equal(snapshot.lastPlan.posture, 'scouting');
  assert.deepEqual(wave.order, { kind: 'attackMove', x: game.uaHQ.x, y: game.uaHQ.y });
  assert.equal(wave.waveAssaultState, 'ordered');
  assert.equal(snapshot.commandMetrics.waveAssault.total, 1);
  assert.equal(snapshot.commandMetrics.waveAssault.ordered, 1);
  assert.equal(snapshot.commandMetrics.waveProtected, 1);

  dispose();
});

test('wave assault deterministically reacquires a surviving objective when its HQ target is destroyed', () => {
  const game = mockGame();
  const fallback = mockBuilding(21, 'depot', TEAM.UA, 1700, 900);
  game.buildings.push(fallback);
  const dispose = install(game);

  updateTacticalAi(game);
  game.uaHQ.hp = 0;
  game.units[0].order = null;
  const snapshot = updateTacticalAi(game);

  assert.deepEqual(game.units[0].order, { kind: 'attackMove', x: fallback.x, y: fallback.y });
  assert.equal(game.units[0].waveAssaultTargetId, `building:${fallback.id}`);
  assert.equal(snapshot.commandMetrics.waveAssault.reacquired, 1);

  dispose();
});

test('reinforcement joins an existing wave assault on the next tactical update', () => {
  const game = mockGame();
  const dispose = install(game);

  updateTacticalAi(game);
  const reinforcement = mockUnit(3, 'ruTank', TEAM.RU, 130, 120, {
    waveSpawned: true,
    waveId: 2,
  });
  game.units.push(reinforcement);
  const snapshot = updateTacticalAi(game);

  assert.deepEqual(reinforcement.order, { kind: 'attackMove', x: game.uaHQ.x, y: game.uaHQ.y });
  assert.equal(reinforcement.waveAssaultState, 'ordered');
  assert.equal(snapshot.commandMetrics.waveAssault.total, 2);
  assert.equal(snapshot.commandMetrics.waveAssault.ordered, 2);

  dispose();
});

test('wave assault exposes a bounded retry instead of silent idle when no operational target survives', () => {
  const game = mockGame();
  game.uaHQ.hp = 0;
  game.buildings = game.buildings.filter((building) => building.team === TEAM.RU);
  const dispose = install(game);

  const snapshot = updateTacticalAi(game);
  const wave = game.units[0];
  assert.equal(wave.waveAssaultState, 'waiting-bounded');
  assert.equal(wave.waveAssaultRetryTick, snapshot.tick + 3);
  assert.equal(snapshot.commandMetrics.waveAssault.waiting, 1);
  assert.equal(snapshot.commandMetrics.waveAssault.reacquireWithinTicks, 3);

  dispose();
});

function navigationGame() {
  setSimulationSeed('issue-185-wave-assault-navigation');
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

test('wave assault reaches pressure range through authoritative navigation around a direct blocker', () => {
  const game = navigationGame();
  const attacker = game.addUnit('ruTank', TEAM.RU, 160, 320);
  attacker.waveSpawned = true;
  attacker.waveId = 1;
  const uaHq = game.addBuilding('hq', TEAM.UA, 900, 320);
  game.uaHQ = uaHq;
  game.addBuilding('depot', TEAM.RU, 480, 320);
  const dispose = install(game, { waveReacquireTicks: 90 });

  updateTacticalAi(game);
  assert.equal(attacker.order.kind, 'attackMove');
  const start = { x: attacker.x, y: attacker.y };
  for (let tick = 0; tick < 240; tick += 1) updateUnitsWithNavigation(game, 1 / 30);

  assert.ok(attacker.x > start.x + 80, `expected wave to leave spawn, x=${attacker.x}`);
  assert.ok(Math.hypot(attacker.x - uaHq.x, attacker.y - uaHq.y) < Math.hypot(start.x - uaHq.x, start.y - uaHq.y));
  assert.equal(game.navigationState.pathService.metrics().failures, 0);

  dispose();
});
