import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  createTransportController,
  unitsIncludingPassengers,
} from '../../src/systems/transport-system.js';

function transportGame(units) {
  return {
    units,
    buildings: [],
    nodes: [],
    selected: new Set(),
    player: { pop: 0, upgrades: new Set() },
    unitStats(type) { return UNIT_TYPES[type]; },
    addUnit() { throw new Error('not used'); },
    issue() { return true; },
    removeDestroyedEntities() {},
    heroAlreadyFieldedOrQueued() { return false; },
  };
}

test('cargo-aware roster view is frozen and sorted by stable unit id', () => {
  const passenger = { id: 2, type: 'uaInfantry', team: TEAM.UA, hp: 100 };
  const transport = { id: 10, type: 'uaIfv', team: TEAM.UA, hp: 200, passengers: [passenger] };
  const active = { id: 1, type: 'uaMedic', team: TEAM.UA, hp: 80 };
  const game = transportGame([transport, active]);

  const roster = unitsIncludingPassengers(game);

  assert.deepEqual(roster.map((unit) => unit.id), [1, 2, 10]);
  assert.equal(Object.isFrozen(roster), true);
});

test('embarked command heroes remain fielded for uniqueness checks', () => {
  const hero = { id: 2, type: 'uaZelenskyy', team: TEAM.UA, hp: 100 };
  const transport = { id: 10, type: 'uaIfv', team: TEAM.UA, hp: 200, passengers: [hero] };
  const game = transportGame([transport]);

  const dispose = createTransportController(game);

  assert.equal(game.heroAlreadyFieldedOrQueued('uaZelenskyy'), true);
  assert.equal(game.heroAlreadyFieldedOrQueued('uaZaluzhnyi'), false);

  dispose();
  assert.equal(game.heroAlreadyFieldedOrQueued('uaZelenskyy'), false);
});
