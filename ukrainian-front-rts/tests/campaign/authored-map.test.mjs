import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORED_MAP_FORMAT_VERSION,
  AuthoredMapValidationError,
  loadAuthoredMap,
  validateAuthoredMap,
} from '../../src/core/authored-map.js';

const baseMap = () => ({
  formatVersion: AUTHORED_MAP_FORMAT_VERSION,
  id: 'test-crossing',
  name: 'Test Crossing',
  width: 128,
  height: 96,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', m: 'mud', s: 'shelterbelt' },
    rows: ['....', '.m..', '.s..'],
  },
  starts: {
    player: [{ id: 'player-main', cell: { x: 0, y: 0 }, facing: 90 }],
    enemy: [{ id: 'enemy-main', cell: { x: 3, y: 2 }, facing: 270 }],
  },
});

test('loads a minimal versioned map with deterministic defaults', () => {
  const source = baseMap();
  const map = loadAuthoredMap(source);

  assert.deepEqual(map.grid, { width: 4, height: 3 });
  assert.equal(map.terrain.cells.length, 12);
  assert.equal(map.terrain.cells[5], 'mud');
  assert.equal(map.heights.cells.every((height) => height === 0), true);
  assert.deepEqual(map.passability, []);
  assert.deepEqual(map.resources, []);
  assert.equal(Object.isFrozen(map), true);
  assert.equal(Object.isFrozen(map.terrain.cells), true);
  assert.equal(Object.isFrozen(map.starts.player[0].cell), true);
  assert.equal(Object.isFrozen(source), false);
});

test('normalizes all authored feature families and navigation projection', () => {
  const source = {
    ...baseMap(),
    heights: { encoding: 'rows', rows: [[0, 0, 1, 1], [0, 1, 2, 1], [0, 0, 1, 0]] },
    passability: [{ cell: { x: 1, y: 1 }, layers: { ground: false, amphibious: true } }],
    roads: [{ id: 'supply-road', cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], metadata: { class: 'local' } }],
    water: [{ id: 'river', cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
    bridges: [{ id: 'north-bridge', cells: [{ x: 2, y: 1 }] }],
    props: [{
      id: 'warehouse',
      type: 'industrial-building',
      cell: { x: 0, y: 1 },
      footprint: { width: 2, height: 2 },
      blockingLayers: ['ground', 'amphibious'],
      metadata: { destructible: true },
    }],
    resources: [{ id: 'metal-yard', type: 'metal', cell: { x: 3, y: 0 }, amount: 500 }],
    regions: {
      extraction: { shape: 'rect', origin: { x: 0, y: 0 }, width: 2, height: 1 },
      bridgehead: { shape: 'polygon', points: [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 2 }] },
    },
    triggers: [{ id: 'reinforce-player', when: { timer: 20 }, actions: [{ type: 'reinforcement' }] }],
    metadata: { biome: 'floodplain', recommendedPlayers: 1 },
  };

  const map = loadAuthoredMap(source);

  assert.equal(map.terrain.cells[1 * 4 + 1], 'road');
  assert.equal(map.terrain.cells[0 * 4 + 2], 'water');
  assert.equal(map.terrain.cells[1 * 4 + 2], 'bridge');
  assert.deepEqual(map.navigation, {
    width: 4,
    height: 3,
    tileSize: 32,
    defaultTerrain: 'open',
    terrain: map.navigation.terrain,
    shelterbelts: [{ x: 1, y: 2 }],
    roads: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
    bridges: [{ x: 2, y: 1 }],
    blockers: [{
      id: 'warehouse',
      origin: { x: 0, y: 1 },
      footprint: { width: 2, height: 2 },
      layers: ['amphibious', 'ground'],
    }],
    passabilityOverrides: [{ cell: { x: 1, y: 1 }, layers: { amphibious: true, ground: false } }],
  });
  assert.equal(map.regions.bridgehead.points.length, 3);
  assert.equal(map.triggers[0].id, 'reinforce-player');
  assert.deepEqual(map.metadata, { biome: 'floodplain', recommendedPlayers: 1 });
});

test('accepts the legacy spawns alias but rejects ambiguous start definitions', () => {
  const legacy = baseMap();
  legacy.spawns = legacy.starts;
  delete legacy.starts;
  assert.deepEqual(loadAuthoredMap(legacy).starts.player[0].id, 'player-main');

  const ambiguous = baseMap();
  ambiguous.spawns = { neutral: [{ id: 'neutral', cell: { x: 1, y: 1 } }] };
  assert.match(validateAuthoredMap(ambiguous).join('\n'), /Define starts or spawns, not both/);
});

test('accepts the legacy decorations alias but rejects ambiguous prop definitions', () => {
  const legacy = baseMap();
  legacy.decorations = [{ id: 'tree-line', type: 'tree', cell: { x: 1, y: 2 } }];
  assert.equal(loadAuthoredMap(legacy).props[0].id, 'tree-line');

  const ambiguous = baseMap();
  ambiguous.props = [];
  ambiguous.decorations = [];
  assert.match(validateAuthoredMap(ambiguous).join('\n'), /Define props or decorations, not both/);
});

test('reports precise structural and bounds failures without mutating input', () => {
  const source = baseMap();
  source.width = 127;
  source.terrain.rows[1] = '.z';
  source.starts.player[0].cell = { x: 9, y: 0 };
  source.passability = [{ cell: { x: 0, y: 0 }, layers: { submarine: true } }];
  source.props = [{ id: 'edge', type: 'wall', cell: { x: 3, y: 2 }, footprint: { width: 2, height: 1 } }];
  const before = structuredClone(source);

  const errors = validateAuthoredMap(source);

  assert.deepEqual(source, before);
  assert.equal(errors.some((error) => error === 'width must be an exact multiple of tileSize.'), true);
  assert.equal(errors.some((error) => error.includes('terrain.rows[1]')), true);
  assert.equal(errors.some((error) => error.includes('starts.player[0].cell')), true);
  assert.equal(errors.some((error) => error.includes('unknown movement layer: submarine')), true);
  assert.equal(errors.some((error) => error.includes('props[0].footprint extends outside')), true);
});

test('requires bridge cells to overlap authored water', () => {
  const source = baseMap();
  source.water = [{ id: 'river', cells: [{ x: 1, y: 1 }] }];
  source.bridges = [{ id: 'bridge', cells: [{ x: 2, y: 1 }] }];

  assert.throws(
    () => loadAuthoredMap(source),
    (error) => error instanceof AuthoredMapValidationError && error.errors.some((message) => message.includes('must overlap authored water')),
  );
});

test('rejects duplicate IDs, invalid regions, and non-JSON trigger data', () => {
  const source = baseMap();
  source.resources = [
    { id: 'supply', type: 'metal', cell: { x: 0, y: 1 }, amount: 10 },
    { id: 'supply', type: 'fuel', cell: { x: 1, y: 1 }, amount: 10 },
  ];
  source.regions = { invalid: { shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } };
  source.triggers = [{ id: 'bad-trigger', callback() {} }];

  const errors = validateAuthoredMap(source);
  assert.equal(errors.some((error) => error.includes('duplicates resource id')), true);
  assert.equal(errors.some((error) => error.includes('at least three cells')), true);
  assert.equal(errors.some((error) => error.includes('triggers[0].callback must be JSON-compatible')), true);
});

test('produces canonical object-key order and identical snapshots for identical content', () => {
  const first = baseMap();
  first.metadata = { z: 1, a: { y: 2, b: 3 } };
  const second = baseMap();
  second.metadata = { a: { b: 3, y: 2 }, z: 1 };

  assert.equal(JSON.stringify(loadAuthoredMap(first)), JSON.stringify(loadAuthoredMap(second)));
});
