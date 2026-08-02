import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIMULATION_DELEGATE_PHASES,
  clearSimulationDelegates,
  registerSimulationDelegate,
  runSimulationDelegates,
  simulationDelegateSnapshot,
} from '../../src/core/simulation-delegates.js';

test('runs simulation delegates deterministically by order and stable id', () => {
  const game = {};
  const calls = [];
  registerSimulationDelegate(game, {
    phase: SIMULATION_DELEGATE_PHASES.STANCE_PREPARE,
    id: 'z-last-by-id',
    order: 10,
    run: (_game, step) => calls.push(`z:${step}`),
  });
  registerSimulationDelegate(game, {
    phase: SIMULATION_DELEGATE_PHASES.STANCE_PREPARE,
    id: 'a-first-by-id',
    order: 10,
    run: (_game, step) => calls.push(`a:${step}`),
  });
  registerSimulationDelegate(game, {
    phase: SIMULATION_DELEGATE_PHASES.STANCE_PREPARE,
    id: 'priority',
    order: -5,
    run: (_game, step) => calls.push(`priority:${step}`),
  });

  runSimulationDelegates(game, SIMULATION_DELEGATE_PHASES.STANCE_PREPARE, 0.25);
  assert.deepEqual(calls, ['priority:0.25', 'a:0.25', 'z:0.25']);
  assert.deepEqual(simulationDelegateSnapshot(game), [
    { phase: 'stance-prepare', id: 'priority', order: -5 },
    { phase: 'stance-prepare', id: 'a-first-by-id', order: 10 },
    { phase: 'stance-prepare', id: 'z-last-by-id', order: 10 },
  ]);
});

test('unregisters exact delegates and rejects duplicate ownership', () => {
  const game = {};
  const unregister = registerSimulationDelegate(game, {
    phase: SIMULATION_DELEGATE_PHASES.STEP_END,
    id: 'observer',
    run() {},
  });

  assert.throws(
    () => registerSimulationDelegate(game, {
      phase: SIMULATION_DELEGATE_PHASES.STEP_END,
      id: 'observer',
      run() {},
    }),
    /Duplicate simulation delegate/,
  );
  assert.equal(unregister(), true);
  assert.equal(unregister(), false);
  assert.deepEqual(simulationDelegateSnapshot(game), []);
});

test('clears every delegate owned by one game without affecting another game', () => {
  const first = {};
  const second = {};
  for (const game of [first, second]) {
    registerSimulationDelegate(game, {
      phase: SIMULATION_DELEGATE_PHASES.TACTICAL_PREPARE,
      id: 'prepare',
      run() {},
    });
  }

  assert.equal(clearSimulationDelegates(first), true);
  assert.equal(clearSimulationDelegates(first), false);
  assert.deepEqual(simulationDelegateSnapshot(first), []);
  assert.equal(simulationDelegateSnapshot(second).length, 1);
});
