import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMissionObjectives } from '../../src/systems/objective-system.js';

test('mission objective phase delegates authored objective definitions to the library', () => {
  const game = {
    time: 0,
    mission: {
      id: 'authored-objective-test',
      objectiveDefinitions: [
        { id: 'hold', type: 'survive', durationSeconds: 5 },
      ],
    },
    player: { objectives: [] },
    units: [],
    buildings: [],
    gameOver: false,
    finish(outcome, reason) {
      this.gameOver = true;
      this.outcome = outcome;
      this.endReason = reason;
    },
  };

  updateMissionObjectives(game);
  game.time = 5;
  const summary = updateMissionObjectives(game);
  assert.equal(summary.allRequiredComplete, true);
  assert.equal(game.outcome, 'victory');
  assert.deepEqual(game.player.objectives, [true]);
});

test('legacy missions still route through their registered objective updater', () => {
  const game = {
    mission: { id: 'donbas' },
    player: { mined: 500, objectives: [false, false, false] },
    buildings: [
      { type: 'workshop', team: 0, underConstruction: false },
      { type: 'barracks', team: 0, underConstruction: false },
    ],
    ruHQ: { id: 'removed' },
  };
  updateMissionObjectives(game);
  assert.deepEqual(game.player.objectives, [true, true, true]);
});
