import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NavigationGrid,
  TERRAIN_TYPES,
} from '../../src/navigation/navigation-grid.js';
import { PATH_STATUSES } from '../../src/navigation/pathfinder.js';
import {
  currentWaypoint,
  followWaypointRoute,
  requestWaypointRoute,
} from '../../src/navigation/waypoint-route.js';

function center(grid, x, y) {
  return grid.cellToWorldCenter(x, y);
}

test('converts a deterministic cell path into world-space waypoints', () => {
  const grid = new NavigationGrid({ width: 5, height: 3, tileSize: 32 });
  grid.setTerrain(2, 1, TERRAIN_TYPES.BLOCKED);

  const route = requestWaypointRoute(grid, center(grid, 0, 1), center(grid, 4, 1));

  assert.equal(route.status, PATH_STATUSES.FOUND);
  assert.deepEqual(route.destination, center(grid, 4, 1));
  assert.equal(route.waypoints.some((point) => grid.worldToCell(point.x, point.y).x === 2 && grid.worldToCell(point.x, point.y).y === 1), false);
  assert.deepEqual(route.waypoints.at(-1), center(grid, 4, 1));
});

test('reports a blocked destination without creating waypoints', () => {
  const grid = new NavigationGrid({ width: 3, height: 3 });
  grid.setTerrain(2, 2, TERRAIN_TYPES.BLOCKED);

  const route = requestWaypointRoute(grid, center(grid, 0, 0), center(grid, 2, 2));

  assert.equal(route.status, PATH_STATUSES.GOAL_BLOCKED);
  assert.deepEqual(route.waypoints, []);
  assert.equal(route.nextIndex, 0);
});

test('clamps formation destinations to the navigation world bounds', () => {
  const grid = new NavigationGrid({ width: 2, height: 2, tileSize: 32 });
  const route = requestWaypointRoute(grid, center(grid, 0, 0), { x: 999, y: -10 });

  assert.equal(route.status, PATH_STATUSES.FOUND);
  assert.equal(route.destination.x < 64, true);
  assert.equal(route.destination.y, 0);
  assert.deepEqual(route.goalCell, { x: 1, y: 0 });
});

test('advances one waypoint at a time and completes deterministically', () => {
  const grid = new NavigationGrid({ width: 4, height: 1, tileSize: 32 });
  const route = requestWaypointRoute(grid, center(grid, 0, 0), center(grid, 3, 0));
  const unit = { ...center(grid, 0, 0) };
  const visited = [];
  const moveToward = (subject, x, y) => {
    subject.x = x;
    subject.y = y;
    visited.push(`${x},${y}`);
    return true;
  };

  while (!followWaypointRoute(route, unit, 1 / 30, moveToward)) {
    assert.notEqual(currentWaypoint(route), null);
  }

  assert.equal(currentWaypoint(route), null);
  assert.equal(route.nextIndex, route.waypoints.length);
  assert.deepEqual(visited, route.waypoints.map(({ x, y }) => `${x},${y}`));
});

test('replacing an order starts a fresh route without mutating the previous route', () => {
  const grid = new NavigationGrid({ width: 5, height: 2, tileSize: 32 });
  const first = requestWaypointRoute(grid, center(grid, 0, 0), center(grid, 4, 0));
  followWaypointRoute(first, { ...center(grid, 0, 0) }, 1, () => true);

  const replacement = requestWaypointRoute(grid, center(grid, 1, 0), center(grid, 1, 1));

  assert.equal(first.nextIndex, 1);
  assert.equal(replacement.nextIndex, 0);
  assert.deepEqual(replacement.destination, center(grid, 1, 1));
});

test('preserves bounded-search failure details for runtime feedback', () => {
  const grid = new NavigationGrid({ width: 10, height: 10 });
  const route = requestWaypointRoute(grid, center(grid, 0, 0), center(grid, 9, 9), { maxVisited: 2 });

  assert.equal(route.status, PATH_STATUSES.SEARCH_LIMIT);
  assert.equal(route.visited, 2);
  assert.deepEqual(route.waypoints, []);
});
