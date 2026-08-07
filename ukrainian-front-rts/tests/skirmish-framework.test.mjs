import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DIFFICULTY_IDS } from '../src/ai/ai-difficulty-profiles.js';
import { FACTIONS, TEAM } from '../src/config.js';
import { Game } from '../src/game.js';
import {
  DEFAULT_SKIRMISH_SETUP,
  normalizeSkirmishSetup,
  SKIRMISH_FACTIONS,
  SKIRMISH_MAPS,
  skirmishMissionForSetup,
} from '../src/skirmish/skirmish-config.js';
import { installSkirmishFramework } from '../src/skirmish/skirmish-runtime.js';

function resourceTotals(map) {
  return map.resources.reduce((totals, node) => {
    totals[node.kind] = (totals[node.kind] ?? 0) + node.amount;
    return totals;
  }, {});
}

test('skirmish catalog exposes three deterministic balanced maps and fair difficulty profiles', () => {
  assert.equal(SKIRMISH_MAPS.length, 3);
  assert.equal(new Set(SKIRMISH_MAPS.map((map) => map.id)).size, 3);
  for (const map of SKIRMISH_MAPS) {
    assert.equal(map.resources.length, 6);
    assert.deepEqual(Object.keys(resourceTotals(map)).sort(), ['fuel', 'intel', 'metal']);
    assert.ok(Math.hypot(map.playerStart.x - map.enemyStart.x, map.playerStart.y - map.enemyStart.y) > 1600);
  }
  assert.deepEqual(Object.keys(SKIRMISH_FACTIONS).sort(), ['russia', 'ukraine']);
  assert.deepEqual(AI_DIFFICULTY_IDS, ['recruit', 'regular', 'veteran', 'commander']);
});

test('skirmish setup derives the opposing faction and generic destruction victory contract', () => {
  const setup = normalizeSkirmishSetup({ playerFactionId: 'russia', difficultyId: 'veteran' });
  assert.equal(setup.opponentFactionId, 'ukraine');
  const mission = skirmishMissionForSetup(setup);
  assert.equal(mission.mode, 'skirmish');
  assert.equal(mission.waves.maxWaves, 0);
  assert.equal(mission.objectiveDefinitions[0].type, 'destroy');
  assert.equal(mission.objectiveDefinitions[0].target.team, TEAM.RU);
  assert.throws(() => normalizeSkirmishSetup({ playerFactionId: 'russia', opponentFactionId: 'russia' }), /different/);
  assert.throws(() => normalizeSkirmishSetup({ difficultyId: 'impossible' }), /difficulty/);
});

test('runtime starts a Russia-as-player skirmish without changing player-team ownership semantics', () => {
  const previousWidth = globalThis.innerWidth;
  const previousHeight = globalThis.innerHeight;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  const game = new Game();
  const dispose = installSkirmishFramework(game);
  try {
    const state = game.startSkirmish({
      ...DEFAULT_SKIRMISH_SETUP,
      playerFactionId: 'russia',
      opponentFactionId: 'ukraine',
      difficultyId: 'recruit',
    });
    assert.equal(game.mission.mode, 'skirmish');
    assert.equal(game.playerFactionId, 'russia');
    assert.equal(game.enemyFactionId, 'ukraine');
    assert.equal(FACTIONS[TEAM.UA].id, 'russia');
    assert.equal(FACTIONS[TEAM.RU].id, 'ukraine');
    assert.equal(game.mission.waves.maxWaves, 0);
    assert.equal(game.units.filter((unit) => unit.team === TEAM.UA).length, SKIRMISH_FACTIONS.russia.startingUnits.length);
    assert.equal(game.units.filter((unit) => unit.team === TEAM.RU).length, SKIRMISH_FACTIONS.ukraine.startingUnits.length);
    assert.ok(game.units.filter((unit) => unit.team === TEAM.UA).every((unit) => unit.type.startsWith('ru')));
    assert.ok(game.units.filter((unit) => unit.team === TEAM.RU).every((unit) => unit.type.startsWith('ua')));
    assert.deepEqual(state.enemyResources, DEFAULT_SKIRMISH_SETUP.startingResources);
    assert.equal(game.uaHQ.team, TEAM.UA);
    assert.equal(game.ruHQ.team, TEAM.RU);

    const barracks = game.buildings.find((building) => building.team === TEAM.UA && building.type === 'barracks');
    game.select(barracks);
    assert.equal(game.queue('ruInfantry'), true);
    assert.equal(barracks.queue.at(-1).type, 'ruInfantry');
    assert.equal(game.buildingCanProduce(barracks, 'uaInfantry'), false);
  } finally {
    dispose();
    if (previousWidth === undefined) delete globalThis.innerWidth;
    else globalThis.innerWidth = previousWidth;
    if (previousHeight === undefined) delete globalThis.innerHeight;
    else globalThis.innerHeight = previousHeight;
  }
  assert.equal(FACTIONS[TEAM.UA].id, 'ukraine');
  assert.equal(FACTIONS[TEAM.RU].id, 'russia');
});
