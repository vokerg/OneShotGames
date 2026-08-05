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
  let lastFrameAt = now();
  let frameHandle = null;
  let paused = false;

  const startMission = (missionIndex, seed = simulationSeed) => {
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    game.start(missionIndex);
    simulationClock.reset();
    paused = false;
    ui.setMission();
    ui.toast(`Mission deployed. First enemy assault in ${game.mission.waves.firstDelay} seconds.`);
    lastFrameAt = now();
  };

  const frame = (frameAt) => {
    const frameDeltaSeconds = Math.max(0, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;

    if (game.mission) {
      if (!paused) simulationClock.advance(frameDeltaSeconds, (stepSeconds) => game.update(stepSeconds));
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

  const pause = () => {
    paused = true;
    return paused;
  };

  const resume = () => {
    paused = false;
    lastFrameAt = now();
    return paused;
  };

  const isPaused = () => paused;

  return { startMission, start, stop, pause, resume, isPaused, simulationClock };
}
