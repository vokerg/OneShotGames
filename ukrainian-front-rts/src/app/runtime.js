import { acquireBrowserStorage } from './browser-capabilities.js';
import { installGameMenu } from './menu-runtime.js';
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
  documentTarget = globalThis.document ?? null,
  windowTarget = globalThis.window ?? null,
  installMenu = installGameMenu,
}) {
  const simulationClock = createFixedStepClock({
    stepSeconds: simulationStepSeconds,
    maxFrameDeltaSeconds,
  });
  const pauseReasons = new Set();
  let lastFrameAt = now();
  let frameHandle = null;
  let menuRuntime = null;

  const resetClock = () => {
    simulationClock.reset();
    lastFrameAt = now();
  };

  const pause = (reason = 'manual') => {
    pauseReasons.add(reason);
    simulationClock.reset();
    return pauseReasons.size;
  };

  const resume = (reason = 'manual') => {
    pauseReasons.delete(reason);
    resetClock();
    return pauseReasons.size;
  };

  const isPaused = () => pauseReasons.size > 0;

  const startMission = (missionIndex, seed = simulationSeed) => {
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    game.start(missionIndex);
    resetClock();
    ui.setMission();
    ui.toast(`Mission deployed. First enemy assault in ${game.mission.waves.firstDelay} seconds.`);
  };

  const frame = (frameAt) => {
    const frameDeltaSeconds = Math.max(0, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;

    if (game.mission) {
      if (!isPaused()) {
        simulationClock.advance(frameDeltaSeconds, (stepSeconds) => game.update(stepSeconds));
      }
      renderer.render();
      ui.refresh();
    }

    frameHandle = requestFrame(frame);
  };

  const runtime = {
    startMission,
    pause,
    resume,
    isPaused,
    resetClock,
    start() {
      if (frameHandle !== null) return;
      if (!menuRuntime && documentTarget && windowTarget && typeof installMenu === 'function') {
        menuRuntime = installMenu({
          game,
          ui,
          runtime,
          storage: acquireBrowserStorage(windowTarget),
          documentTarget,
          windowTarget,
        });
      }
      resetClock();
      frameHandle = requestFrame(frame);
    },
    stop() {
      if (frameHandle !== null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      menuRuntime?.dispose();
      menuRuntime = null;
      pauseReasons.clear();
    },
    simulationClock,
  };

  return Object.freeze(runtime);
}
