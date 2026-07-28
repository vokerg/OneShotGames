import { TEAM } from '../config.js';

const WAVE_POOLS = [
  ['ruInfantry', 'ruInfantry', 'ruEngineer'],
  ['ruInfantry', 'ruIfv', 'ruMedic'],
  ['ruInfantry', 'ruDrone', 'ruTank'],
  ['ruInfantry', 'ruIfv', 'ruArtillery', 'ruTank'],
];

export function spawnEnemyWave(game) {
  game.wave += 1;
  const poolIndex = Math.min(WAVE_POOLS.length - 1, Math.floor((game.wave - 1) / 2));
  const unitTypes = WAVE_POOLS[poolIndex].slice();

  if (game.mission.id === 'kherson' && game.wave % 2 === 0) {
    unitTypes.push('ruTank', 'ruInfantry');
  }

  unitTypes.forEach((unitType, index) => {
    const unit = game.addUnit(
      unitType,
      TEAM.RU,
      game.ruHQ.x - 100 - index * 34,
      game.ruHQ.y + 100 + index * 24,
    );
    unit.order = { kind: 'attackMove', x: game.uaHQ.x, y: game.uaHQ.y };
  });
}
