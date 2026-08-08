import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TEAM } from '../src/config.js';
import { installUkrainianVehicleArtPass } from '../src/render/ukrainian-vehicle-art-pass.js';
import { validateSpriteAtlasManifest } from '../src/render/sprite-atlas-manifest.js';
import {
  generateUkrainianVehicleAtlas,
  UKRAINIAN_VEHICLE_DIRECTIONS,
  UKRAINIAN_VEHICLE_REQUIRED_STATES,
} from '../src/render/ukrainian-vehicle-atlas-generator.js';
import {
  resolveUkrainianVehicleAtlasUnitId,
  UKRAINIAN_VEHICLE_UNIT_IDS,
  ukrainianVehicleAnimationId,
  ukrainianVehicleIconFrameId,
  ukrainianVehiclePortraitFrameId,
} from '../src/render/ukrainian-vehicle-atlas.js';

const sourceUrl = new URL('../art-src/units/ukraine/vehicles/ukrainian-vehicle-source.json', import.meta.url);
const PRODUCTION_STATE_FRAMES = Object.freeze({ idle: 2, move: 4, attack: 3, hit: 2, damaged: 2, death: 6, wreck: 2 });
const UKRAINIAN_ART_BIBLE_PALETTE = Object.freeze({
  ink: '#111512',
  deep: '#18271f',
  shadow: '#293c30',
  base: '#50684c',
  light: '#81956a',
  metal: '#9aa291',
  accent: '#e4ca54',
  optic: '#4e8db2',
});

async function source() {
  return JSON.parse(await readFile(sourceUrl, 'utf8'));
}

test('Ukrainian vehicle atlas source matches the Ukrainian production family and required vehicle identities', async () => {
  const input = await source();
  assert.equal(input.units.length, 5);
  assert.deepEqual(input.units.map((unit) => unit.id), UKRAINIAN_VEHICLE_UNIT_IDS);
  assert.deepEqual(input.directions, UKRAINIAN_VEHICLE_DIRECTIONS);
  assert.deepEqual(Object.keys(input.states), UKRAINIAN_VEHICLE_REQUIRED_STATES);
  assert.deepEqual(Object.fromEntries(Object.entries(input.states).map(([state, definition]) => [state, definition.frames])), PRODUCTION_STATE_FRAMES);
  assert.deepEqual(Object.fromEntries(Object.keys(UKRAINIAN_ART_BIBLE_PALETTE).map((token) => [token, input.paletteTokens[token]])), UKRAINIAN_ART_BIBLE_PALETTE);
  assert.ok(Object.values(input.states).every((definition) => definition.durationsMs.every((duration) => Number.isInteger(duration) && duration > 0)));
  assert.ok(Object.values(input.states).every((definition) => ['loop', 'once', 'hold'].includes(definition.loop)));
  assert.equal(input.provenance.license, 'CC0-1.0');
  assert.equal(input.provenance.redistribution, 'allowed');
  assert.deepEqual(input.provenance.externalInputs, []);
  assert.deepEqual(input.provenance.publicFigures, []);
});

test('Ukrainian vehicle generator is deterministic and emits validated directional lifecycle animations, portraits, and icons', async () => {
  const input = await source();
  const generated = generateUkrainianVehicleAtlas(input);
  const repeated = generateUkrainianVehicleAtlas(input);
  assert.equal(generated.svg, repeated.svg);
  assert.deepEqual(generated.manifestObject, repeated.manifestObject);
  assert.deepEqual(generated.catalogObject, repeated.catalogObject);
  const manifest = validateSpriteAtlasManifest(generated.manifestObject, { source: 'Ukrainian vehicle generated atlas' });
  assert.equal(generated.catalogObject.frameCount, 851);
  assert.equal(generated.catalogObject.animationCount, 35);
  assert.equal(Object.keys(manifest.frames).length, 851);
  assert.equal(Object.keys(manifest.animations).length, 35);
  assert.ok(generated.svg.startsWith('<svg'));
  assert.ok(generated.svg.length > 180000);

  for (const unitId of UKRAINIAN_VEHICLE_UNIT_IDS) {
    assert.ok(manifest.frames[ukrainianVehiclePortraitFrameId(unitId)]);
    assert.ok(manifest.frames[ukrainianVehicleIconFrameId(unitId)]);
    for (const state of UKRAINIAN_VEHICLE_REQUIRED_STATES) {
      const animation = manifest.animations[ukrainianVehicleAnimationId(unitId, state)];
      assert.ok(animation, `${unitId}/${state} animation missing`);
      assert.deepEqual(Object.keys(animation.directions).sort(), [...UKRAINIAN_VEHICLE_DIRECTIONS].sort());
      assert.ok(Object.values(animation.directions).every((sequence) => sequence.length === PRODUCTION_STATE_FRAMES[state]));
    }
  }
});

test('Ukrainian vehicle aliases resolve current armored game types while excluding infantry, drones, and Russian armor', () => {
  assert.equal(resolveUkrainianVehicleAtlasUnitId('uaIfv', { armor: true }), 'ua.protected-mobility.ifv');
  assert.equal(resolveUkrainianVehicleAtlasUnitId('uaTank', { armor: true }), 'ua.tank.main-battle');
  assert.equal(resolveUkrainianVehicleAtlasUnitId('uaInfantry', { archetype: 'infantry' }), null);
  assert.equal(resolveUkrainianVehicleAtlasUnitId('uaDrone', { air: true }), null);
  assert.equal(resolveUkrainianVehicleAtlasUnitId('ruTank', { roleId: 'main-battle-tank', archetype: 'tank', armor: true }), null);
});

test('Ukrainian vehicle renderer layer preserves Ukrainian infantry and Russian fallback ownership', async () => {
  class Renderer {
    unit(entity) { return `fallback-unit:${entity?.type}`; }
    portrait(entity) { return `fallback-portrait:${entity?.type}`; }
  }
  const fallbackUnit = Renderer.prototype.unit;
  const fallbackPortrait = Renderer.prototype.portrait;
  const draws = [];
  const runtime = {
    degraded: false,
    drawAnimation(_context, animationId, options) {
      draws.push({ animationId, options });
      return { frameId: 'ua.tank.main-battle.idle.n.f00' };
    },
    drawFrame() {},
    attachment() { return null; },
  };
  const installation = installUkrainianVehicleArtPass(Renderer, { loadAtlas: async () => runtime });
  await new Promise((resolve) => setImmediate(resolve));
  const renderer = Object.create(Renderer.prototype);
  renderer.g = {
    camera: { z: 1 },
    time: 1,
    unitStats(type) {
      if (type === 'uaTank') return { archetype: 'tank', armor: true };
      if (type === 'uaInfantry') return { archetype: 'infantry' };
      if (type === 'ruTank') return { archetype: 'tank', armor: true };
      return {};
    },
  };
  renderer.x = {};
  renderer.sp = () => ({ x: 20, y: 30 });
  renderer.selection = () => {};

  assert.equal(renderer.unit({ team: TEAM.UA, type: 'uaTank', x: 0, y: 0, hp: 100, maxHp: 100, angle: -Math.PI / 2, flash: 0 }).frameId, 'ua.tank.main-battle.idle.n.f00');
  assert.equal(renderer.unit({ team: TEAM.UA, type: 'uaInfantry' }), 'fallback-unit:uaInfantry');
  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruTank' }), 'fallback-unit:ruTank');
  assert.equal(draws.length, 1);

  installation.restore();
  assert.equal(Renderer.prototype.unit, fallbackUnit);
  assert.equal(Renderer.prototype.portrait, fallbackPortrait);
});

test('renderer bootstrap defers Ukrainian vehicle atlas installation until main composition has run', async () => {
  const sourceText = await readFile(new URL('../src/render/viewport-runtime-bootstrap.js', import.meta.url), 'utf8');
  assert.match(sourceText, /DOMContentLoaded/);
  assert.match(sourceText, /import\('\.\/ukrainian-vehicle-runtime-install\.js'\)/);
  assert.ok(sourceText.indexOf('DOMContentLoaded') < sourceText.indexOf("import('./ukrainian-vehicle-runtime-install.js')"));
});
