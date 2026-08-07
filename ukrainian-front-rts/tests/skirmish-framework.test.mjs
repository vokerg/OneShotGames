import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DIFFICULTY_IDS } from '../src/ai/ai-difficulty-profiles.js';
import { BUILDING_TYPES, FACTIONS, TEAM, UNIT_TYPES } from '../src/config.js';
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

function enemyExpectedCapacity(game) {
  const maximum = 12 + game.buildings
    .filter((building) => building.team === TEAM.RU && building.hp > 0 && !building.underConstruction && building.capacityGranted !== false)
    .reduce((total, building) => total + (BUILDING_TYPES[building.type]?.pop ?? 0), 0);
  const fielded = game.units
    .filter((unit) => unit.team === TEAM.RU && unit.hp > 0)
    .reduce((total, unit) => total + (UNIT_TYPES[unit.type]?.pop ?? 0), 0);
  const queued = game.buildings
    .filter((building) => building.team === TEAM.RU && building.hp > 0)
    .flatMap((building) => building.queue ?? [])
    .reduce((total, item) => total + (UNIT_TYPES[item.type]?.pop ?? 0), 0);
  return { used: fielded + queued, maximum };
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
    assert.deepEqual(game.skirmishSnapshot().enemyCapacity, enemyExpectedCapacity(game));

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

test('AI workers must physically gather and return finite map resources before the AI wallet is credited', () => {
  const previousWidth = globalThis.innerWidth;
  const previousHeight = globalThis.innerHeight;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  const game = new Game();
  const dispose = installSkirmishFramework(game);
  try {
    const state = game.startSkirmish(DEFAULT_SKIRMISH_SETUP);
    const workers = game.units.filter((unit) => unit.team === TEAM.RU && unit.type === state.enemyFaction.workerType);
    assert.equal(workers.length, 2);
    workers[1].hp = 0;
    const worker = workers[0];
    const node = game.nodes
      .filter((candidate) => candidate.amount > 0)
      .sort((left, right) => Math.hypot(left.x - worker.x, left.y - worker.y) - Math.hypot(right.x - worker.x, right.y - worker.y))[0];
    const initialNodeAmount = node.amount;
    const initialWallet = { ...state.enemyResources };

    game.update(0.1);
    assert.equal(node.amount, initialNodeAmount, 'remote gathering must not remove resources');
    assert.deepEqual(state.enemyResources, initialWallet, 'remote gathering must not credit the AI wallet');

    worker.x = node.x;
    worker.y = node.y;
    worker.order = null;
    for (let index = 0; index < 24; index += 1) game.update(0.1);
    assert.ok(node.amount < initialNodeAmount, 'worker should gather only while physically at the site');
    assert.ok(worker.carry > 0, 'gathered resources stay on the worker until drop-off');
    assert.deepEqual(state.enemyResources, initialWallet, 'carried resources are not spendable before return');

    const carried = worker.carry;
    const carriedKind = worker.carryKind;
    worker.x = game.ruHQ.x;
    worker.y = game.ruHQ.y;
    game.update(0.1);
    assert.equal(worker.carry, 0);
    assert.ok(state.enemyResources[carriedKind] >= initialWallet[carriedKind] + carried);
    assert.ok(state.enemyGathered >= carried);
  } finally {
    dispose();
    if (previousWidth === undefined) delete globalThis.innerWidth;
    else globalThis.innerWidth = previousWidth;
    if (previousHeight === undefined) delete globalThis.innerHeight;
    else globalThis.innerHeight = previousHeight;
  }
});
