import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import { updateMissionObjectives } from '../../src/systems/objective-system.js';

test('campaign roster objectives include living passengers stored inside transports', () => {
  const zelenskyy = { id: 1, type: 'uaZelenskyy', team: TEAM.UA, hp: 100 };
  const zaluzhnyi = { id: 2, type: 'uaZaluzhnyi', team: TEAM.UA, hp: 100 };
  const transport = {
    id: 10,
    type: 'uaIfv',
    team: TEAM.UA,
    hp: 200,
    passengers: [zaluzhnyi, zelenskyy],
  };
  const game = {
    mission: { id: 'kherson', waves: { maxWaves: 6 } },
    player: { objectives: [false, false, false] },
    units: [transport],
    buildings: [],
    selected: new Set(),
    ruHQ: { id: 99 },
    wave: 0,
  };

  updateMissionObjectives(game);

  assert.equal(game.player.objectives[0], true);
});

test('embarked enemy wave units still block wave-clear objectives', () => {
  const wavePassenger = { id: 4, type: 'ruInfantry', team: TEAM.RU, hp: 100, waveSpawned: true };
  const enemyTransport = {
    id: 20,
    type: 'ruIfv',
    team: TEAM.RU,
    hp: 200,
    passengers: [wavePassenger],
  };
  const game = {
    mission: { id: 'kherson', waves: { maxWaves: 6 } },
    player: { objectives: [false, false, false] },
    units: [enemyTransport],
    buildings: [],
    selected: new Set(),
    ruHQ: { id: 99 },
    wave: 6,
  };

  updateMissionObjectives(game);

  assert.equal(game.player.objectives[1], false);
});
