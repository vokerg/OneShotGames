import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameRuntime } from '../../src/app/runtime.js';

test('paused runtime renders UI without advancing simulation', () => {
  const frames = [];
  let now = 0;
  let updates = 0;
  let renders = 0;
  let refreshes = 0;
  const game = { mission: { waves: { firstDelay: 10 } }, missionIndex: 0, start() {}, update() { updates += 1; } };
  const runtime = createGameRuntime({
    game,
    renderer: { render() { renders += 1; } },
    ui: { refresh() { refreshes += 1; }, setMission() {}, toast() {} },
    now: () => now,
    requestFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelFrame: () => {},
    documentTarget: null,
    windowTarget: null,
  });

  runtime.start();
  runtime.pause('menu');
  now = 100;
  frames.shift()(now);
  assert.equal(updates, 0);
  assert.equal(renders, 1);
  assert.equal(refreshes, 1);
  runtime.resume('menu');
  now = 200;
  frames.shift()(now);
  assert.ok(updates > 0);
});

test('pause reasons compose without premature resume', () => {
  const runtime = createGameRuntime({
    game: { mission: null }, renderer: {}, ui: {},
    now: () => 0, requestFrame: () => 1, cancelFrame: () => {}, documentTarget: null, windowTarget: null,
  });
  runtime.pause('menu');
  runtime.pause('visibility');
  runtime.resume('menu');
  assert.equal(runtime.isPaused(), true);
  runtime.resume('visibility');
  assert.equal(runtime.isPaused(), false);
});
