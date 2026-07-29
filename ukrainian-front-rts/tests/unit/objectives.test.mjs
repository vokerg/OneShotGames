import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import { updateMissionObjectives } from '../../src/systems/objective-system.js';

function baseGame(id) {
  return {
    mission: { id, waves: { maxWaves: 6 } },
    player: { mined: 0, intel: 0, objectives: [false, false, false] },
    units: [],
    buildings: [],
    wave: 0,
    ruHQ: { id: 'ru-hq' },
  };
}

test('Donbas objectives require mined materiel, completed facilities, and destroyed enemy HQ', () => {
  const game = baseGame('donbas');
  game.player.mined = 500;
  game.buildings.push(
    { team: TEAM.UA, type: 'workshop', underConstruction: false },
    { team: TEAM.UA, type: 'barracks', underConstruction: false },
  );

  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, true, true]);

  game.buildings[0].underConstruction = true;
  game.buildings.push(game.ruHQ);
  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, false, false]);
});

test('Zaporizhzhia objectives evaluate intelligence, drone count, and artillery clearance', () => {
  const game = baseGame('zaporizhzhia');
  game.player.intel = 250;
  game.wave = 4;
  game.units.push(...Array.from({ length: 4 }, () => ({ team: TEAM.UA, type: 'uaDrone' })));

  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, true, true]);

  game.units.push({ team: TEAM.RU, type: 'ruArtillery' });
  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, true, false]);
});

test('Kherson objectives require both heroes, cleared completed waves, and destroyed enemy HQ', () => {
  const game = baseGame('kherson');
  game.wave = 6;
  game.units.push(
    { team: TEAM.UA, type: 'uaZelenskyy' },
    { team: TEAM.UA, type: 'uaZaluzhnyi' },
  );

  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, true, true]);

  game.units.push({ team: TEAM.RU, type: 'ruInfantry', waveSpawned: true });
  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, false, true]);
});

test('objective evaluation fails clearly for an unregistered mission', () => {
  const game = baseGame('unknown-operation');
  assert.throws(
    () => updateMissionObjectives(game),
    /No objective system registered for mission: unknown-operation/,
  );
});
