import assert from 'node:assert/strict';
import test from 'node:test';

import { installControllerWithSimulationDelegates } from '../../src/app/controller-adapter.js';
import {
  SIMULATION_DELEGATE_PHASES,
  runSimulationDelegates,
  simulationDelegateSnapshot,
} from '../../src/core/simulation-delegates.js';

test('removes a legacy update wrapper and preserves its work as named delegates', () => {
  const calls = [];
  const authoritativeUpdate = (step) => calls.push(`authoritative:${step}`);
  const game = { update: authoritativeUpdate };

  const dispose = installControllerWithSimulationDelegates({
    game,
    name: 'legacy-controller',
    install() {
      const originalUpdate = game.update.bind(game);
      game.update = (step) => {
        calls.push(`legacy-before:${step}`);
        const result = originalUpdate(step);
        calls.push(`legacy-after:${step}`);
        return result;
      };
      return () => {
        game.update = originalUpdate;
        calls.push('legacy-disposed');
      };
    },
    delegates: [
      {
        phase: SIMULATION_DELEGATE_PHASES.STEP_BEGIN,
        id: 'before',
        run: (_game, step) => calls.push(`delegate-before:${step}`),
      },
      {
        phase: SIMULATION_DELEGATE_PHASES.STEP_END,
        id: 'after',
        run: (_game, step) => calls.push(`delegate-after:${step}`),
      },
    ],
  });

  assert.equal(game.update, authoritativeUpdate);
  game.update(0.5);
  runSimulationDelegates(game, SIMULATION_DELEGATE_PHASES.STEP_BEGIN, 0.5);
  runSimulationDelegates(game, SIMULATION_DELEGATE_PHASES.STEP_END, 0.5);
  assert.deepEqual(calls, [
    'authoritative:0.5',
    'delegate-before:0.5',
    'delegate-after:0.5',
  ]);
  assert.deepEqual(simulationDelegateSnapshot(game), [
    { phase: 'step-begin', id: 'legacy-controller:before', order: 0 },
    { phase: 'step-end', id: 'legacy-controller:after', order: 0 },
  ]);

  assert.equal(dispose(), true);
  assert.equal(dispose(), false);
  assert.equal(game.update, authoritativeUpdate);
  assert.deepEqual(simulationDelegateSnapshot(game), []);
  assert.equal(calls.at(-1), 'legacy-disposed');
});

test('restores authoritative update when controller installation fails', () => {
  const authoritativeUpdate = () => true;
  const game = { update: authoritativeUpdate };
  const expected = new Error('install failed');

  assert.throws(
    () => installControllerWithSimulationDelegates({
      game,
      name: 'broken-controller',
      install() {
        game.update = () => false;
        throw expected;
      },
    }),
    (error) => error === expected,
  );
  assert.equal(game.update, authoritativeUpdate);
});
