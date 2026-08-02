import assert from 'node:assert/strict';
import test from 'node:test';

import { installControllerWithSimulationDelegates } from '../../src/app/controller-adapter.js';
import {
  SIMULATION_DELEGATE_PHASES,
  runSimulationDelegates,
  simulationDelegateSnapshot,
} from '../../src/core/simulation-delegates.js';

test('neutralizes only update while preserving controller lifecycle behavior', () => {
  const calls = [];
  const authoritativeUpdate = (step) => calls.push(`authoritative:${step}`);
  const authoritativeStart = () => calls.push('authoritative:start');
  const game = { update: authoritativeUpdate, start: authoritativeStart };

  const dispose = installControllerWithSimulationDelegates({
    game,
    name: 'legacy-controller',
    restore: ['start'],
    install() {
      const originalUpdate = game.update.bind(game);
      game.update = (step) => {
        calls.push(`legacy-before:${step}`);
        const result = originalUpdate(step);
        calls.push(`legacy-after:${step}`);
        return result;
      };
      game.start = () => calls.push('legacy:start');
      return () => {
        game.update = originalUpdate;
        game.start = () => calls.push('disposed:start');
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
  assert.notEqual(game.start, authoritativeStart);
  game.start();
  game.update(0.5);
  runSimulationDelegates(game, SIMULATION_DELEGATE_PHASES.STEP_BEGIN, 0.5);
  runSimulationDelegates(game, SIMULATION_DELEGATE_PHASES.STEP_END, 0.5);
  assert.deepEqual(calls, [
    'legacy:start',
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
  assert.equal(game.start, authoritativeStart);
  assert.deepEqual(simulationDelegateSnapshot(game), []);
  assert.equal(calls.at(-1), 'legacy-disposed');
});

test('restores the complete object shape when controller installation fails', () => {
  const authoritativeUpdate = () => true;
  const authoritativeStart = () => true;
  const game = { update: authoritativeUpdate, start: authoritativeStart, stable: 7 };
  const expected = new Error('install failed');

  assert.throws(
    () => installControllerWithSimulationDelegates({
      game,
      name: 'broken-controller',
      restore: ['start'],
      install() {
        game.update = () => false;
        game.start = () => false;
        game.partialApi = () => 'leaked';
        game.stable = 99;
        throw expected;
      },
    }),
    (error) => error === expected,
  );
  assert.equal(game.update, authoritativeUpdate);
  assert.equal(game.start, authoritativeStart);
  assert.equal(game.stable, 7);
  assert.equal(Object.hasOwn(game, 'partialApi'), false);
});

test('restores inherited lifecycle methods by deleting controller-owned shadows', () => {
  const prototype = {
    update() { return 'update'; },
    start() { return 'start'; },
  };
  const game = Object.create(prototype);
  const dispose = installControllerWithSimulationDelegates({
    game,
    name: 'inherited-controller',
    restore: ['start'],
    install() {
      game.update = () => 'wrapped-update';
      game.start = () => 'wrapped-start';
      return () => {};
    },
  });

  assert.equal(Object.hasOwn(game, 'update'), false);
  assert.equal(Object.hasOwn(game, 'start'), true);
  assert.equal(game.start(), 'wrapped-start');
  assert.equal(dispose(), true);
  assert.equal(Object.hasOwn(game, 'update'), false);
  assert.equal(Object.hasOwn(game, 'start'), false);
  assert.equal(game.update(), 'update');
  assert.equal(game.start(), 'start');
});
