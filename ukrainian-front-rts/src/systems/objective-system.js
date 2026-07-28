import { TEAM } from '../config.js';

function updateDonbasObjectives(game) {
  game.player.objectives[0] = game.player.mined >= 500;
  game.player.objectives[1] =
    game.buildings.some(
      (building) => building.team === TEAM.UA && building.type === 'workshop',
    ) &&
    game.buildings.some(
      (building) => building.team === TEAM.UA && building.type === 'barracks',
    );
  game.player.objectives[2] = !game.buildings.includes(game.ruHQ);
}

function updateZaporizhzhiaObjectives(game) {
  game.player.objectives[0] = game.player.intel >= 250;
  game.player.objectives[1] =
    game.units.filter((unit) => unit.team === TEAM.UA && unit.type === 'uaDrone').length >= 4;
  game.player.objectives[2] = !game.units.some(
    (unit) => unit.team === TEAM.RU && unit.type === 'ruArtillery',
  );
}

function updateKhersonObjectives(game) {
  game.player.objectives[0] = ['uaZelenskyy', 'uaZaluzhnyi'].every((heroType) =>
    game.units.some((unit) => unit.team === TEAM.UA && unit.type === heroType),
  );
  game.player.objectives[1] = game.wave >= 6;
  game.player.objectives[2] = !game.buildings.includes(game.ruHQ);
}

const OBJECTIVE_UPDATERS = {
  donbas: updateDonbasObjectives,
  zaporizhzhia: updateZaporizhzhiaObjectives,
  kherson: updateKhersonObjectives,
};

export function updateMissionObjectives(game) {
  const updateObjectives = OBJECTIVE_UPDATERS[game.mission.id];
  if (!updateObjectives) {
    throw new Error(`No objective system registered for mission: ${game.mission.id}`);
  }
  updateObjectives(game);
}
