import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, WORLD } from '../../src/config.js';
import {
  synchronizeNavigationGrid,
  updateUnitWithNavigation,
} from '../../src/systems/navigation-movement-system.js';

function cellCenter(x, y) {
  return { x: x * WORLD.tile + WORLD.tile / 2, y: y * WORLD.tile + WORLD.tile / 2 };
}

function makeGame({ buildings = [], unitType = 'uaInfantry', order = null } = {}) {
  const unit = {
    id: 1,
    type: unitType,
    team: TEAM.UA,
    ...cellCenter(0, 1),
    order,
    target: null,
  };
  return {
    missionIndex: 0,
    terrain: Array((WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile)).fill(0),
    buildings,
    units: [unit],
    lastError: '',
    updateUnit(subject) {
      if (subject.order?.kind === 'move' || subject.order?.kind === 'attackMove') {
        subject.x = subject.order.x;
        subject.y = subject.order.y;
        subject.order = null;
      }
    },
  };
}

function depot(id = 10) {
  return { id, type: 'depot', team: TEAM.RU, x: 80, y: 48, hp: 680 };
}

test('registers building footprints as deterministic dynamic blockers', () => {
  const game = makeGame({ buildings: [depot()] });
  const state = synchronizeNavigationGrid(game);

  assert.deepEqual(state.grid.blockerIdsAt(2, 1), ['building:10']);
  assert.equal(state.grid.isPassable(2, 1), false);
});

test('routes a ground move order around a building footprint', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'move', ...destination },
  });
  const unit = game.units[0];

  for (let step = 0; step < 20 && unit.order; step += 1) {
    updateUnitWithNavigation(game, unit, 1 / 30);
  }

  const route = unit.order?.navigationRoute ?? game.navigationState?.lastRoute;
  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
  assert.equal(game.lastError, '');
  assert.equal(route, undefined);
});

test('retains the route object while advancing intermediate waypoints', () => {
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'attackMove', ...cellCenter(5, 1) },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.equal(unit.order.kind, 'attackMove');
  assert.equal(unit.order.navigationRoute.nextIndex, 1);
  assert.equal(unit.order.navigationRoute.waypoints.length > 1, true);
  assert.equal(
    unit.order.navigationRoute.waypoints.some((point) => {
      const cell = game.navigationState.grid.worldToCell(point.x, point.y);
      return game.navigationState.grid.blockerIdsAt(cell.x, cell.y).length > 0;
    }),
    false,
  );
});

test('invalidates routes when a structure blocker is removed', () => {
  const game = makeGame({ buildings: [depot()] });
  const first = synchronizeNavigationGrid(game);
  game.buildings = [];
  const second = synchronizeNavigationGrid(game);

  assert.equal(second.revision, first.revision + 1);
  assert.deepEqual(second.grid.blockerIdsAt(2, 1), []);
});

test('cancels blocked player orders with actionable feedback', () => {
  const game = makeGame({
    buildings: [depot()],
    order: { kind: 'move', ...cellCenter(2, 1) },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.equal(unit.order, null);
  assert.equal(game.lastError, 'Destination is blocked.');
});

test('preserves direct movement behavior for air units', () => {
  const destination = cellCenter(5, 1);
  const game = makeGame({
    buildings: [depot()],
    unitType: 'uaDrone',
    order: { kind: 'move', ...destination },
  });
  const unit = game.units[0];

  updateUnitWithNavigation(game, unit, 1 / 30);

  assert.deepEqual({ x: unit.x, y: unit.y }, destination);
  assert.equal(unit.order, null);
});
