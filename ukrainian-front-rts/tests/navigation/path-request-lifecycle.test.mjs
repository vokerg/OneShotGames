import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES, WORLD } from '../../src/config.js';
import { NavigationGrid } from '../../src/navigation/navigation-grid.js';
import {
  NavigationPathService,
  PATH_REQUEST_RESULTS,
} from '../../src/navigation/path-service.js';
import { updateUnitsWithNavigation } from '../../src/systems/navigation-movement-system.js';

function cellCenter(x, y) {
  return { x: x * WORLD.tile + WORLD.tile / 2, y: y * WORLD.tile + WORLD.tile / 2 };
}

test('prunes cadence state for request owners that are no longer retained', () => {
  const grid = new NavigationGrid({ width: 5, height: 2 });
  const service = new NavigationPathService({ minRepathTicks: 10 });
  service.setGrid(grid, 1);
  const start = grid.cellToWorldCenter(0, 0);
  const destination = grid.cellToWorldCenter(4, 0);

  service.requestRoute(start, destination, {}, {
    requestId: 'unit:1',
    tick: 1,
    force: true,
  });
  service.requestRoute(start, destination, {}, {
    requestId: 'unit:2',
    tick: 1,
    force: true,
  });

  assert.throws(
    () => service.retainRequests('unit:2'),
    /Retained path request ids must be an array/,
  );
  assert.equal(service.retainRequests(['unit:2']), 1);
  assert.equal(service.metrics().trackedRequests, 1);
  assert.equal(
    service.requestRoute(start, destination, {}, {
      requestId: 'unit:1',
      tick: 2,
    }).status,
    PATH_REQUEST_RESULTS.READY,
  );
  assert.equal(
    service.requestRoute(start, destination, {}, {
      requestId: 'unit:2',
      tick: 2,
    }).status,
    PATH_REQUEST_RESULTS.THROTTLED,
  );
});

test('runtime pruning removes cadence state when a unit leaves the roster', () => {
  const destination = cellCenter(8, 4);
  const unit = {
    id: 1,
    type: 'uaInfantry',
    team: TEAM.UA,
    ...cellCenter(0, 1),
    hp: UNIT_TYPES.uaInfantry.hp,
    order: { kind: 'move', ...destination },
    target: null,
  };
  const game = {
    missionIndex: 0,
    terrain: Array((WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile)).fill(0),
    buildings: [],
    units: [unit],
    lastError: '',
    unitStats(type) {
      return UNIT_TYPES[type];
    },
    updateUnit(subject) {
      subject.x = subject.order.x;
      subject.y = subject.order.y;
      subject.order = null;
    },
  };

  updateUnitsWithNavigation(game, 1 / 30);
  assert.equal(game.navigationState.pathService.metrics().trackedRequests, 1);

  game.units = [];
  updateUnitsWithNavigation(game, 1 / 30);

  assert.equal(game.navigationState.pathService.metrics().trackedRequests, 0);
});
