import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  createNavigationGridFromMapData,
} from '../../src/navigation/navigation-grid.js';
import {
  NavigationPathService,
  PATH_REQUEST_RESULTS,
} from '../../src/navigation/path-service.js';
import { PATH_STATUSES } from '../../src/navigation/pathfinder.js';
import {
  disembarkUnits,
  embarkUnits,
} from '../../src/systems/transport-system.js';
import { NAVIGATION_TORTURE_MAPS } from '../fixtures/navigation-torture-maps.js';

function gridFor(map) {
  return createNavigationGridFromMapData(map);
}

function center(grid, point) {
  return grid.cellToWorldCenter(point.x, point.y);
}

function routeCells(grid, route) {
  return route.waypoints.map((waypoint) => grid.worldToCell(waypoint.x, waypoint.y));
}

function assertFound(result) {
  assert.equal(result.status, PATH_REQUEST_RESULTS.READY);
  assert.equal(result.route.status, PATH_STATUSES.FOUND);
}

function routeFor(map, { requestId = map.id, tick = 1, force = true } = {}) {
  const grid = gridFor(map);
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const result = service.requestRoute(
    center(grid, map.start),
    center(grid, map.destination),
    {},
    { requestId, tick, force },
  );
  assertFound(result);
  return { grid, service, result, cells: routeCells(grid, result.route) };
}

function assertBoundedRoute(cells, map) {
  assert.ok(cells.length > 0);
  assert.ok(cells.length <= map.width * map.height);
  assert.equal(
    new Set(cells.map(({ x, y }) => `${x}:${y}`)).size,
    cells.length,
    'route must not oscillate through repeated cells',
  );
}

function unit(id, type, x, y, overrides = {}) {
  const stats = UNIT_TYPES[type];
  return {
    id,
    type,
    team: TEAM.UA,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    selected: false,
    order: null,
    target: null,
    ...overrides,
  };
}

function transportGame(units) {
  return {
    units,
    buildings: [],
    nodes: [],
    selected: new Set(),
    player: { pop: 12, upgrades: new Set() },
    unitStats(type) {
      return UNIT_TYPES[type];
    },
  };
}

function runTransportScenario() {
  const map = NAVIGATION_TORTURE_MAPS.transport;
  const grid = gridFor(map);
  const start = center(grid, map.transportStart);
  const exit = center(grid, map.transportExit);
  const pathService = new NavigationPathService();
  pathService.setGrid(grid, 1);
  const crossingRoute = pathService.requestRoute(start, exit, {}, {
    requestId: 'transport:crossing',
    tick: 1,
    force: true,
  });
  assertFound(crossingRoute);
  const crossingCells = routeCells(grid, crossingRoute.route);
  assertBoundedRoute(crossingCells, map);
  assert.deepEqual(
    crossingCells.filter((cell) => cell.x === map.crossing.x),
    [map.crossing],
  );

  const transport = unit(100, 'uaIfv', start.x, start.y);
  const passengers = [
    unit(3, 'uaInfantry', start.x + 8, start.y),
    unit(1, 'uaInfantry', start.x + 10, start.y + 4),
    unit(2, 'uaMedic', start.x + 6, start.y - 4),
  ];
  const game = transportGame([transport, ...passengers]);

  const embarked = embarkUnits(game, transport, [...passengers].reverse());
  assert.equal(embarked.ok, true);
  assert.deepEqual(transport.passengers.map((passenger) => passenger.id), [1, 2, 3]);

  transport.x = exit.x;
  transport.y = exit.y;
  const disembarked = disembarkUnits(game, transport, transport.passengers, { grid });
  assert.equal(disembarked.ok, true);

  const placements = game.units
    .filter((candidate) => candidate.id !== transport.id)
    .sort((left, right) => left.id - right.id)
    .map((candidate) => {
      const cell = grid.worldToCell(candidate.x, candidate.y);
      assert.equal(grid.isPassable(cell.x, cell.y), true);
      return { id: candidate.id, x: candidate.x, y: candidate.y, cell };
    });
  assert.equal(new Set(placements.map(({ x, y }) => `${x}:${y}`)).size, placements.length);
  return { crossingCells, placements };
}

test('bridge torture map forces every ground route through the authored crossing', () => {
  const map = NAVIGATION_TORTURE_MAPS.bridge;
  const { grid, service, cells } = routeFor(map);
  assertBoundedRoute(cells, map);

  const barrierCells = cells.filter((cell) => cell.x === map.crossing.x);
  assert.deepEqual(barrierCells, [map.crossing]);
  assert.equal(cells.some((cell) => grid.isPassable(cell.x, cell.y) === false), false);

  const cached = service.requestRoute(
    center(grid, map.start),
    center(grid, map.destination),
    {},
    { requestId: 'bridge:repeat', tick: 1, force: true },
  );
  assert.equal(cached.cacheHit, true);
  assert.deepEqual(routeCells(grid, cached.route), cells);
});

test('base-gate torture map funnels deterministic routes through its only opening', () => {
  const map = NAVIGATION_TORTURE_MAPS.baseGate;
  const forward = routeFor(map);
  const reverseMap = {
    ...map,
    id: 'base-gate-reverse',
    start: map.destination,
    destination: map.start,
  };
  const reverse = routeFor(reverseMap);

  assertBoundedRoute(forward.cells, map);
  assertBoundedRoute(reverse.cells, reverseMap);
  assert.deepEqual(
    forward.cells.filter((cell) => cell.x === map.crossing.x),
    [map.crossing],
  );
  assert.deepEqual(
    reverse.cells.filter((cell) => cell.x === map.crossing.x),
    [map.crossing],
  );
});

test('dense-group torture map produces stable bounded routes independent of request order', () => {
  const map = NAVIGATION_TORTURE_MAPS.denseGroup;

  function run(indices) {
    const grid = gridFor(map);
    const service = new NavigationPathService({ maxEntries: 64 });
    service.setGrid(grid, 1);
    const summaries = indices.map((index) => {
      const result = service.requestRoute(
        center(grid, map.starts[index]),
        center(grid, map.destinations[index]),
        {},
        { requestId: `dense:${index}`, tick: 1, force: true },
      );
      assertFound(result);
      const cells = routeCells(grid, result.route);
      assertBoundedRoute(cells, map);
      return { id: index, cells };
    });
    return {
      summaries: summaries.sort((left, right) => left.id - right.id),
      metrics: service.metrics(),
    };
  }

  const ids = Array.from({ length: map.starts.length }, (_, index) => index);
  const forward = run(ids);
  const reversed = run([...ids].reverse());

  assert.deepEqual(forward.summaries, reversed.summaries);
  assert.equal(forward.metrics.searches, 36);
  assert.equal(forward.metrics.failures, 0);
  assert.equal(forward.metrics.cacheEntries, 36);
});

test('transport torture map keeps crossing, embark, and disembark deterministic', () => {
  assert.deepEqual(runTransportScenario(), runTransportScenario());
});

test('destruction torture map invalidates the detour and recovers on the bounded retry tick', () => {
  const before = NAVIGATION_TORTURE_MAPS.destruction.before;
  const after = NAVIGATION_TORTURE_MAPS.destruction.after;
  const firstGrid = gridFor(before);
  const secondGrid = gridFor(after);
  const service = new NavigationPathService({ minRepathTicks: 4 });
  const start = center(firstGrid, before.start);
  const destination = center(firstGrid, before.destination);

  service.setGrid(firstGrid, 1);
  const blocked = service.requestRoute(start, destination, {}, {
    requestId: 'destruction:unit',
    tick: 10,
    force: true,
  });
  assertFound(blocked);
  const blockedCells = routeCells(firstGrid, blocked.route);
  assertBoundedRoute(blockedCells, before);
  assert.equal(
    blockedCells.some((cell) => cell.x === 8 && cell.y === 4),
    false,
  );

  service.setGrid(secondGrid, 2);
  const throttled = service.requestRoute(start, destination, {}, {
    requestId: 'destruction:unit',
    tick: 12,
  });
  const recovered = service.requestRoute(start, destination, {}, {
    requestId: 'destruction:unit',
    tick: 14,
  });

  assert.equal(throttled.status, PATH_REQUEST_RESULTS.THROTTLED);
  assert.equal(throttled.retryTick, 14);
  assertFound(recovered);
  const recoveredCells = routeCells(secondGrid, recovered.route);
  assertBoundedRoute(recoveredCells, after);
  assert.equal(
    recoveredCells.some((cell) => cell.x === 8 && cell.y === 4),
    true,
  );
  assert.equal(service.metrics().invalidations, 1);
  assert.equal(service.metrics().throttled, 1);
});

test('dynamic-construction torture map invalidates the direct route and uses the new gate', () => {
  const before = NAVIGATION_TORTURE_MAPS.construction.before;
  const after = NAVIGATION_TORTURE_MAPS.construction.after;
  const firstGrid = gridFor(before);
  const secondGrid = gridFor(after);
  const service = new NavigationPathService({ minRepathTicks: 4 });
  const start = center(firstGrid, before.start);
  const destination = center(firstGrid, before.destination);

  service.setGrid(firstGrid, 1);
  const direct = service.requestRoute(start, destination, {}, {
    requestId: 'construction:unit',
    tick: 20,
    force: true,
  });
  assertFound(direct);
  const directCells = routeCells(firstGrid, direct.route);
  assertBoundedRoute(directCells, before);
  assert.equal(
    directCells.some((cell) => cell.x === 8 && cell.y === 2),
    true,
  );

  service.setGrid(secondGrid, 2);
  const rebuilt = service.requestRoute(start, destination, {}, {
    requestId: 'construction:unit',
    tick: 24,
  });
  assertFound(rebuilt);
  const rebuiltCells = routeCells(secondGrid, rebuilt.route);
  assertBoundedRoute(rebuiltCells, after);
  assert.equal(rebuiltCells.some((cell) => cell.x === 8 && cell.y === 2), false);
  assert.deepEqual(
    rebuiltCells.filter((cell) => cell.x === after.crossing.x),
    [after.crossing],
  );
  assert.equal(service.metrics().invalidations, 1);
});
