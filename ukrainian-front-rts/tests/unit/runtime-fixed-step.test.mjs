import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameRuntime } from '../../src/app/runtime.js';
import { FIXED_SIMULATION_STEP_SECONDS } from '../../src/core/fixed-step-clock.js';

function runFrames(frameTimes) {
  let currentTime = 0;
  let scheduledFrame = null;
  let nextHandle = 1;
  const updates = [];
  const game = {
    mission: null,
    simulationSeed: null,
    start(missionIndex) {
      this.mission = { id: `mission-${missionIndex}`, waves: { firstDelay: 20 } };
    },
    update(stepSeconds) {
      updates.push(stepSeconds);
    },
  };
  const renderer = { renders: 0, render() { this.renders += 1; } };
  const ui = {
    refreshes: 0,
    setMission() {},
    toast() {},
    refresh() { this.refreshes += 1; },
  };
  const runtime = createGameRuntime({
    game,
    renderer,
    ui,
    now: () => currentTime,
    requestFrame(callback) {
      scheduledFrame = callback;
      return nextHandle++;
    },
    cancelFrame() {},
  });

  runtime.startMission(0, 'runtime-fixed-step');
  runtime.start();
  for (const frameTime of frameTimes) {
    currentTime = frameTime;
    const callback = scheduledFrame;
    assert.equal(typeof callback, 'function');
    callback(frameTime);
  }
  runtime.stop();

  return { updates, renderer, ui, clock: runtime.simulationClock.snapshot() };
}

test('browser runtime produces identical simulation ticks at different render rates', () => {
  const sixtyFps = runFrames(Array.from({ length: 60 }, (_, index) => ((index + 1) * 1000) / 60));
  const tenFps = runFrames(Array.from({ length: 10 }, (_, index) => (index + 1) * 100));

  assert.equal(sixtyFps.updates.length, 30);
  assert.equal(tenFps.updates.length, 30);
  assert.deepEqual(sixtyFps.updates, tenFps.updates);
  assert.ok(sixtyFps.updates.every((step) => step === FIXED_SIMULATION_STEP_SECONDS));
  assert.equal(sixtyFps.clock.tick, 30);
  assert.equal(tenFps.clock.tick, 30);
  assert.equal(sixtyFps.renderer.renders, 60);
  assert.equal(tenFps.renderer.renders, 10);
  assert.equal(sixtyFps.ui.refreshes, 60);
  assert.equal(tenFps.ui.refreshes, 10);
});

test('mission restart discards partial accumulated frame time', () => {
  let currentTime = 0;
  let scheduledFrame = null;
  const updates = [];
  const game = {
    mission: null,
    start() {
      this.mission = { id: 'restart', waves: { firstDelay: 20 } };
    },
    update(stepSeconds) {
      updates.push(stepSeconds);
    },
  };
  const runtime = createGameRuntime({
    game,
    renderer: { render() {} },
    ui: { setMission() {}, toast() {}, refresh() {} },
    now: () => currentTime,
    requestFrame(callback) {
      scheduledFrame = callback;
      return 1;
    },
    cancelFrame() {},
  });

  runtime.startMission(0, 'restart-fixed-step');
  runtime.start();
  currentTime = 20;
  scheduledFrame(currentTime);
  assert.equal(updates.length, 0);
  assert.ok(runtime.simulationClock.snapshot().accumulatorSeconds > 0);

  runtime.startMission(0, 'restart-fixed-step');
  assert.equal(runtime.simulationClock.snapshot().accumulatorSeconds, 0);
  currentTime += 20;
  scheduledFrame(currentTime);
  assert.equal(updates.length, 0);
  currentTime += 14;
  scheduledFrame(currentTime);
  assert.equal(updates.length, 1);
});
