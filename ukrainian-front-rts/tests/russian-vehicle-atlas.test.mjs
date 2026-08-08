import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TEAM } from '../src/config.js';
import { installRussianVehicleArtPass } from '../src/render/russian-vehicle-art-pass.js';
import { validateSpriteAtlasManifest } from '../src/render/sprite-atlas-manifest.js';
import {
  generateRussianVehicleAtlas,
  RUSSIAN_VEHICLE_DIRECTIONS,
  RUSSIAN_VEHICLE_REQUIRED_STATES,
} from '../src/render/russian-vehicle-atlas-generator.js';
import {
  resolveRussianVehicleAtlasUnitId,
  RUSSIAN_VEHICLE_UNIT_IDS,
  russianVehicleAnimationId,
  russianVehicleIconFrameId,
  russianVehiclePortraitFrameId,
} from '../src/render/russian-vehicle-atlas.js';

const sourceUrl = new URL('../art-src/units/russia/vehicles/russian-vehicle-source.json', import.meta.url);
const PRODUCTION_STATE_FRAMES = Object.freeze({ idle: 2, move: 4, attack: 3, hit: 2, damaged: 2, death: 6, wreck: 2 });
const RUSSIAN_ART_BIBLE_PALETTE = Object.freeze({
  ink: '#111512', deep: '#2a211b', shadow: '#41342a', base: '#6c5947', light: '#94775a', metal: '#918d7d', accent: '#cdbd9d', optic: '#786957',
});
async function source() { return JSON.parse(await readFile(sourceUrl, 'utf8')); }

test('Russian vehicle source covers transport, IFV, tank, recovery, and engineering identities', async () => {
  const input = await source();
  assert.equal(input.units.length, 5);
  assert.deepEqual(input.units.map((unit) => unit.id), RUSSIAN_VEHICLE_UNIT_IDS);
  assert.deepEqual(input.directions, RUSSIAN_VEHICLE_DIRECTIONS);
  assert.deepEqual(Object.keys(input.states), RUSSIAN_VEHICLE_REQUIRED_STATES);
  assert.deepEqual(Object.fromEntries(Object.entries(input.states).map(([state, definition]) => [state, definition.frames])), PRODUCTION_STATE_FRAMES);
  assert.deepEqual(Object.fromEntries(Object.keys(RUSSIAN_ART_BIBLE_PALETTE).map((token) => [token, input.paletteTokens[token]])), RUSSIAN_ART_BIBLE_PALETTE);
  assert.deepEqual(input.units.slice(0, 4).map((unit) => unit.id), ['ru.apc-carrier', 'ru.apc-ifv', 'ru.tank-breakthrough', 'ru.repair-tractor']);
  assert.equal(input.units[4].role, 'combat-engineering-vehicle');
  assert.equal(input.provenance.license, 'CC0-1.0');
  assert.equal(input.provenance.redistribution, 'allowed');
  assert.deepEqual(input.provenance.externalInputs, []);
  assert.deepEqual(input.provenance.publicFigures, []);
});

test('Russian vehicle generator is deterministic and emits complete directional lifecycle coverage', async () => {
  const input = await source();
  const generated = generateRussianVehicleAtlas(input);
  const repeated = generateRussianVehicleAtlas(input);
  assert.equal(generated.svg, repeated.svg);
  assert.deepEqual(generated.manifestObject, repeated.manifestObject);
  assert.deepEqual(generated.catalogObject, repeated.catalogObject);
  const manifest = validateSpriteAtlasManifest(generated.manifestObject, { source: 'Russian vehicle generated atlas' });
  assert.equal(generated.catalogObject.frameCount, 851);
  assert.equal(generated.catalogObject.animationCount, 35);
  assert.equal(Object.keys(manifest.frames).length, 851);
  assert.equal(Object.keys(manifest.animations).length, 35);
  assert.ok(generated.svg.length > 200000);
  assert.match(generated.svg, /data-detail="tracks"/);
  assert.match(generated.svg, /data-detail="hull-panels"/);
  assert.match(generated.svg, /data-detail="era"/);
  assert.match(generated.svg, /data-detail="stowage"/);
  for (const unitId of RUSSIAN_VEHICLE_UNIT_IDS) {
    assert.ok(manifest.frames[russianVehiclePortraitFrameId(unitId)]);
    assert.ok(manifest.frames[russianVehicleIconFrameId(unitId)]);
    for (const state of RUSSIAN_VEHICLE_REQUIRED_STATES) {
      const animation = manifest.animations[russianVehicleAnimationId(unitId, state)];
      assert.ok(animation, `${unitId}/${state} animation missing`);
      assert.deepEqual(Object.keys(animation.directions).sort(), [...RUSSIAN_VEHICLE_DIRECTIONS].sort());
      assert.ok(Object.values(animation.directions).every((sequence) => sequence.length === PRODUCTION_STATE_FRAMES[state]));
    }
  }
});

test('Russian vehicle aliases resolve current Russian armor without stealing Ukrainian/flying/infantry identities', () => {
  assert.equal(resolveRussianVehicleAtlasUnitId('ruIfv', { armor: true }), 'ru.apc-ifv');
  assert.equal(resolveRussianVehicleAtlasUnitId('ruTank', { armor: true }), 'ru.tank-breakthrough');
  assert.equal(resolveRussianVehicleAtlasUnitId('ruInfantry', { archetype: 'infantry' }), null);
  assert.equal(resolveRussianVehicleAtlasUnitId('ruDrone', { air: true }), null);
  assert.equal(resolveRussianVehicleAtlasUnitId('uaTank', { roleId: 'breakthrough-tank', archetype: 'tank', armor: true }), null);
});

test('Russian vehicle renderer layer preserves Ukrainian vehicle and infantry fallback ownership', async () => {
  class Renderer { unit(entity) { return `fallback-unit:${entity?.type}`; } portrait(entity) { return `fallback-portrait:${entity?.type}`; } }
  const fallbackUnit = Renderer.prototype.unit;
  const fallbackPortrait = Renderer.prototype.portrait;
  const draws = [];
  const runtime = {
    degraded: false,
    drawAnimation(_context, animationId, options) { draws.push({ animationId, options }); return { frameId: 'ru.tank-breakthrough.idle.n.f00' }; },
    drawFrame() {}, attachment() { return null; },
  };
  const installation = installRussianVehicleArtPass(Renderer, { loadAtlas: async () => runtime });
  await new Promise((resolve) => setImmediate(resolve));
  const renderer = Object.create(Renderer.prototype);
  renderer.g = { camera: { z: 1 }, time: 1, unitStats(type) {
    if (type === 'ruTank') return { archetype: 'tank', armor: true };
    if (type === 'ruInfantry') return { archetype: 'infantry' };
    if (type === 'uaTank') return { archetype: 'tank', armor: true };
    return {};
  } };
  renderer.x = {}; renderer.sp = () => ({ x: 20, y: 30 }); renderer.selection = () => {};
  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruTank', x: 0, y: 0, hp: 100, maxHp: 100, angle: -Math.PI / 2, flash: 0 }).frameId, 'ru.tank-breakthrough.idle.n.f00');
  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruInfantry' }), 'fallback-unit:ruInfantry');
  assert.equal(renderer.unit({ team: TEAM.UA, type: 'uaTank' }), 'fallback-unit:uaTank');
  assert.equal(draws.length, 1);
  installation.restore();
  assert.equal(Renderer.prototype.unit, fallbackUnit);
  assert.equal(Renderer.prototype.portrait, fallbackPortrait);
});

test('renderer bootstrap composes Russian vehicle atlas after Ukrainian vehicle atlas', async () => {
  const sourceText = await readFile(new URL('../src/render/viewport-runtime-bootstrap.js', import.meta.url), 'utf8');
  assert.match(sourceText, /DOMContentLoaded/);
  assert.match(sourceText, /import\('\.\/ukrainian-vehicle-runtime-install\.js'\)/);
  assert.match(sourceText, /import\('\.\/russian-vehicle-runtime-install\.js'\)/);
  assert.ok(sourceText.indexOf("import('./ukrainian-vehicle-runtime-install.js')") < sourceText.indexOf("import('./russian-vehicle-runtime-install.js')"));
});