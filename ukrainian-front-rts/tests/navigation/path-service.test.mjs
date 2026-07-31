import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NavigationGrid,
  TERRAIN_TYPES,
} from '../../src/navigation/navigation-grid.js';
import {
  NavigationPathService,
  PATH_REQUEST_RESULTS,
} from '../../src/navigation/path-service.js';
import { PATH_STATUSES } from '../../src/navigation/pathfinder.js';

function center(grid, x, y) {
  return grid.cellToWorldCenter(x, y);
}

test('reuses cached route templates without sharing mutable waypoint progress', () => {
  const grid = new NavigationGrid({ width: 8, height: 4, tileSize: 32 });
  grid.setTerrain(3, 1, TERRAIN_TYPES.BLOCKED);
  const service = new NavigationPathService();
  service.setGrid(grid, 1);

  const first = service.requestRoute(
    center(grid, 0, 1),
    center(grid, 7, 1),
    {},
    { requestId: 'unit:1', tick: 1, force: true },
  );
  first.route.nextIndex = 2;
  const second = service.requestRoute(
    center(grid, 0, 1),
    center(grid, 7, 1),
    {},
    { requestId: 'unit:2', tick: 1, force: true },
  );

  assert.equal(first.status, PATH_REQUEST_RESULTS.READY);
  assert.equal(first.route.status, PATH_STATUSES.FOUND);
  assert.equal(second.cacheHit, true);
  assert.notEqual(first.route, second.route);
  assert.equal(second.route.nextIndex, 0);
  assert.equal(first.route.waypoints, second.route.waypoints);
  assert.equal(service.metrics().searches, 1);
  assert.equal(service.metrics().cacheHits, 1);
  assert.equal(service.metrics().cacheEntries, 1);
});

test('invalidates cached paths when the navigation grid revision changes', () => {
  const service = new NavigationPathService();
  const firstGrid = new NavigationGrid({ width: 5, height: 2 });
  const secondGrid = new NavigationGrid({ width: 5, height: 2 });
  const start = center(firstGrid, 0, 0);
  const destination = center(firstGrid, 4, 0);

  assert.equal(service.setGrid(firstGrid, 1), true);
  service.requestRoute(start, destination, {}, { force: true });
  assert.equal(service.setGrid(firstGrid, 1), false);
  assert.equal(service.setGrid(secondGrid, 2), true);
  const replacement = service.requestRoute(start, destination, {}, { force: true });

  assert.equal(replacement.cacheHit, false);
  assert.equal(service.revision, 2);
  assert.equal(service.metrics().invalidations, 1);
  assert.equal(service.metrics().searches, 2);
  assert.equal(service.metrics().revision, 2);
});

test('bounds repath frequency for an existing unit after invalidation', () => {
  const service = new NavigationPathService({ minRepathTicks: 4 });
  const firstGrid = new NavigationGrid({ width: 6, height: 2 });
  const secondGrid = new NavigationGrid({ width: 6, height: 2 });
  const start = center(firstGrid, 0, 0);
  const destination = center(firstGrid, 5, 0);

  service.setGrid(firstGrid, 1);
  service.requestRoute(start, destination, {}, {
    requestId: 'unit:7',
    tick: 10,
    force: true,
  });
  service.setGrid(secondGrid, 2);

  const throttled = service.requestRoute(start, destination, {}, {
    requestId: 'unit:7',
    tick: 12,
  });
  const ready = service.requestRoute(start, destination, {}, {
    requestId: 'unit:7',
    tick: 14,
  });

  assert.equal(throttled.status, PATH_REQUEST_RESULTS.THROTTLED);
  assert.equal(throttled.route, null);
  assert.equal(throttled.retryTick, 14);
  assert.equal(ready.status, PATH_REQUEST_RESULTS.READY);
  assert.equal(ready.route.status, PATH_STATUSES.FOUND);
  assert.equal(service.metrics().throttled, 1);
});

test('separates cache entries by footprint, blocker policy, and search bound', () => {
  const grid = new NavigationGrid({ width: 7, height: 3 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const start = center(grid, 0, 0);
  const destination = center(grid, 5, 0);

  service.requestRoute(start, destination, { maxVisited: 20 }, { force: true });
  service.requestRoute(start, destination, { maxVisited: 21 }, { force: true });
  service.requestRoute(start, destination, {
    footprint: { width: 2, height: 1 },
    maxVisited: 21,
  }, { force: true });
  service.requestRoute(start, destination, {
    ignoreBlockerIds: ['building:2', 'building:1'],
    maxVisited: 21,
  }, { force: true });
  const sortedBlockerHit = service.requestRoute(start, destination, {
    ignoreBlockerIds: ['building:1', 'building:2'],
    maxVisited: 21,
  }, { force: true });

  assert.equal(sortedBlockerHit.cacheHit, true);
  assert.equal(service.metrics().searches, 4);
  assert.equal(service.metrics().cacheHits, 1);
});

test('evicts the oldest cache entry when the configured bound is reached', () => {
  const grid = new NavigationGrid({ width: 8, height: 2 });
  const service = new NavigationPathService({ maxEntries: 2 });
  service.setGrid(grid, 1);
  const start = center(grid, 0, 0);

  service.requestRoute(start, center(grid, 2, 0), {}, { force: true });
  service.requestRoute(start, center(grid, 3, 0), {}, { force: true });
  service.requestRoute(start, center(grid, 4, 0), {}, { force: true });
  const evictedRequest = service.requestRoute(
    start,
    center(grid, 2, 0),
    {},
    { force: true },
  );

  assert.equal(evictedRequest.cacheHit, false);
  assert.equal(service.metrics().cacheEntries, 2);
  assert.equal(service.metrics().evictions, 2);
});

test('caches bounded failures and reports deterministic search counters', () => {
  const grid = new NavigationGrid({ width: 10, height: 10 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const options = { maxVisited: 2 };

  const first = service.requestRoute(
    center(grid, 0, 0),
    center(grid, 9, 9),
    options,
    { force: true },
  );
  const second = service.requestRoute(
    center(grid, 0, 0),
    center(grid, 9, 9),
    options,
    { force: true },
  );
  const metrics = service.metrics();

  assert.equal(first.route.status, PATH_STATUSES.SEARCH_LIMIT);
  assert.equal(second.cacheHit, true);
  assert.equal(metrics.searches, 1);
  assert.equal(metrics.totalVisited, 2);
  assert.equal(metrics.maxVisited, 2);
});

test('rejects malformed cache and cadence request options', () => {
  const grid = new NavigationGrid({ width: 4, height: 4 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const start = center(grid, 0, 0);
  const destination = center(grid, 3, 3);

  assert.throws(
    () => service.requestRoute(start, destination, { ignoreBlockerIds: 'building:1' }),
    /ignoreBlockerIds must be an array/,
  );
  assert.throws(
    () => service.requestRoute(start, destination, {}, { force: 1 }),
    /force must be a boolean/,
  );
});
