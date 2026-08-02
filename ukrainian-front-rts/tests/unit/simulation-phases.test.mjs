import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  SIMULATION_DELEGATE_PHASES,
  registerSimulationDelegate,
} from '../../src/core/simulation-delegates.js';
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
    missionIndex: 0,
    keys: new Set(),
    camera: { x: 0, y: 0, z: 1 },
    terrain: [],
    road: [],
    shelterbelts: [],
    bridges: [],
    units: [
      {
        id: 1,
        type: 'uaTank',
        team: TEAM.UA,
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        order: null,
        target: null,
      },
      {
        id: 2,
        type: 'uaTank',
        team: TEAM.UA,
        x: 220,
        y: 100,
        hp: 100,
        maxHp: 100,
        order: null,
        target: null,
      },
    ],
    buildings: [],
    player: { objectives: [false, false, false] },
    unitStats(type) {
      return UNIT_TYPES[type];
    },
    updateUnit(unit, dt) {
      calls.push(`unit:${unit.id}:${dt}`);
    },
    updateProjectiles(dt) {
      calls.push(`projectiles:${dt}`);
    },
    updateResearch(dt) {
      calls.push(`research:${dt}`);
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

function registerPhaseRecorder(game, calls, phase) {
  return registerSimulationDelegate(game, {
    phase,
    id: `test:${phase}`,
    run: () => calls.push(phase),
  });
}

test('simulation phase contract exposes the complete authoritative order', () => {
  assert.deepEqual(SIMULATION_PHASES, [
    'clock',
    'camera',
    'step-begin',
    'tactical-prepare',
    'stance-prepare',
    'units',
    'projectiles',
    'production',
    'research',
    'waves',
    'cleanup',
    'objectives',
    'outcome',
    'stance-reconcile',
    'tactical-reconcile',
    'command-capacity',
    'step-end',
  ]);

  const { game, calls } = createPhaseFixture();
  const advanced = withViewport(() => runSimulationStep(game, 0.25));

  assert.equal(advanced, true);
  assert.equal(game.time, 0.25);
  assert.deepEqual(calls, [
    'unit:1:0.25',
    'unit:2:0.25',
    'projectiles:0.25',
    'research:0.25',
    'waves:0.25',
    'cleanup',
    'objectives',
  ]);
});

test('named delegates preserve the previous wrapper order around authoritative phases', () => {
  const { game, calls } = createPhaseFixture();
  const unregister = [
    SIMULATION_DELEGATE_PHASES.STEP_BEGIN,
    SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE,
    SIMULATION_DELEGATE_PHASES.STANCE_PREPARE,
    SIMULATION_DELEGATE_PHASES.STANCE_RECONCILE,
    SIMULATION_DELEGATE_PHASES.TACTICAL_RECONCILE,
    SIMULATION_DELEGATE_PHASES.COMMAND_CAPACITY,
    SIMULATION_DELEGATE_PHASES.STEP_END,
  ].map((phase) => registerPhaseRecorder(game, calls, phase));

  try {
    const advanced = withViewport(() => runSimulationStep(game, 0.25));
    assert.equal(advanced, true);
    assert.equal(game.time, 0.25);
    assert.deepEqual(calls, [
      'step-begin',
      'tactical-prepare',
      'stance-prepare',
      'unit:1:0.25',
      'unit:2:0.25',
      'projectiles:0.25',
      'research:0.25',
      'waves:0.25',
      'cleanup',
      'objectives',
      'stance-reconcile',
      'tactical-reconcile',
      'command-capacity',
      'step-end',
    ]);
  } finally {
    unregister.reverse().forEach((remove) => remove());
  }
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
