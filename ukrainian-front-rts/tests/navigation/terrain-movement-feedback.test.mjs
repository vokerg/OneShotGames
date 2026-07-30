import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOVEMENT_LAYERS,
  NavigationGrid,
  TERRAIN_MOVEMENT_BANDS,
  TERRAIN_TYPES,
  createNavigationGridFromMapData,
  movementBandForCost,
  terrainMovementProfile,
} from '../../src/navigation/navigation-grid.js';
import {
  TERRAIN_CURSOR_STATES,
  createTerrainCursorPresenter,
  terrainCursorFeedback,
} from '../../src/input/terrain-cursor-feedback.js';

test('defines deterministic movement profiles for every terrain family', () => {
  const road = terrainMovementProfile(TERRAIN_TYPES.ROAD);
  const mud = terrainMovementProfile(TERRAIN_TYPES.MUD);
  const rubble = terrainMovementProfile(TERRAIN_TYPES.RUBBLE);
  const water = terrainMovementProfile(TERRAIN_TYPES.WATER);
  const bridge = terrainMovementProfile(TERRAIN_TYPES.BRIDGE);
  const shelterbelt = terrainMovementProfile(TERRAIN_TYPES.SHELTERBELT);

  assert.equal(road.band, TERRAIN_MOVEMENT_BANDS.FAST);
  assert.equal(road.speedMultiplier, 1 / 0.75);
  assert.equal(mud.band, TERRAIN_MOVEMENT_BANDS.VERY_SLOW);
  assert.equal(rubble.band, TERRAIN_MOVEMENT_BANDS.SLOW);
  assert.equal(water.passable, false);
  assert.equal(water.speedMultiplier, 0);
  assert.equal(bridge.passable, true);
  assert.equal(shelterbelt.cost, 1.15);
  assert.equal(terrainMovementProfile(TERRAIN_TYPES.WATER, MOVEMENT_LAYERS.AMPHIBIOUS).passable, true);
  assert.equal(terrainMovementProfile(TERRAIN_TYPES.WATER, MOVEMENT_LAYERS.AIR).band, TERRAIN_MOVEMENT_BANDS.NORMAL);
});

test('classifies movement costs and rejects invalid values', () => {
  assert.equal(movementBandForCost(null), TERRAIN_MOVEMENT_BANDS.IMPASSABLE);
  assert.equal(movementBandForCost(0.8), TERRAIN_MOVEMENT_BANDS.FAST);
  assert.equal(movementBandForCost(1), TERRAIN_MOVEMENT_BANDS.NORMAL);
  assert.equal(movementBandForCost(1.2), TERRAIN_MOVEMENT_BANDS.SLOW);
  assert.equal(movementBandForCost(1.5), TERRAIN_MOVEMENT_BANDS.VERY_SLOW);
  assert.throws(() => movementBandForCost(0), /positive finite/);
});

test('applies authored terrain overlays in deterministic precedence order', () => {
  const grid = createNavigationGridFromMapData({
    width: 4,
    height: 2,
    tileSize: 16,
    terrain: [
      { x: 0, y: 0, type: TERRAIN_TYPES.WATER },
      { x: 1, y: 0, type: TERRAIN_TYPES.MUD },
      { x: 2, y: 0, type: TERRAIN_TYPES.RUBBLE },
    ],
    shelterbelts: [{ x: 1, y: 0 }, { x: 3, y: 0 }],
    roads: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    bridges: [{ x: 0, y: 0 }],
  });

  assert.equal(grid.getTerrain(0, 0), TERRAIN_TYPES.BRIDGE);
  assert.equal(grid.getTerrain(1, 0), TERRAIN_TYPES.ROAD);
  assert.equal(grid.getTerrain(2, 0), TERRAIN_TYPES.ROAD);
  assert.equal(grid.getTerrain(3, 0), TERRAIN_TYPES.SHELTERBELT);
  assert.deepEqual(grid.movementProfileAtWorld(55, 7), {
    terrain: TERRAIN_TYPES.SHELTERBELT,
    layer: MOVEMENT_LAYERS.GROUND,
    label: 'Shelterbelt',
    detail: 'Slightly reduced movement',
    cost: 1.15,
    passable: true,
    speedMultiplier: 1 / 1.15,
    band: TERRAIN_MOVEMENT_BANDS.SLOW,
    cell: { x: 3, y: 0 },
  });
});

test('cursor feedback reports selected-unit movement layer and blockers', () => {
  const grid = new NavigationGrid({ width: 3, height: 1, tileSize: 32 });
  grid.setTerrain(0, 0, TERRAIN_TYPES.ROAD);
  grid.setTerrain(1, 0, TERRAIN_TYPES.MUD);
  grid.setTerrain(2, 0, TERRAIN_TYPES.WATER);
  const game = {
    navigationState: { grid },
    selectedUnits: () => [{ type: 'uaInfantry' }],
  };

  const road = terrainCursorFeedback(game, { x: 10, y: 10 });
  assert.equal(road.state, TERRAIN_CURSOR_STATES.FAST);
  assert.equal(road.cursor, 'cell');
  assert.match(road.detail, /133%/);

  const mud = terrainCursorFeedback(game, { x: 40, y: 10 });
  assert.equal(mud.state, TERRAIN_CURSOR_STATES.VERY_SLOW);
  assert.equal(mud.cursor, 'wait');

  const water = terrainCursorFeedback(game, { x: 70, y: 10 });
  assert.equal(water.state, TERRAIN_CURSOR_STATES.BLOCKED);
  assert.equal(water.passable, false);

  game.selectedUnits = () => [{ type: 'uaDrone' }];
  const air = terrainCursorFeedback(game, { x: 70, y: 10 });
  assert.equal(air.state, TERRAIN_CURSOR_STATES.NORMAL);
  assert.equal(air.passable, true);
  assert.equal(air.detail, 'Air movement unaffected');

  grid.addDynamicBlocker('wreck', { x: 0, y: 0 });
  game.selectedUnits = () => [{ type: 'uaInfantry' }];
  const blockedRoad = terrainCursorFeedback(game, { x: 10, y: 10 });
  assert.equal(blockedRoad.state, TERRAIN_CURSOR_STATES.BLOCKED);
});

class FakeElement {
  constructor() {
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.removed = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  appendChild(child) {
    this.children.push(child);
  }

  remove() {
    this.removed = true;
  }
}

test('cursor presenter exposes visual text without overriding placement cursor priority', () => {
  const body = new FakeElement();
  const head = new FakeElement();
  const documentTarget = {
    body,
    head,
    createElement: () => new FakeElement(),
  };
  const canvas = new FakeElement();
  canvas.style.cursor = 'crosshair';
  const presenter = createTerrainCursorPresenter({ canvas, documentTarget, root: body, styleRoot: head });

  presenter.update({
    state: TERRAIN_CURSOR_STATES.SLOW,
    cursor: 'progress',
    label: 'Rubble',
    detail: 'Reduced pace · 74%',
  }, { x: 100, y: 80 });

  assert.equal(body.children.length, 1);
  assert.equal(head.children.length, 1);
  assert.equal(canvas.dataset.terrainCursor, TERRAIN_CURSOR_STATES.SLOW);
  assert.equal(canvas.style.cursor, 'crosshair');
  assert.equal(presenter.element.textContent, 'Rubble · Reduced pace · 74%');
  assert.equal(presenter.element.style.display, 'block');
  assert.equal(presenter.element.style.left, '116px');
  assert.equal(presenter.element.style.top, '98px');
  assert.match(presenter.styleElement.textContent, /body\.placing #game \{ cursor: copy !important; \}/);
  assert.match(presenter.styleElement.textContent, /body\.placing \.terrainCursorFeedback \{ display: none !important; \}/);

  presenter.clear();
  assert.equal(canvas.style.cursor, 'crosshair');
  assert.equal('terrainCursor' in canvas.dataset, false);
  assert.equal(presenter.element.style.display, 'none');

  presenter.dispose();
  assert.equal(presenter.element.removed, true);
  assert.equal(presenter.styleElement.removed, true);
});
