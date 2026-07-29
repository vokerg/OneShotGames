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
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
}) {
  let lastFrameAt = performance.now();
  let frameHandle = null;

  const startMission = (missionIndex, seed = simulationSeed) => {
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    game.start(missionIndex);
    ui.setMission();
    ui.toast(`Mission deployed. First enemy assault in ${game.mission.waves.firstDelay} seconds.`);
    lastFrameAt = performance.now();
  };

  const frame = (now) => {
    const dt = Math.min(0.033, (now - lastFrameAt) / 1000);
    lastFrameAt = now;

    if (game.mission) {
      game.update(dt);
      renderer.render();
      ui.refresh();
    }

    frameHandle = requestFrame(frame);
  };

  const start = () => {
    if (frameHandle !== null) return;
    lastFrameAt = performance.now();
    frameHandle = requestFrame(frame);
  };

  const stop = () => {
    if (frameHandle === null) return;
    cancelFrame(frameHandle);
    frameHandle = null;
  };

  return { startMission, start, stop };
}
