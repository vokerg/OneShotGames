import { TEAM, WORLD } from '../config.js';
import { clamp } from '../core/math.js';
import { updateConstructionProgress } from './construction-progress-runtime.js';
import { updateUnitsWithNavigation } from './navigation-movement-system.js';
import { updateMissionScriptObjectivePhase } from './mission-script-system.js';
import { updateProductionQueues } from './production-queue-system.js';
import { updateResearchQueues } from './research-queue-runtime.js';

function requirePositiveStep(stepSeconds) {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('Simulation step duration must be a positive finite number.');
  }
}

function advanceClock(game, stepSeconds) {
  game.time += stepSeconds;
}

function updateCamera(game, stepSeconds) {
  const pan = 400 * stepSeconds;
  if (game.keys.has('arrowup') || game.keys.has('w')) game.camera.y += pan;
  if (game.keys.has('arrowdown') || game.keys.has('s')) game.camera.y -= pan;
  if (game.keys.has('arrowleft') || game.keys.has('a')) game.camera.x += pan;
  if (game.keys.has('arrowright') || game.keys.has('d')) game.camera.x -= pan;
  game.camera.x = clamp(game.camera.x, innerWidth - WORLD.w * game.camera.z - 100, 100);
  game.camera.y = clamp(game.camera.y, innerHeight - WORLD.h * game.camera.z - 180, 100);
}

function updateUnits(game, stepSeconds) {
  updateUnitsWithNavigation(game, stepSeconds);
  updateConstructionProgress(game, stepSeconds);
}

function updateProjectiles(game, stepSeconds) {
  game.updateProjectiles(stepSeconds);
}

function updateProduction(game, stepSeconds) {
  game.researchProductionBusyBuildingIds = new Set(
    (game.buildings || [])
      .filter((building) => building.queue?.length && !building.productionPaused)
      .map((building) => building.id),
  );
  updateProductionQueues(game, stepSeconds);
}

function updateResearch(game, stepSeconds) {
  try {
    if (typeof game.updateResearch === 'function') game.updateResearch(stepSeconds);
    else updateResearchQueues(game, stepSeconds);
  } finally {
    delete game.researchProductionBusyBuildingIds;
  }
}

function updateWaves(game, stepSeconds) {
  game.updateWaves(stepSeconds);
}

function removeDestroyedEntities(game) {
  game.removeDestroyedEntities();
}

function updateObjectives(game, stepSeconds) {
  updateMissionScriptObjectivePhase(game, stepSeconds);
}

function resolveOutcome(game) {
  if (game.player.objectives.every(Boolean)) {
    game.finish('victory', 'All operational objectives are complete.');
    return;
  }

  const hasUkrainianForces = game.units.some((unit) => unit.team === TEAM.UA);
  const hasUkrainianStructures = game.buildings.some((building) => building.team === TEAM.UA);
  if (!hasUkrainianForces && !hasUkrainianStructures) {
    game.finish('defeat', 'All Ukrainian units and structures have been destroyed.');
  }
}

const PHASES = Object.freeze([
  Object.freeze({ id: 'clock', run: advanceClock }),
  Object.freeze({ id: 'camera', run: updateCamera }),
  Object.freeze({ id: 'units', run: updateUnits }),
  Object.freeze({ id: 'projectiles', run: updateProjectiles }),
  Object.freeze({ id: 'production', run: updateProduction }),
  Object.freeze({ id: 'research', run: updateResearch }),
  Object.freeze({ id: 'waves', run: updateWaves }),
  Object.freeze({ id: 'cleanup', run: removeDestroyedEntities }),
  Object.freeze({ id: 'objectives', run: updateObjectives }),
  Object.freeze({ id: 'outcome', run: resolveOutcome }),
]);

export const SIMULATION_PHASES = Object.freeze(PHASES.map((phase) => phase.id));

export function runSimulationStep(game, stepSeconds) {
  requirePositiveStep(stepSeconds);
  if (game.gameOver) return false;

  for (const phase of PHASES) phase.run(game, stepSeconds);
  return true;
}
