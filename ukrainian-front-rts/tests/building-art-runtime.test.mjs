import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../src/config.js';
import { installBuildingArtPass } from '../src/render/building-art-pass.js';
import { installConstructionPreview } from '../src/render/construction-preview.js';
import {
  ACTIVE_BUILDING_ATLAS_IDS,
  buildingAtlasAnimationId,
  buildingAtlasScale,
  buildingAtlasStateForEntity,
  resolveBuildingAtlasId,
} from '../src/render/building-atlas-runtime.js';

test('active legacy buildings resolve to canonical faction atlas identities', () => {
  assert.equal(resolveBuildingAtlasId('hq', TEAM.UA), 'ua.command-post');
  assert.equal(resolveBuildingAtlasId('depot', TEAM.UA), 'ua.logistics-hub');
  assert.equal(resolveBuildingAtlasId('barracks', TEAM.UA), 'ua.infantry-center');
  assert.equal(resolveBuildingAtlasId('workshop', TEAM.UA), 'ua.motor-pool');
  assert.equal(resolveBuildingAtlasId('hq', TEAM.RU), 'ru.regimental-command');
  assert.equal(resolveBuildingAtlasId('depot', TEAM.RU), 'ru.supply-depot');
  assert.equal(resolveBuildingAtlasId('barracks', TEAM.RU), 'ru.motor-rifle-barracks');
  assert.equal(resolveBuildingAtlasId('workshop', TEAM.RU), 'ru.armored-park');
  assert.equal(resolveBuildingAtlasId('neutral-site', TEAM.UA), null);
  assert.equal(buildingAtlasAnimationId('workshop', TEAM.RU, 'damaged'), 'ru.armored-park.damaged');
  assert.equal(Object.keys(ACTIVE_BUILDING_ATLAS_IDS[TEAM.UA]).length, 4);
  assert.equal(Object.keys(ACTIVE_BUILDING_ATLAS_IDS[TEAM.RU]).length, 4);
});

test('building atlas presentation derives construction, activity, and damage states without mutation', () => {
  const construction = {
    hp: 120,
    maxHp: 1000,
    underConstruction: true,
    constructionProgress: { requiredWork: 100, appliedWork: 10 },
  };
  assert.equal(buildingAtlasStateForEntity(construction), 'foundation');
  construction.constructionProgress.appliedWork = 40;
  assert.equal(buildingAtlasStateForEntity(construction), 'frame');
  construction.constructionProgress.appliedWork = 80;
  assert.equal(buildingAtlasStateForEntity(construction), 'fitout');

  assert.equal(buildingAtlasStateForEntity({ hp: 1000, maxHp: 1000, queue: [{}] }), 'active');
  assert.equal(buildingAtlasStateForEntity({ hp: 600, maxHp: 1000, queue: [] }), 'damaged');
  assert.equal(buildingAtlasStateForEntity({ hp: 250, maxHp: 1000, queue: [] }), 'critical');
  assert.equal(buildingAtlasStateForEntity({ hp: 1000, maxHp: 1000, queue: [] }), 'idle');
  assert.equal(buildingAtlasStateForEntity({ hp: 0, maxHp: 1000 }), 'destruction');
  assert.equal(buildingAtlasStateForEntity({ hp: 1000, maxHp: 1000, buildingLifecycleState: { phase: 'rubble' } }), 'rubble');
  assert.equal(buildingAtlasScale({ w: 88 }, 1), 1);
});

test('building art pass draws canonical atlas animation while preserving fallback, selection, health, and rubble lifecycle', async () => {
  class Renderer {
    building(entity) { return `fallback-building:${entity?.type}`; }
    buildingWreck(entity) { return `fallback-wreck:${entity?.id}`; }
    health() { this.healthCalls = (this.healthCalls ?? 0) + 1; }
  }
  const fallbackBuilding = Renderer.prototype.building;
  const fallbackWreck = Renderer.prototype.buildingWreck;
  const draws = [];
  const runtime = {
    degraded: false,
    drawAnimation(_context, animationId, options) {
      draws.push({ animationId, options });
      return { frameId: `${animationId}.frame` };
    },
  };
  const installation = installBuildingArtPass(Renderer, {
    loadAtlases: async () => ({ ukraine: runtime, russia: runtime }),
  });
  await new Promise((resolve) => setImmediate(resolve));

  const renderer = Object.create(Renderer.prototype);
  renderer.g = { camera: { z: 1 }, time: 1, missionIndex: 0, mission: { id: 'test' } };
  const transforms = [];
  renderer.x = {
    strokeRect() {},
    save() { transforms.push('save'); },
    restore() { transforms.push('restore'); },
    translate(x, y) { transforms.push(['translate', x, y]); },
    rotate(radians) { transforms.push(['rotate', radians]); },
    lineWidth: 0,
    strokeStyle: '',
  };
  renderer.sp = (x, y) => ({ x: x + 10, y: y + 20 });

  const uaHq = {
    id: 7,
    type: 'hq',
    team: TEAM.UA,
    x: 100,
    y: 200,
    hp: 1500,
    maxHp: 1500,
    queue: [{}],
    selected: true,
  };
  const active = renderer.building(uaHq);
  assert.equal(active.frameId, 'ua.command-post.active.frame');
  assert.equal(draws[0].animationId, 'ua.command-post.active');
  assert.equal(renderer.healthCalls, 1);

  renderer.building({
    id: 9,
    type: 'depot',
    team: TEAM.UA,
    x: 120,
    y: 220,
    hp: 680,
    maxHp: 680,
    queue: [],
    selected: false,
  });
  assert.equal(renderer.healthCalls, 1, 'full-health unselected buildings should not add persistent health-bar clutter');

  assert.equal(
    renderer.building({ id: 8, type: 'unknown', team: TEAM.UA, x: 0, y: 0, hp: 1, maxHp: 1 }),
    'fallback-building:unknown',
  );

  const wreck = { id: '7:rubble', sourceEntityId: '7', position: { x: 100, y: 200 } };
  const destruction = renderer.buildingWreck(wreck);
  assert.equal(destruction.frameId, 'ua.command-post.destruction.frame');
  renderer.g.time = 1.5;
  const rubble = renderer.buildingWreck(wreck);
  assert.equal(rubble.frameId, 'ua.command-post.rubble.frame');

  assert.equal(renderer.buildingWreck({ id: 'unseen', sourceEntityId: '999', position: { x: 0, y: 0 } }), 'fallback-wreck:unseen');

  const rotated = renderer.drawBuildingAtlasPreview({
    type: 'depot',
    team: TEAM.UA,
    x: 140,
    y: 240,
    rotation: 90,
  }, { state: 'placement', alpha: 0.5 });
  assert.equal(rotated.frameId, 'ua.logistics-hub.placement.frame');
  assert.ok(transforms.some((entry) => Array.isArray(entry) && entry[0] === 'rotate' && Math.abs(entry[1] - Math.PI / 2) < 1e-9));
  assert.equal(draws.at(-1).animationId, 'ua.logistics-hub.placement');
  assert.equal(draws.at(-1).options.alpha, 0.5);

  installation.restore();
  assert.equal(Renderer.prototype.building, fallbackBuilding);
  assert.equal(Renderer.prototype.buildingWreck, fallbackWreck);
});


test('construction preview composes the atlas placement state over the authoritative footprint grid', () => {
  const atlasCalls = [];
  const context = {
    save() {}, restore() {}, fillRect() {}, strokeRect() {}, setLineDash() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
    measureText(text) { return { width: String(text).length * 7 }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
  };
  const preview = {
    valid: true,
    blocksPath: false,
    warning: '',
    message: '',
    type: 'workshop',
    rotation: 90,
    origin: { x: 10, y: 12 },
    footprint: { width: 3, height: 4 },
    x: 368,
    y: 448,
  };
  const game = {
    camera: { z: 1 },
    navigationState: { grid: { tileSize: 32 } },
    mouse: { wx: preview.x, wy: preview.y },
    pendingBuild: { type: 'workshop', rotation: 90 },
    pendingBuildPreview: preview,
    previewBuildingPlacement() { this.pendingBuildPreview = preview; return preview; },
  };
  const renderer = {
    x: context,
    sp(x, y) { return { x, y }; },
    render() {},
    drawBuildingAtlasPreview(building, options) { atlasCalls.push({ building, options }); },
  };
  const dispose = installConstructionPreview({ game, renderer });
  renderer.render();
  assert.equal(atlasCalls.length, 1);
  assert.deepEqual(atlasCalls[0].building, {
    type: 'workshop',
    team: TEAM.UA,
    x: preview.x,
    y: preview.y,
    rotation: 90,
  });
  assert.deepEqual(atlasCalls[0].options, { state: 'placement', alpha: 0.86 });
  dispose();
});
