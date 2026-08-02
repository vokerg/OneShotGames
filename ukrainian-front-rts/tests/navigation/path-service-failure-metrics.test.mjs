import assert from 'node:assert/strict';
import test from 'node:test';

import { NavigationGrid } from '../../src/navigation/navigation-grid.js';
import { NavigationPathService } from '../../src/navigation/path-service.js';
import { PATH_STATUSES } from '../../src/navigation/pathfinder.js';

function center(grid, x, y) {
  return grid.cellToWorldCenter(x, y);
}

test('counts each executed failed search once without double-counting cache hits', () => {
  const grid = new NavigationGrid({ width: 10, height: 10 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);
  const start = center(grid, 0, 0);
  const destination = center(grid, 9, 9);
  const options = { maxVisited: 2 };

  const first = service.requestRoute(start, destination, options, { force: true });
  const cached = service.requestRoute(start, destination, options, { force: true });

  assert.equal(first.route.status, PATH_STATUSES.SEARCH_LIMIT);
  assert.equal(cached.cacheHit, true);
  assert.deepEqual(
    {
      searches: service.metrics().searches,
      failures: service.metrics().failures,
      cacheHits: service.metrics().cacheHits,
    },
    { searches: 1, failures: 1, cacheHits: 1 },
  );
});

test('successful searches leave the failure counter at zero', () => {
  const grid = new NavigationGrid({ width: 4, height: 2 });
  const service = new NavigationPathService();
  service.setGrid(grid, 1);

  const result = service.requestRoute(
    center(grid, 0, 0),
    center(grid, 3, 0),
    {},
    { force: true },
  );

  assert.equal(result.route.status, PATH_STATUSES.FOUND);
  assert.equal(service.metrics().searches, 1);
  assert.equal(service.metrics().failures, 0);
});
