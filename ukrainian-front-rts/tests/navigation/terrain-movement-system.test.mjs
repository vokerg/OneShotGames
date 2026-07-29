import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  MOVEMENT_LAYERS,
  NavigationGrid,
  TERRAIN_TYPES,
} from '../../src/navigation/navigation-grid.js';
import {
  RUNTIME_TERRAIN_RULES,
  roadCellsFromPolyline,
  runtimeNavigationTerrainData,
  runtimeTerrainEntries,
  scaleTerrainDisplacement,
  terrainMovementMultiplier,
  updateUnitWithTerrainMovement,
} from '../../src/systems/terrain-movement-system.js';

test('maps runtime terrain values to authored movement families', () => {
  assert.deepEqual(runtimeTerrainEntries([0, 1, 2, 3, 4], 5), [
    { x: 1, y: 0, type: TERRAIN_TYPES.MUD },
    { x: 2, y: 0, type: TERRAIN_TYPES.SHELTERBELT },
    { x: 3, y: 0, type: TERRAIN_TYPES.RUBBLE },
    { x: 4, y: 0, type: TERRAIN_TYPES.WATER },
  ]);
  assert.equal(RUNTIME_TERRAIN_RULES[TERRAIN_TYPES.ROAD].ground, 0.75);
  assert.equal(RUNTIME_TERRAIN_RULES[TERRAIN_TYPES.SHELTERBELT].ground, 1.15);
});

test('rasterizes visual road polylines into stable row-major cells', () => {
  const cells = roadCellsFromPolyline(
    [[0, 16], [96, 16]],
    { width: 4, height: 2, tileSize: 32, halfWidth: 17 },
  );
  assert.deepEqual(cells, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
  assert.equal(Object.isFrozen(cells), true);
  assert.throws(() => roadCellsFromPolyline([[0, Number.NaN]]), /finite x and y/);
});

test('combines runtime terrain, road, bridge, and shelterbelt inputs', () => {
  const game = {
    terrain: [0, 1, 2, 0],
    road: [[0, 16], [64, 16]],
    shelterbelts: [{ x: 3, y: 0 }],
    bridges: [{ x: 1, y: 1 }],
  };
  const data = runtimeNavigationTerrainData(game);
  assert.deepEqual(data.terrain, [
    { x: 1, y: 0, type: TERRAIN_TYPES.MUD },
    { x: 2, y: 0, type: TERRAIN_TYPES.SHELTERBELT },
  ]);
  assert.deepEqual(data.shelterbelts, [{ x: 3, y: 0 }]);
  assert.deepEqual(data.bridges, [{ x: 1, y: 1 }]);
  assert.ok(data.roads.some((cell) => cell.x === 0 && cell.y === 0));
});

test('derives per-layer terrain multipliers from the current cell', () => {
  const grid = new NavigationGrid({ width: 3, height: 1, tileSize: 32 });
  grid.setTerrain(0, 0, TERRAIN_TYPES.ROAD);
  grid.setTerrain(1, 0, TERRAIN_TYPES.MUD);
  grid.setTerrain(2, 0, TERRAIN_TYPES.WATER);

  assert.equal(
    terrainMovementMultiplier(grid, { x: 8, y: 8 }, { air: false }),
    1 / 0.75,
  );
  assert.equal(
    terrainMovementMultiplier(grid, { x: 40, y: 8 }, { air: false }),
    1 / 1.6,
  );
  assert.equal(
    terrainMovementMultiplier(grid, { x: 72, y: 8 }, { movementLayer: MOVEMENT_LAYERS.AMPHIBIOUS }),
    1 / 1.2,
  );
  assert.equal(
    terrainMovementMultiplier(grid, { x: 72, y: 8 }, { air: false }),
    0,
  );
  assert.equal(
    terrainMovementMultiplier(grid, { x: 72, y: 8 }, { air: true }),
    1,
  );
});

test('scales only physical displacement while preserving simulation time', () => {
  const grid = new NavigationGrid({ width: 3, height: 3, tileSize: 32 });
  grid.setTerrain(1, 1, TERRAIN_TYPES.MUD);
  const unit = {
    type: 'uaInfantry',
    team: TEAM.UA,
    x: 40,
    y: 40,
    order: { kind: 'move', x: 100, y: 40 },
    target: null,
    elapsed: 0,
  };
  const game = {
    unitStats: () => ({ air: false }),
    updateUnit(target, stepSeconds) {
      target.elapsed += stepSeconds;
      target.x += 16;
    },
  };

  const result = updateUnitWithTerrainMovement(game, unit, 0.5, grid);
  assert.equal(unit.elapsed, 0.5);
  assert.equal(unit.x, 50);
  assert.equal(unit.y, 40);
  assert.equal(unit.terrainMovementMultiplier, 1 / 1.6);
  assert.equal(result.displacement.moved, 16);
  assert.equal(result.displacement.adjusted, 10);
});

test('caps road acceleration at the target and clamps world bounds', () => {
  const unit = { x: 10, y: 10 };
  unit.x = 18;
  const result = scaleTerrainDisplacement(unit, { x: 10, y: 10 }, 2, {
    target: { x: 15, y: 10 },
    minX: 0,
    maxX: 20,
    minY: 0,
    maxY: 20,
  });
  assert.equal(unit.x, 15);
  assert.equal(result.adjusted, 5);

  unit.x = 19;
  scaleTerrainDisplacement(unit, { x: 15, y: 10 }, 3, {
    minX: 0,
    maxX: 20,
    minY: 0,
    maxY: 20,
  });
  assert.equal(unit.x, 20);
});
