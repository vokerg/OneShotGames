import { TEAM } from '../config.js';

const WAVE_POOLS = {
  donbas: [
    ['ruInfantry', 'ruInfantry'],
    ['ruInfantry', 'ruEngineer', 'ruMedic'],
    ['ruInfantry', 'ruInfantry', 'ruIfv'],
    ['ruInfantry', 'ruDrone', 'ruIfv'],
    ['ruInfantry', 'ruTank', 'ruMedic'],
    ['ruInfantry', 'ruIfv', 'ruArtillery'],
    ['ruInfantry', 'ruTank', 'ruIfv', 'ruArtillery'],
  ],
  zaporizhzhia: [
    ['ruInfantry', 'ruDrone'],
    ['ruInfantry', 'ruInfantry', 'ruDrone'],
    ['ruInfantry', 'ruIfv', 'ruDrone'],
    ['ruInfantry', 'ruArtillery', 'ruMedic'],
    ['ruInfantry', 'ruTank', 'ruDrone'],
    ['ruInfantry', 'ruIfv', 'ruArtillery'],
    ['ruInfantry', 'ruTank', 'ruArtillery', 'ruDrone'],
  ],
  kherson: [
    ['ruInfantry', 'ruInfantry', 'ruMedic'],
    ['ruInfantry', 'ruIfv', 'ruEngineer'],
    ['ruInfantry', 'ruDrone', 'ruTank'],
    ['ruInfantry', 'ruIfv', 'ruArtillery'],
    ['ruInfantry', 'ruTank', 'ruTank', 'ruMedic'],
    ['ruInfantry', 'ruIfv', 'ruArtillery', 'ruTank', 'ruDrone'],
  ],
};

export function spawnEnemyWave(game) {
  const pools = WAVE_POOLS[game.mission.id] || WAVE_POOLS.donbas;
  const waveIndex = Math.min(pools.length - 1, game.wave);
  const unitTypes = pools[waveIndex];
  game.wave += 1;

  const spawned = unitTypes.map((unitType, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const unit = game.addUnit(
      unitType,
      TEAM.RU,
      game.ruHQ.x - 105 - column * 38,
      game.ruHQ.y + 95 + row * 42 + column * 10,
    );
    unit.waveSpawned = true;
    unit.waveId = game.wave;
    unit.order = { kind: 'attackMove', x: game.uaHQ.x, y: game.uaHQ.y };
    return unit;
  });

  return spawned;
}
