import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOVEMENT_LAYERS,
  NavigationGrid,
  TERRAIN_TYPES,
  createNavigationGridFromMapData,
} from '../../src/navigation/navigation-grid.js';

test('converts between world positions and deterministic grid cells', () => {
  const grid = new NavigationGrid({ width: 4, height: 3, tileSize: 32 });
  assert.deepEqual(grid.worldToCell(63, 95), { x: 1, y: 2 });
  assert.deepEqual(grid.cellToWorldCenter(1, 2), { x: 48, y: 80 });
  assert.equal(grid.index(3, 2), 11);
});

test('applies terrain passability and movement costs per layer', () => {
  const grid = new NavigationGrid({ width: 3, height: 2 });
  grid.setTerrain(1, 0, TERRAIN_TYPES.WATER);
  grid.setTerrain(2, 0, TERRAIN_TYPES.ROAD);

  assert.equal(grid.isPassable(1, 0), false);
  assert.equal(grid.isPassable(1, 0, { layer: MOVEMENT_LAYERS.AMPHIBIOUS }), true);
  assert.equal(grid.movementCost(2, 0), 0.75);
  assert.equal(grid.movementCost(1, 0, MOVEMENT_LAYERS.AIR), 1);
});

test('validates multi-cell footprints at boundaries and blocked terrain', () => {
  const grid = new NavigationGrid({ width: 4, height: 4 });
  grid.setTerrain(2, 2, TERRAIN_TYPES.BLOCKED);

  assert.equal(grid.isPassable(1, 1, { footprint: { width: 2, height: 2 } }), false);
  assert.throws(
    () => grid.isPassable(3, 3, { footprint: { width: 2, height: 1 } }),
    /outside the navigation grid/,
  );
});

test('tracks deterministic dynamic blockers by id and movement layer', () => {
  const grid = new NavigationGrid({ width: 5, height: 5 });
  grid.addDynamicBlocker('building-b', { x: 2, y: 2 }, { width: 2, height: 1 });
  grid.addDynamicBlocker('building-a', { x: 2, y: 2 });

  assert.deepEqual(grid.blockerIdsAt(2, 2), ['building-a', 'building-b']);
  assert.equal(grid.isPassable(2, 2), false);
  assert.equal(grid.isPassable(2, 2, { ignoreBlockerIds: ['building-a', 'building-b'] }), true);
  assert.equal(
    grid.isPassable(2, 2, { ignoreBlockerIds: new Set(['building-a', 'building-b']) }),
    true,
  );
  assert.equal(grid.isPassable(2, 2, { layer: MOVEMENT_LAYERS.AIR }), true);

  assert.equal(grid.removeDynamicBlocker('building-a'), true);
  assert.deepEqual(grid.blockerIdsAt(2, 2), ['building-b']);
  assert.equal(grid.isPassable(2, 2, { ignoreBlockerIds: ['building-b'] }), true);
  assert.equal(grid.isPassable(3, 2), false);
});

test('represents bridge cells as ground-passable terrain over water', () => {
  const grid = new NavigationGrid({ width: 3, height: 1 });
  grid.setTerrain(0, 0, TERRAIN_TYPES.WATER);
  grid.setTerrain(1, 0, TERRAIN_TYPES.BRIDGE);
  grid.setTerrain(2, 0, TERRAIN_TYPES.WATER);

  assert.equal(grid.isPassable(0, 0), false);
  assert.equal(grid.isPassable(1, 0), true);
  assert.equal(grid.isPassable(2, 0, { layer: MOVEMENT_LAYERS.AMPHIBIOUS }), true);
});

test('builds terrain, bridges, footprints, and blockers from map data', () => {
  const grid = createNavigationGridFromMapData({
    width: 4,
    height: 3,
    tileSize: 16,
    terrain: [
      { x: 0, y: 1, type: TERRAIN_TYPES.WATER },
      { x: 1, y: 1, type: TERRAIN_TYPES.WATER },
      { x: 2, y: 1, type: TERRAIN_TYPES.WATER },
    ],
    bridges: [{ x: 1, y: 1 }],
    blockers: [{
      id: 'hq',
      origin: { x: 2, y: 0 },
      footprint: { width: 2, height: 2 },
      layers: [MOVEMENT_LAYERS.GROUND],
    }],
  });

  assert.equal(grid.tileSize, 16);
  assert.equal(grid.getTerrain(1, 1), TERRAIN_TYPES.BRIDGE);
  assert.equal(grid.isPassable(0, 1), false);
  assert.equal(grid.isPassable(1, 1), true);
  assert.equal(grid.isPassable(2, 0), false);
  assert.equal(grid.isPassable(2, 0, { layer: MOVEMENT_LAYERS.AMPHIBIOUS }), true);
});

test('rejects malformed map data and blocker layers', () => {
  assert.throws(() => createNavigationGridFromMapData(null), /must be an object/);
  assert.throws(
    () => createNavigationGridFromMapData({ width: 2, height: 2, terrain: [{ x: 0, y: 0 }] }),
    /Terrain entries require/,
  );
  const grid = new NavigationGrid({ width: 2, height: 2 });
  assert.throws(() => grid.addDynamicBlocker('bad', { x: 0, y: 0 }, undefined, []), /non-empty array/);
  assert.throws(() => grid.blockerIdsAt(0, 0, 'naval'), /Unknown movement layer/);
});

test('produces stable snapshots independent of insertion order', () => {
  const grid = new NavigationGrid({ width: 2, height: 2 });
  grid.addDynamicBlocker('z', { x: 1, y: 1 });
  grid.addDynamicBlocker('a', { x: 0, y: 0 }, { width: 1, height: 1 }, [MOVEMENT_LAYERS.GROUND]);

  const snapshot = grid.snapshot();
  assert.deepEqual(snapshot.blockers.map((blocker) => blocker.id), ['a', 'z']);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.terrain), true);
  assert.equal(Object.isFrozen(snapshot.blockers[0].layers), true);
});
