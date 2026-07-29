import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOVEMENT_LAYERS,
  NavigationGrid,
  TERRAIN_TYPES,
} from '../../src/navigation/navigation-grid.js';
import {
  DIAGONAL_POLICIES,
  PATH_STATUSES,
  findPath,
} from '../../src/navigation/pathfinder.js';

function cells(path) {
  return path.map(({ x, y }) => `${x},${y}`);
}

test('finds the only deterministic route through a corridor fixture', () => {
  const grid = new NavigationGrid({
    width: 7,
    height: 5,
    defaultTerrain: TERRAIN_TYPES.BLOCKED,
  });
  for (let x = 0; x < 7; x += 1) grid.setTerrain(x, 2, TERRAIN_TYPES.OPEN);

  const route = findPath(grid, { x: 0, y: 2 }, { x: 6, y: 2 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });

  assert.equal(route.status, PATH_STATUSES.FOUND);
  assert.deepEqual(cells(route.path), ['0,2', '1,2', '2,2', '3,2', '4,2', '5,2', '6,2']);
  assert.equal(route.cost, 6);
});

test('reports blocked goals without searching', () => {
  const grid = new NavigationGrid({ width: 4, height: 4 });
  grid.setTerrain(3, 3, TERRAIN_TYPES.BLOCKED);

  const route = findPath(grid, { x: 0, y: 0 }, { x: 3, y: 3 });

  assert.equal(route.status, PATH_STATUSES.GOAL_BLOCKED);
  assert.deepEqual(route.path, []);
  assert.equal(route.visited, 0);
});

test('uses terrain cost to prefer a longer but cheaper road route', () => {
  const grid = new NavigationGrid({ width: 5, height: 3 });
  for (let x = 1; x < 4; x += 1) grid.setTerrain(x, 1, TERRAIN_TYPES.MUD);
  for (let x = 0; x < 5; x += 1) grid.setTerrain(x, 0, TERRAIN_TYPES.ROAD);

  const route = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });

  assert.equal(route.status, PATH_STATUSES.FOUND);
  assert.equal(route.path.some((cell) => cell.y === 0), true);
  assert.equal(route.cost < 5.8, true);
});

test('makes diagonal corner-cutting policy explicit', () => {
  const grid = new NavigationGrid({ width: 2, height: 2 });
  grid.setTerrain(1, 0, TERRAIN_TYPES.BLOCKED);
  grid.setTerrain(0, 1, TERRAIN_TYPES.BLOCKED);

  const allowed = findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 }, {
    diagonalPolicy: DIAGONAL_POLICIES.ALLOW,
  });
  const guarded = findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NO_CORNER_CUT,
  });

  assert.equal(allowed.status, PATH_STATUSES.FOUND);
  assert.equal(allowed.path.length, 2);
  assert.equal(guarded.status, PATH_STATUSES.UNREACHABLE);
});

test('returns a deterministic search-limit result when the bound is exhausted', () => {
  const grid = new NavigationGrid({ width: 10, height: 10 });
  const route = findPath(grid, { x: 0, y: 0 }, { x: 9, y: 9 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
    maxVisited: 3,
  });

  assert.equal(route.status, PATH_STATUSES.SEARCH_LIMIT);
  assert.equal(route.visited, 3);
  assert.deepEqual(route.path, []);
});

test('breaks equal-cost ties consistently by coordinate order', () => {
  const grid = new NavigationGrid({ width: 5, height: 3 });
  grid.setTerrain(2, 1, TERRAIN_TYPES.BLOCKED);

  const first = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });
  const second = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 }, {
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });

  assert.deepEqual(cells(first.path), cells(second.path));
  assert.equal(first.path.some((cell) => cell.y === 0), true);
});

test('honors multi-cell footprints and movement layers', () => {
  const grid = new NavigationGrid({ width: 5, height: 5 });
  for (let y = 0; y < 5; y += 1) {
    grid.setTerrain(2, y, TERRAIN_TYPES.WATER);
  }
  grid.setTerrain(2, 2, TERRAIN_TYPES.BRIDGE);

  const wideGround = findPath(grid, { x: 0, y: 1 }, { x: 3, y: 1 }, {
    footprint: { width: 2, height: 2 },
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });
  const amphibious = findPath(grid, { x: 0, y: 1 }, { x: 3, y: 1 }, {
    layer: MOVEMENT_LAYERS.AMPHIBIOUS,
    footprint: { width: 2, height: 2 },
    diagonalPolicy: DIAGONAL_POLICIES.NEVER,
  });

  assert.equal(wideGround.status, PATH_STATUSES.UNREACHABLE);
  assert.equal(amphibious.status, PATH_STATUSES.FOUND);
});

test('handles the trivial start-equals-goal path', () => {
  const grid = new NavigationGrid({ width: 2, height: 2 });
  const route = findPath(grid, { x: 1, y: 1 }, { x: 1, y: 1 });
  assert.equal(route.status, PATH_STATUSES.FOUND);
  assert.deepEqual(cells(route.path), ['1,1']);
  assert.equal(route.cost, 0);
});
