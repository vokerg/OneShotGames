import { TEAM } from '../config.js';
import { updateObjectiveLibrary } from './objective-library.js';
import { unitsIncludingPassengers } from './transport-system.js';

function hasCompletedBuilding(game, type) {
  return game.buildings.some(
    (building) =>
      building.team === TEAM.UA && building.type === type && !building.underConstruction,
  );
}

function updateDonbasObjectives(game) {
  game.player.objectives[0] = game.player.mined >= 500;
  game.player.objectives[1] =
    hasCompletedBuilding(game, 'workshop') && hasCompletedBuilding(game, 'barracks');
  game.player.objectives[2] = !game.buildings.includes(game.ruHQ);
}

function updateZaporizhzhiaObjectives(game) {
  const roster = unitsIncludingPassengers(game);
  game.player.objectives[0] = game.player.intel >= 250;
  game.player.objectives[1] =
    roster.filter((unit) => unit.team === TEAM.UA && unit.type === 'uaDrone').length >= 4;
  game.player.objectives[2] =
    game.wave >= 4 &&
    !roster.some((unit) => unit.team === TEAM.RU && unit.type === 'ruArtillery');
}

function updateKhersonObjectives(game) {
  const roster = unitsIncludingPassengers(game);
  game.player.objectives[0] = ['uaZelenskyy', 'uaZaluzhnyi'].every((heroType) =>
    roster.some((unit) => unit.team === TEAM.UA && unit.type === heroType),
  );
  game.player.objectives[1] =
    game.wave >= game.mission.waves.maxWaves &&
    !roster.some((unit) => unit.team === TEAM.RU && unit.waveSpawned);
  game.player.objectives[2] = !game.buildings.includes(game.ruHQ);
}

const OBJECTIVE_UPDATERS = {
  donbas: updateDonbasObjectives,
  zaporizhzhia: updateZaporizhzhiaObjectives,
  kherson: updateKhersonObjectives,
};

export function updateMissionObjectives(game) {
  if (game.mission?.objectiveDefinitions?.length) return updateObjectiveLibrary(game);
  const updateObjectives = OBJECTIVE_UPDATERS[game.mission.id];
  if (!updateObjectives) {
    throw new Error(`No objective system registered for mission: ${game.mission.id}`);
  }
  updateObjectives(game);
  return null;
}
