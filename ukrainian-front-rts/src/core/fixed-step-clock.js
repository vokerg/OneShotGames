export const FIXED_SIMULATION_STEP_SECONDS = 1 / 30;
export const MAX_FRAME_DELTA_SECONDS = 0.25;

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
  return value;
}

export function createFixedStepClock({
  stepSeconds = FIXED_SIMULATION_STEP_SECONDS,
  maxFrameDeltaSeconds = MAX_FRAME_DELTA_SECONDS,
} = {}) {
  positiveFinite(stepSeconds, 'Fixed simulation step');
  positiveFinite(maxFrameDeltaSeconds, 'Maximum frame delta');
  if (maxFrameDeltaSeconds < stepSeconds) {
    throw new RangeError('Maximum frame delta must be at least one fixed simulation step.');
  }

  let accumulatorSeconds = 0;
  let tick = 0;
  const epsilon = stepSeconds * 1e-9;

  function reset() {
    accumulatorSeconds = 0;
    tick = 0;
  }

  function snapshot() {
    return Object.freeze({
      tick,
      stepSeconds,
      maxFrameDeltaSeconds,
      accumulatorSeconds,
      interpolationAlpha: accumulatorSeconds / stepSeconds,
    });
  }

  function advance(frameDeltaSeconds, step) {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds < 0) {
      throw new RangeError('Frame delta must be a non-negative finite number.');
    }
    if (typeof step !== 'function') throw new TypeError('Fixed-step callback must be a function.');

    const acceptedSeconds = Math.min(frameDeltaSeconds, maxFrameDeltaSeconds);
    accumulatorSeconds += acceptedSeconds;
    let steps = 0;

    while (accumulatorSeconds + epsilon >= stepSeconds) {
      step(stepSeconds, tick);
      accumulatorSeconds -= stepSeconds;
      if (Math.abs(accumulatorSeconds) <= epsilon) accumulatorSeconds = 0;
      tick += 1;
      steps += 1;
    }

    return Object.freeze({
      ...snapshot(),
      steps,
      acceptedSeconds,
      discardedSeconds: frameDeltaSeconds - acceptedSeconds,
    });
  }

  return Object.freeze({ advance, reset, snapshot });
}
