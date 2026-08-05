import {
  createFixedStepClock,
  FIXED_SIMULATION_STEP_SECONDS,
  MAX_FRAME_DELTA_SECONDS,
} from '../core/fixed-step-clock.js';
import {
  DEFAULT_SIMULATION_SEED,
  deriveSimulationSeed,
  setSimulationSeed,
} from '../core/random.js';

const DEFAULT_PAUSE_REASON = 'default';

function normalizePauseReason(reason) {
  if (reason === undefined) return DEFAULT_PAUSE_REASON;
  if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('Runtime pause reason must be a non-empty string.');
  return reason.trim();
}

export function createGameRuntime({
  game,
  renderer,
  ui,
  simulationSeed = DEFAULT_SIMULATION_SEED,
  simulationStepSeconds = FIXED_SIMULATION_STEP_SECONDS,
  maxFrameDeltaSeconds = MAX_FRAME_DELTA_SECONDS,
  now = () => performance.now(),
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
}) {
  const simulationClock = createFixedStepClock({
    stepSeconds: simulationStepSeconds,
    maxFrameDeltaSeconds,
  });
  const pauseReasons = new Set();
  let lastFrameAt = now();
  let frameHandle = null;

  const isPaused = () => pauseReasons.size > 0;
  const pauseReasonSnapshot = () => Object.freeze([...pauseReasons].sort());

  const startMission = (missionIndex, seed = simulationSeed) => {
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    game.start(missionIndex);
    simulationClock.reset();
    pauseReasons.clear();
    ui.setMission();
    ui.toast(`Mission deployed. First enemy assault in ${game.mission.waves.firstDelay} seconds.`);
    lastFrameAt = now();
  };

  const frame = (frameAt) => {
    const frameDeltaSeconds = Math.max(0, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;

    if (game.mission) {
      if (!isPaused()) simulationClock.advance(frameDeltaSeconds, (stepSeconds) => game.update(stepSeconds));
      renderer.render();
      ui.refresh();
    }

    frameHandle = requestFrame(frame);
  };

  const start = () => {
    if (frameHandle !== null) return;
    lastFrameAt = now();
    frameHandle = requestFrame(frame);
  };

  const stop = () => {
    if (frameHandle === null) return;
    cancelFrame(frameHandle);
    frameHandle = null;
  };

  const pause = (reason = DEFAULT_PAUSE_REASON) => {
    pauseReasons.add(normalizePauseReason(reason));
    return isPaused();
  };

  const resume = (reason = DEFAULT_PAUSE_REASON) => {
    pauseReasons.delete(normalizePauseReason(reason));
    if (!isPaused()) lastFrameAt = now();
    return isPaused();
  };

  return {
    startMission,
    start,
    stop,
    pause,
    resume,
    isPaused,
    pauseReasons: pauseReasonSnapshot,
    simulationClock,
  };
}
