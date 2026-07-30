import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  runSimulationStep,
  SIMULATION_PHASES,
} from '../../src/systems/simulation-phases.js';

function withViewport(callback) {
  const width = Object.getOwnPropertyDescriptor(globalThis, 'innerWidth');
  const height = Object.getOwnPropertyDescriptor(globalThis, 'innerHeight');
  Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 720 });
  try {
    return callback();
  } finally {
    if (width) Object.defineProperty(globalThis, 'innerWidth', width);
    else delete globalThis.innerWidth;
    if (height) Object.defineProperty(globalThis, 'innerHeight', height);
    else delete globalThis.innerHeight;
  }
}

function createPhaseFixture() {
  const calls = [];
  const game = {
    gameOver: false,
    time: 0,
    keys: new Set(),
    camera: { x: 0, y: 0, z: 1 },
    units: [
      { id: 1, team: TEAM.UA },
      { id: 2, team: TEAM.UA },
    ],
    buildings: [{ id: 3, team: TEAM.UA }],
    player: { objectives: [false, false, false] },
    smokeState: {
      nextId: 2,
      clouds: [{ id: 'smoke-1', x: 0, y: 0, radius: 40, density: 1, duration: 2, remaining: 2, driftX: 4, driftY: 0 }],
    },
    updateUnit(unit, dt) {
      calls.push(`unit:${unit.id}:${dt}`);
    },
    updateProjectiles(dt) {
      calls.push(`projectiles:${dt}`);
    },
    updateProduction(dt) {
      calls.push(`production:${dt}`);
    },
    updateWaves(dt) {
      calls.push(`waves:${dt}`);
    },
    removeDestroyedEntities() {
      calls.push('cleanup');
    },
    updateObjectives() {
      calls.push('objectives');
    },
    finish(outcome, reason) {
      calls.push(`finish:${outcome}:${reason}`);
      this.gameOver = true;
    },
  };
  return { game, calls };
}

test('simulation phase contract is explicit and ordered', () => {
  assert.deepEqual(SIMULATION_PHASES, [
    'clock',
    'camera',
    'units',
    'smoke',
    'projectiles',
    'production',
    'waves',
    'cleanup',
    'objectives',
    'outcome',
  ]);

  const { game, calls } = createPhaseFixture();
  const advanced = withViewport(() => runSimulationStep(game, 0.25));

  assert.equal(advanced, true);
  assert.equal(game.time, 0.25);
  assert.equal(game.smokeState.clouds[0].x, 1);
  assert.equal(game.smokeState.clouds[0].remaining, 1.75);
  assert.deepEqual(calls, [
    'unit:1:0.25',
    'unit:2:0.25',
    'projectiles:0.25',
    'production:0.25',
    'waves:0.25',
    'cleanup',
    'objectives',
  ]);
});

test('outcome resolution happens after objective evaluation and prefers victory', () => {
  const { game, calls } = createPhaseFixture();
  game.units = [];
  game.buildings = [];
  game.updateObjectives = () => {
    calls.push('objectives');
    game.player.objectives = [true, true, true];
  };

  withViewport(() => runSimulationStep(game, 1 / 30));

  assert.match(calls.at(-1), /^finish:victory:/);
  assert.equal(calls.some((call) => call.startsWith('finish:defeat:')), false);
});

test('completed games and invalid steps do not enter simulation phases', () => {
  const { game, calls } = createPhaseFixture();
  game.gameOver = true;
  assert.equal(withViewport(() => runSimulationStep(game, 1 / 30)), false);
  assert.deepEqual(calls, []);
  assert.equal(game.time, 0);

  game.gameOver = false;
  assert.throws(() => runSimulationStep(game, 0), /positive finite/);
  assert.throws(() => runSimulationStep(game, Number.NaN), /positive finite/);
  assert.deepEqual(calls, []);
  assert.equal(game.time, 0);
});
