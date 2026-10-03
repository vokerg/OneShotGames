import assert from 'node:assert/strict';
import test from 'node:test';
import { WORLD } from '../../src/config.js';
import { RUNTIME_TERRAIN_BY_VALUE } from '../../src/systems/terrain-movement-system.js';
import { battlefieldTerrainColor, drawBattlefieldTerrain, resourceDisplayLabel } from '../../src/render/battlefield-terrain.js';
import { createCommandCardIcon } from '../../src/ui/command-card-icons.js';

test('every authoritative runtime terrain has distinct presentation across all biomes', () => {
  assert.deepEqual(Object.values(RUNTIME_TERRAIN_BY_VALUE).sort(), ['blocked', 'mud', 'road', 'rubble', 'shelterbelt', 'water']);
  for (const region of ['donbas', 'zaporizhzhia', 'kherson']) {
    for (const [x, y] of [[0, 0], [1, 2]]) {
      const colors = [0, ...Object.keys(RUNTIME_TERRAIN_BY_VALUE).map(Number)].map(value => battlefieldTerrainColor(value, x, y, region));
      assert.equal(new Set(colors).size, 7, `${region}: road, water and ground must remain distinguishable`);
    }
  }
});

test('drawing uses current cells, bounds work to viewport, caches textures and leaves simulation untouched', () => {
  let canvases = 0;
  const images = [], rectangles = [];
  const context = { save() {}, restore() {}, fillRect(...args) { rectangles.push(args); }, drawImage(...args) { images.push(args); } };
  const terrain = Object.freeze(Array.from({ length: WORLD.w / WORLD.tile * WORLD.h / WORLD.tile }, (_, index) => index % 7));
  const game = Object.freeze({ terrain, camera: Object.freeze({ z: 1 }), mission: Object.freeze({ authored: true, region: 'donbas' }),
    bridges: Object.freeze([Object.freeze({ x: 1, y: 1 }), Object.freeze({ x: 70, y: 40 })]),
    worldPos: (x, y) => ({ x, y }) });
  const renderer = { g: game, x: context, c: { clientWidth: 64, clientHeight: 64, ownerDocument: {
    createElement: () => { canvases += 1; return { getContext: () => context }; },
  } }, sp: (x, y) => ({ x, y }), tree() {}, mapLabel() {} };
  drawBattlefieldTerrain(renderer);
  assert.equal(images.length, 4);
  assert.ok(rectangles.some(([x, y, width, height]) => x === 32 && y === 32 && width === 33 && height === 33), 'visible bridge deck follows its authored cell');
  assert.ok(!rectangles.some(([x, y]) => x === 70 * 32 && y === 40 * 32), 'offscreen bridges are culled');
  const allocated = canvases;
  drawBattlefieldTerrain(renderer);
  assert.equal(canvases, allocated, 'no tile texture allocation on subsequent frames');
  assert.equal(game.terrain, terrain);
  assert.equal(game.bridges.length, 2);
});

test('machine resource labels become player-facing text without changing identity', () => {
  const node = Object.freeze({ kind: 'metal', label: 'shelterbelt-materiel-cache' });
  assert.equal(resourceDisplayLabel(node), 'Materials');
  assert.equal(resourceDisplayLabel(node, 'uk'), 'Матеріали');
  assert.equal(node.label, 'shelterbelt-materiel-cache');
  assert.equal(resourceDisplayLabel({ kind: 'fuel', label: 'Fuel reserve' }), 'Fuel reserve');
});

test('common order icons have distinct silhouettes, independent of their color or marker', () => {
  const document = { createElementNS: (_ns, tag) => ({ tag, dataset: {}, attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; }, append(...nodes) { this.children.push(...nodes); } }) };
  const ids = ['stop', 'hold-position-order', 'attack-move', 'attack-ground', 'patrol', 'guard', 'follow', 'return-for-repair'];
  const glyphs = ids.map(id => createCommandCardIcon(document, { id, group: 'order' }).children.find(node => node.tag === 'path').attributes.d);
  assert.equal(new Set(glyphs).size, ids.length);
});
