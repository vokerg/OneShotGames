import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, WORLD } from '../../src/config.js';
import {
  createNavigationGrid,
  TERRAIN_TYPES,
} from '../../src/navigation/navigation-grid.js';
import { installConstructionPlacementInput } from '../../src/input/construction-placement-input.js';
import { installConstructionPreview } from '../../src/render/construction-preview.js';
import {
  CONSTRUCTION_ROTATIONS,
  PLACEMENT_REASONS,
  buildingNavigationBlocker,
  constructionFootprint,
  createConstructionPlacementController,
  evaluateConstructionPlacement,
  snapConstructionPlacement,
  supportsConstructionRotation,
} from '../../src/systems/construction-placement-system.js';

function createGameFixture(grid = createNavigationGrid({
  width: 12,
  height: 10,
  tileSize: WORLD.tile,
})) {
  const worker = {
    id: 1,
    type: 'uaEngineer',
    team: TEAM.UA,
    x: 48,
    y: 48,
    hp: 78,
    order: null,
    target: null,
  };
  const game = {
    missionIndex: 0,
    terrain: Array.from({ length: (WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile) }, () => 0),
    buildings: [],
    units: [worker],
    nodes: [],
    player: { metal: 500, fuel: 200, intel: 100 },
    selected: new Set([worker.id]),
    pendingBuild: null,
    pendingBuildPreview: null,
    lastError: '',
    nextId: 10,
    beginBuild(type) {
      this.pendingBuild = { type, workerId: worker.id };
      return true;
    },
    cancelBuild() {
      if (!this.pendingBuild) return false;
      this.pendingBuild = null;
      return true;
    },
    canPlaceBuilding() {
      return true;
    },
    placeBuilding() {
      return true;
    },
    canAfford(cost) {
      return Object.entries(cost || {}).every(([kind, amount]) => this.player[kind] >= amount);
    },
    pay(cost) {
      for (const [kind, amount] of Object.entries(cost || {})) this.player[kind] -= amount;
    },
    addBuilding(type, team, x, y, { underConstruction = false } = {}) {
      const building = {
        id: this.nextId++,
        type,
        team,
        x,
        y,
        hp: 80,
        maxHp: 680,
        underConstruction,
      };
      this.buildings.push(building);
      return building;
    },
    select(entity) {
      this.selected.clear();
      if (entity) this.selected.add(entity.id);
    },
    fail(message) {
      this.lastError = message;
      return false;
    },
  };
  return {
    game,
    grid,
    worker,
    synchronizeNavigation: () => ({ grid, revision: 1, signature: 'fixture' }),
  };
}

function evaluate(fixture, type, x, y, options = {}) {
  return evaluateConstructionPlacement(fixture.game, type, x, y, {
    workerId: fixture.worker.id,
    navigationState: fixture.synchronizeNavigation(),
    ...options,
  });
}

test('footprints snap to tiles and rotate only when dimensions change', () => {
  assert.deepEqual(constructionFootprint('depot', 0), { width: 3, height: 2 });
  assert.deepEqual(constructionFootprint('depot', 90), { width: 2, height: 3 });
  assert.equal(supportsConstructionRotation('depot'), true);
  assert.equal(supportsConstructionRotation('barracks'), false);
  assert.deepEqual(CONSTRUCTION_ROTATIONS, [0, 90]);

  const grid = createNavigationGrid({ width: 12, height: 10, tileSize: WORLD.tile });
  const snapped = snapConstructionPlacement(grid, 'depot', 207, 151, 0);
  assert.deepEqual(snapped.origin, { x: 5, y: 4 });
  assert.equal(snapped.x, 208);
  assert.equal(snapped.y, 160);
});

test('placement reports bounds, terrain, blocker, resource, and unit failures separately', () => {
  const fixture = createGameFixture();

  assert.equal(evaluate(fixture, 'depot', 5, 5).reason, PLACEMENT_REASONS.OUT_OF_BOUNDS);

  fixture.grid.setTerrain(6, 4, TERRAIN_TYPES.WATER);
  assert.equal(evaluate(fixture, 'depot', 208, 160).reason, PLACEMENT_REASONS.TERRAIN_BLOCKED);
  fixture.grid.setTerrain(6, 4, TERRAIN_TYPES.OPEN);

  fixture.grid.addDynamicBlocker('building:77', { x: 6, y: 4 }, { width: 1, height: 1 });
  const blockerResult = evaluate(fixture, 'depot', 208, 160);
  assert.equal(blockerResult.reason, PLACEMENT_REASONS.BUILDING_OVERLAP);
  assert.deepEqual(blockerResult.blockerIds, ['building:77']);
  fixture.grid.removeDynamicBlocker('building:77');

  fixture.game.nodes.push({ x: 208, y: 160, kind: 'metal', amount: 0 });
  assert.equal(evaluate(fixture, 'depot', 208, 160).reason, PLACEMENT_REASONS.RESOURCE_OVERLAP);
  fixture.game.nodes.length = 0;

  fixture.game.units.push({
    id: 2,
    type: 'uaInfantry',
    team: TEAM.UA,
    x: 208,
    y: 160,
    hp: 100,
  });
  assert.equal(evaluate(fixture, 'depot', 208, 160).reason, PLACEMENT_REASONS.UNIT_OVERLAP);
});

test('mud and rubble are accepted as deterministic flattening cells', () => {
  const fixture = createGameFixture();
  fixture.grid.setTerrain(5, 4, TERRAIN_TYPES.MUD);
  fixture.grid.setTerrain(6, 4, TERRAIN_TYPES.RUBBLE);

  const result = evaluate(fixture, 'depot', 208, 160);
  assert.equal(result.valid, true);
  assert.deepEqual(result.flattenCells, [
    { x: 5, y: 4 },
    { x: 6, y: 4 },
  ]);
});

test('placement requires a reachable perimeter approach for the assigned engineer', () => {
  const fixture = createGameFixture();
  for (const cell of [
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 0, y: 1 },
  ]) {
    fixture.grid.setTerrain(cell.x, cell.y, TERRAIN_TYPES.BLOCKED);
  }

  const result = evaluate(fixture, 'depot', 208, 160);
  assert.equal(result.valid, false);
  assert.equal(result.reason, PLACEMENT_REASONS.NO_ACCESS);
});

test('preview warns when a footprint severs a connected local route', () => {
  const grid = createNavigationGrid({
    width: 12,
    height: 6,
    tileSize: WORLD.tile,
    defaultTerrain: TERRAIN_TYPES.BLOCKED,
  });
  for (let y = 2; y <= 3; y += 1) {
    for (let x = 0; x < grid.width; x += 1) grid.setTerrain(x, y, TERRAIN_TYPES.OPEN);
  }
  const fixture = createGameFixture(grid);
  fixture.worker.x = 48;
  fixture.worker.y = 80;

  const result = evaluate(fixture, 'depot', 208, 96);
  assert.equal(result.valid, true);
  assert.equal(result.blocksPath, true);
  assert.match(result.warning, /severs/);
});

test('controller rotates, previews, places, flattens, charges, and records the authoritative footprint', () => {
  const fixture = createGameFixture();
  const dispose = createConstructionPlacementController(fixture.game, {
    synchronizeNavigation: fixture.synchronizeNavigation,
  });

  assert.equal(fixture.game.beginBuild('depot'), true);
  assert.equal(fixture.game.pendingBuild.rotation, 0);
  assert.equal(fixture.game.rotatePendingBuild(), 90);

  const preview = fixture.game.previewBuildingPlacement(208, 176);
  assert.equal(preview.valid, true);
  for (const cell of preview.flattenCells) {
    fixture.game.terrain[cell.y * (WORLD.w / WORLD.tile) + cell.x] = 2;
  }

  const metalBefore = fixture.game.player.metal;
  assert.equal(fixture.game.placeBuilding(208, 176), true);
  const building = fixture.game.buildings[0];
  assert.equal(fixture.game.player.metal, metalBefore - 100);
  assert.equal(building.rotation, 90);
  assert.deepEqual(building.placement.origin, preview.origin);
  assert.deepEqual(building.placement.footprint, { width: 2, height: 3 });
  assert.equal(building.underConstruction, true);
  assert.equal(fixture.worker.order.kind, 'construct');
  assert.equal(fixture.worker.order.target, building);
  assert.equal(fixture.game.pendingBuild, null);
  assert.equal(fixture.game.pendingBuildPreview, null);

  for (const cell of preview.flattenCells) {
    assert.equal(fixture.game.terrain[cell.y * (WORLD.w / WORLD.tile) + cell.x], 0);
  }

  assert.deepEqual(buildingNavigationBlocker(building), {
    id: `building:${building.id}`,
    origin: preview.origin,
    footprint: { width: 2, height: 3 },
    layers: ['ground', 'amphibious'],
  });

  dispose();
  assert.equal('rotatePendingBuild' in fixture.game, false);
});

test('rotation rejects square tile footprints with an actionable error', () => {
  const fixture = createGameFixture();
  createConstructionPlacementController(fixture.game, {
    synchronizeNavigation: fixture.synchronizeNavigation,
  });

  assert.equal(fixture.game.beginBuild('barracks'), true);
  assert.equal(fixture.game.rotatePendingBuild(), false);
  assert.match(fixture.game.lastError, /no alternate tile footprint/);
});

test('invalid placement preserves resources and pending construction state', () => {
  const fixture = createGameFixture();
  createConstructionPlacementController(fixture.game, {
    synchronizeNavigation: fixture.synchronizeNavigation,
  });

  fixture.game.beginBuild('depot');
  const metalBefore = fixture.game.player.metal;
  assert.equal(fixture.game.placeBuilding(4, 4), false);
  assert.equal(fixture.game.player.metal, metalBefore);
  assert.equal(fixture.game.buildings.length, 0);
  assert.equal(fixture.game.pendingBuild.type, 'depot');
  assert.match(fixture.game.lastError, /full footprint/);
});


test('rotation input consumes R only during an active construction placement', () => {
  const listeners = new Map();
  const windowTarget = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  const messages = [];
  const game = {
    pendingBuild: { type: 'depot' },
    lastError: '',
    rotatePendingBuild() {
      return 90;
    },
  };
  const dispose = installConstructionPlacementInput({
    game,
    windowTarget,
    ui: { toast: (message) => messages.push(message), refresh() {} },
  });
  let prevented = false;
  listeners.get('keydown')({
    key: 'r',
    repeat: false,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.deepEqual(messages, ['Construction footprint rotated to 90°.']);

  game.pendingBuild = null;
  listeners.get('keydown')({ key: 'r', repeat: false });
  assert.equal(messages.length, 1);
  dispose();
  assert.equal(listeners.has('keydown'), false);
});

test('render adapter refreshes and draws the latest placement preview after the base frame', () => {
  const calls = [];
  const context = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillText: () => calls.push('fillText'),
    measureText: (text) => ({ width: text.length * 6 }),
  };
  const preview = {
    valid: true,
    warning: '',
    message: 'ready',
    blocksPath: false,
    origin: { x: 3, y: 2 },
    footprint: { width: 3, height: 2 },
  };
  const game = {
    pendingBuild: { type: 'depot' },
    pendingBuildPreview: null,
    mouse: { wx: 120, wy: 90 },
    camera: { z: 1 },
    navigationState: { grid: { tileSize: 32 } },
    previewBuildingPlacement(x, y) {
      calls.push(`preview:${x}:${y}`);
      this.pendingBuildPreview = preview;
      return preview;
    },
  };
  const renderer = {
    x: context,
    sp: (x, y) => ({ x, y }),
    render: () => calls.push('base-render'),
  };
  const dispose = installConstructionPreview({ game, renderer });
  renderer.render();

  assert.equal(calls[0], 'preview:120:90');
  assert.ok(calls.indexOf('base-render') < calls.indexOf('fillRect'));
  assert.ok(calls.includes('strokeRect'));
  assert.ok(calls.includes('fillText'));
  dispose();
});
