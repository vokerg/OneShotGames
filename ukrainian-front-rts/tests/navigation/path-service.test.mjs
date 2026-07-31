import assert from 'node:assert/strict';
import test from 'node:test';

import { NavigationGrid } from '../../src/navigation/navigation-grid.js';
import { NavigationPathService, PATH_REQUEST_RESULTS } from '../../src/navigation/path-service.js';
import { PATH_STATUSES } from '../../src/navigation/pathfinder.js';

function center(grid, x, y) {
  return grid.cellToWorldCenter(x, y);
}

test('reuses immutable route templates without sharing route progress', () => {
  const grid = new NavigationGrid({ width: 8, height: 4, tileSize: 32 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const first = service.requestRoute(center(grid, 0, 1), center(grid, 7, 1), {}, { requestId: 'unit:1', tick: 1, force: true });
  first.route.nextIndex = 2;
  const second = service.requestRoute(center(grid, 0, 1), center(grid, 7, 1), {}, { requestId: 'unit:2', tick: 1, force: true });
  assert.equal(first.route.status, PATH_STATUSES.FOUND);
  assert.equal(second.cacheHit, true);
  assert.notEqual(first.route, second.route);
  assert.equal(second.route.nextIndex, 0);
  assert.equal(first.route.waypoints, second.route.waypoints);
  assert.equal(service.metrics().searches, 1);
});

test('invalidates cached paths on navigation revision changes', () => {
  const service = new NavigationPathService();
  const firstGrid = new NavigationGrid({ width: 5, height: 2 });
  const secondGrid = new NavigationGrid({ width: 5, height: 2 });
  service.setGrid(firstGrid, 1);
  service.requestRoute(center(firstGrid, 0, 0), center(firstGrid, 4, 0), {}, { force: true });
  service.setGrid(secondGrid, 2);
  const replacement = service.requestRoute(center(secondGrid, 0, 0), center(secondGrid, 4, 0), {}, { force: true });
  assert.equal(replacement.cacheHit, false);
  assert.equal(service.metrics().invalidations, 1);
  assert.equal(service.metrics().searches, 2);
});

test('bounds repath frequency per request id', () => {
  const grid = new NavigationGrid({ width: 6, height: 2 });
  const service = new NavigationPathService({ minRepathTicks: 4 });
  service.setGrid(grid, 1);
  service.requestRoute(center(grid, 0, 0), center(grid, 5, 0), {}, { requestId: 'unit:7', tick: 10, force: true });
  const throttled = service.requestRoute(center(grid, 0, 0), center(grid, 5, 0), {}, { requestId: 'unit:7', tick: 12 });
  const ready = service.requestRoute(center(grid, 0, 0), center(grid, 5, 0), {}, { requestId: 'unit:7', tick: 14 });
  assert.equal(throttled.status, PATH_REQUEST_RESULTS.THROTTLED);
  assert.equal(throttled.retryTick, 14);
  assert.equal(ready.status, PATH_REQUEST_RESULTS.READY);
});

test('uses deterministic bounded eviction and metrics', () => {
  const grid = new NavigationGrid({ width: 8, height: 2 });
  const service = new NavigationPathService({ maxEntries: 2 });
  service.setGrid(grid, 1);
  const start = center(grid, 0, 0);
  service.requestRoute(start, center(grid, 2, 0), {}, { force: true });
  service.requestRoute(start, center(grid, 3, 0), {}, { force: true });
  service.requestRoute(start, center(grid, 4, 0), {}, { force: true });
  const repeated = service.requestRoute(start, center(grid, 2, 0), {}, { force: true });
  assert.equal(repeated.cacheHit, false);
  assert.equal(service.metrics().cacheEntries, 2);
  assert.equal(service.metrics().evictions, 2);
});
