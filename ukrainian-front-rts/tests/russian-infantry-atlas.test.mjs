import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { TEAM } from '../src/config.js';
import { installRussianInfantryArtPass } from '../src/render/russian-infantry-art-pass.js';
import { validateSpriteAtlasManifest } from '../src/render/sprite-atlas-manifest.js';
import {
  generateRussianInfantryAtlas,
  RUSSIAN_INFANTRY_DIRECTIONS,
  RUSSIAN_INFANTRY_REQUIRED_STATES,
} from '../src/render/russian-infantry-atlas-generator.js';
import {
  resolveRussianInfantryAtlasUnitId,
  RUSSIAN_INFANTRY_UNIT_IDS,
  russianInfantryAnimationId,
  russianInfantryIconFrameId,
  russianInfantryPortraitFrameId,
} from '../src/render/russian-infantry-atlas.js';

const sourceUrl = new URL('../art-src/units/russia/infantry/russian-infantry-source.json', import.meta.url);
const PRODUCTION_STATE_FRAMES = Object.freeze({ idle: 2, move: 6, attack: 3, hit: 2, damaged: 2, death: 5, wreck: 1 });
const RUSSIAN_ART_BIBLE_PALETTE = Object.freeze({
  ink: '#111512',
  deep: '#2a211b',
  shadow: '#41342a',
  base: '#6c5947',
  light: '#94775a',
  metal: '#918d7d',
  accent: '#cdbd9d',
  optic: '#786957',
});

async function source() {
  return JSON.parse(await readFile(sourceUrl, 'utf8'));
}

test('Russian infantry atlas source covers infantry, engineer, medical, anti-armor, recon, and air-defense requirements', async () => {
  const input = await source();
  assert.equal(input.units.length, 8);
  assert.deepEqual(input.units.map((unit) => unit.id), RUSSIAN_INFANTRY_UNIT_IDS);
  assert.deepEqual(input.directions, RUSSIAN_INFANTRY_DIRECTIONS);
  assert.deepEqual(Object.keys(input.states), RUSSIAN_INFANTRY_REQUIRED_STATES);
  assert.deepEqual(Object.fromEntries(Object.entries(input.states).map(([state, definition]) => [state, definition.frames])), PRODUCTION_STATE_FRAMES);
  assert.deepEqual(Object.fromEntries(Object.keys(RUSSIAN_ART_BIBLE_PALETTE).map((token) => [token, input.paletteTokens[token]])), RUSSIAN_ART_BIBLE_PALETTE);
  assert.ok(input.units.some((unit) => unit.role === 'air-defense'));
  assert.ok(Object.values(input.states).every((definition) => definition.durationsMs.every((duration) => Number.isInteger(duration) && duration > 0)));
  assert.ok(Object.values(input.states).every((definition) => ['loop', 'once', 'hold'].includes(definition.loop)));
  assert.equal(input.provenance.license, 'CC0-1.0');
  assert.equal(input.provenance.redistribution, 'allowed');
  assert.deepEqual(input.provenance.externalInputs, []);
  assert.deepEqual(input.provenance.publicFigures, []);
});

test('Russian infantry generator is deterministic and emits validated eight-direction lifecycle animations, portraits, and icons', async () => {
  const input = await source();
  const generated = generateRussianInfantryAtlas(input);
  const repeated = generateRussianInfantryAtlas(input);
  assert.equal(generated.svg, repeated.svg);
  assert.deepEqual(generated.manifestObject, repeated.manifestObject);
  assert.deepEqual(generated.catalogObject, repeated.catalogObject);
  const manifest = validateSpriteAtlasManifest(generated.manifestObject, { source: 'Russian infantry generated atlas' });
  assert.equal(generated.catalogObject.frameCount, 1361);
  assert.equal(generated.catalogObject.animationCount, 56);
  assert.equal(Object.keys(manifest.frames).length, 1361);
  assert.equal(Object.keys(manifest.animations).length, 56);
  assert.ok(generated.svg.startsWith('<svg'));
  assert.ok(generated.svg.length > 280000);

  for (const unitId of RUSSIAN_INFANTRY_UNIT_IDS) {
    assert.ok(manifest.frames[russianInfantryPortraitFrameId(unitId)]);
    assert.ok(manifest.frames[russianInfantryIconFrameId(unitId)]);
    for (const state of RUSSIAN_INFANTRY_REQUIRED_STATES) {
      const animation = manifest.animations[russianInfantryAnimationId(unitId, state)];
      assert.ok(animation, `${unitId}/${state} animation missing`);
      assert.deepEqual(Object.keys(animation.directions).sort(), [...RUSSIAN_INFANTRY_DIRECTIONS].sort());
      assert.ok(Object.values(animation.directions).every((sequence) => sequence.length === PRODUCTION_STATE_FRAMES[state]));
    }
  }
});

test('Russian infantry runtime aliases resolve live and planned family IDs without stealing Ukrainian or vehicle types', () => {
  assert.equal(resolveRussianInfantryAtlasUnitId('ruEngineer', { worker: true }), 'ru.engineer-sappers');
  assert.equal(resolveRussianInfantryAtlasUnitId('ruInfantry', { archetype: 'infantry' }), 'ru.motor-rifle-squad');
  assert.equal(resolveRussianInfantryAtlasUnitId('ruMedic', { medic: true }), 'ru.medical-team');
  assert.equal(resolveRussianInfantryAtlasUnitId('ruAirDefense', { roleId: 'air-defense' }), 'ru.air-defense-team');
  assert.equal(resolveRussianInfantryAtlasUnitId('uaInfantry', { roleId: 'line-infantry', archetype: 'infantry' }), null);
  assert.equal(resolveRussianInfantryAtlasUnitId('ruTank', { archetype: 'vehicle', armor: true }), null);
});

test('Russian infantry renderer layer preserves Ukrainian and vehicle fallback ownership', async () => {
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
      return { frameId: 'ru.motor-rifle-squad.idle.n.f00' };
    },
    drawFrame() {},
    attachment() { return null; },
  };
  const installation = installRussianInfantryArtPass(Renderer, { loadAtlas: async () => runtime });
  await new Promise((resolve) => setImmediate(resolve));
  const renderer = Object.create(Renderer.prototype);
  renderer.g = {
    camera: { z: 1 },
    time: 1,
    unitStats(type) {
      if (type === 'ruInfantry') return { archetype: 'infantry' };
      if (type === 'uaInfantry') return { archetype: 'infantry' };
      if (type === 'ruTank') return { archetype: 'tank', armor: true };
      return {};
    },
  };
  renderer.x = {};
  renderer.sp = () => ({ x: 20, y: 30 });
  renderer.selection = () => {};

  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruInfantry', x: 0, y: 0, hp: 100, maxHp: 100, angle: -Math.PI / 2, flash: 0 }).frameId, 'ru.motor-rifle-squad.idle.n.f00');
  assert.equal(renderer.unit({ team: TEAM.UA, type: 'uaInfantry' }), 'fallback-unit:uaInfantry');
  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruTank' }), 'fallback-unit:ruTank');
  assert.equal(draws.length, 1);

  installation.restore();
  assert.equal(Renderer.prototype.unit, fallbackUnit);
  assert.equal(Renderer.prototype.portrait, fallbackPortrait);
});

test('browser entry loads the Russian infantry runtime adapter after main composition', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const mainIndex = html.indexOf('src/main.js');
  const artIndex = html.indexOf('src/render/russian-infantry-runtime-install.js');
  assert.ok(mainIndex >= 0);
  assert.ok(artIndex > mainIndex);
});
