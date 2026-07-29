import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFixedStepClock,
  FIXED_SIMULATION_STEP_SECONDS,
  MAX_FRAME_DELTA_SECONDS,
} from '../../src/core/fixed-step-clock.js';

function drive(frameDeltas) {
  const clock = createFixedStepClock();
  const ticks = [];
  for (const frameDelta of frameDeltas) {
    clock.advance(frameDelta, (stepSeconds, tick) => ticks.push({ stepSeconds, tick }));
  }
  return { ticks, state: clock.snapshot() };
}

test('different render-frame chunking produces the same fixed simulation ticks', () => {
  const sixtyFps = drive(Array.from({ length: 60 }, () => 1 / 60));
  const tenFps = drive(Array.from({ length: 10 }, () => 0.1));
  const irregular = drive(Array.from({ length: 10 }, () => [0.07, 0.03]).flat());

  for (const result of [sixtyFps, tenFps, irregular]) {
    assert.equal(result.ticks.length, 30);
    assert.equal(result.state.tick, 30);
    assert.ok(Math.abs(result.state.accumulatorSeconds) < 1e-12);
    assert.ok(result.ticks.every((entry) => entry.stepSeconds === FIXED_SIMULATION_STEP_SECONDS));
    assert.deepEqual(
      result.ticks.map((entry) => entry.tick),
      Array.from({ length: 30 }, (_, index) => index),
    );
  }
});

test('reset clears partial frame time and restarts the deterministic tick index', () => {
  const clock = createFixedStepClock();
  clock.advance(FIXED_SIMULATION_STEP_SECONDS * 1.5, () => {});
  assert.equal(clock.snapshot().tick, 1);
  assert.ok(clock.snapshot().accumulatorSeconds > 0);

  clock.reset();
  assert.deepEqual(clock.snapshot(), {
    tick: 0,
    stepSeconds: FIXED_SIMULATION_STEP_SECONDS,
    maxFrameDeltaSeconds: MAX_FRAME_DELTA_SECONDS,
    accumulatorSeconds: 0,
    interpolationAlpha: 0,
  });
});

test('long frames are capped before they enter the simulation accumulator', () => {
  const clock = createFixedStepClock();
  let steps = 0;
  const result = clock.advance(1, () => {
    steps += 1;
  });

  assert.equal(result.acceptedSeconds, MAX_FRAME_DELTA_SECONDS);
  assert.equal(result.discardedSeconds, 1 - MAX_FRAME_DELTA_SECONDS);
  assert.equal(steps, 7);
  assert.equal(result.tick, 7);
  assert.ok(Math.abs(result.accumulatorSeconds - 1 / 60) < 1e-12);
});

test('invalid timing contracts fail before mutating clock state', () => {
  assert.throws(() => createFixedStepClock({ stepSeconds: 0 }), /positive finite/);
  assert.throws(
    () => createFixedStepClock({ stepSeconds: 0.1, maxFrameDeltaSeconds: 0.05 }),
    /at least one fixed simulation step/,
  );

  const clock = createFixedStepClock();
  assert.throws(() => clock.advance(-0.1, () => {}), /non-negative finite/);
  assert.throws(() => clock.advance(0.1, null), /callback/);
  assert.equal(clock.snapshot().tick, 0);
}
