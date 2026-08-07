import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateUkrainianInfantryAtlas,
  UKRAINIAN_INFANTRY_DIRECTIONS,
  UKRAINIAN_INFANTRY_REQUIRED_STATES,
} from '../../src/render/ukrainian-infantry-atlas-generator.js';
import { TEAM } from '../../src/config.js';
import { installUkrainianInfantryArtPass } from '../../src/render/ukrainian-infantry-art-pass.js';
import {
  resolveUkrainianInfantryIdentity,
  UKRAINIAN_INFANTRY_DIRECTIONS as RUNTIME_UKRAINIAN_INFANTRY_DIRECTIONS,
  ukrainianInfantryDirectionFromAngle,
  ukrainianInfantryVisualState,
} from '../../src/render/ukrainian-infantry-atlas.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = JSON.parse(await readFile(
  resolve(projectRoot, 'art-src/units/ukraine/infantry/ukrainian-infantry-source.json'),
  'utf8',
));

function output() {
  return generateUkrainianInfantryAtlas(source);
}

test('UFR-110 generator is deterministic and covers the complete canonical family', () => {
  const first = output();
  const second = output();
  assert.equal(first.manifest, second.manifest);
  assert.equal(first.svg, second.svg);
  assert.equal(first.catalog, second.catalog);
  assert.deepEqual(first.catalogObject.canonicalUnitIds, [
    'ua.combat-engineers',
    'ua.line-infantry',
    'ua.anti-armor-team',
    'ua.recon-team',
    'ua.casevac-team',
    'ua.mobile-sam',
    'ua.command-team',
  ]);
  assert.deepEqual(first.catalogObject.states, UKRAINIAN_INFANTRY_REQUIRED_STATES);
  assert.deepEqual(first.catalogObject.directions, UKRAINIAN_INFANTRY_DIRECTIONS);
  assert.deepEqual(RUNTIME_UKRAINIAN_INFANTRY_DIRECTIONS, UKRAINIAN_INFANTRY_DIRECTIONS);
  assert.deepEqual(first.catalogObject.counts, {
    units: 7,
    battleFrames: 1176,
    totalFrames: 1191,
    animations: 49,
  });
});

test('every state has all eight directional sequences and valid timing', () => {
  const generated = output();
  for (const unitId of generated.catalogObject.canonicalUnitIds) {
    for (const state of UKRAINIAN_INFANTRY_REQUIRED_STATES) {
      const animation = generated.manifestObject.animations[`${unitId}.${state}`];
      assert.ok(animation, `${unitId}.${state}`);
      assert.deepEqual(Object.keys(animation.directions), UKRAINIAN_INFANTRY_DIRECTIONS);
      for (const direction of UKRAINIAN_INFANTRY_DIRECTIONS) {
        assert.ok(animation.directions[direction].length >= 1);
        assert.ok(animation.directions[direction].every((frame) => frame.durationMs > 0));
      }
    }
    assert.ok(generated.manifestObject.frames[`${unitId}.portrait`]);
    assert.ok(generated.manifestObject.frames[`${unitId}.icon`]);
  }
});

test('runtime identity, direction, and visual-state adapters preserve safe fallbacks', () => {
  const catalog = output().catalogObject;
  assert.equal(resolveUkrainianInfantryIdentity('uaEngineer', { worker: true }, catalog), 'ua.combat-engineers');
  assert.equal(resolveUkrainianInfantryIdentity('uaMedic', { medic: true }, catalog), 'ua.casevac-team');
  assert.equal(resolveUkrainianInfantryIdentity('futureUnknown', { role: 'air-defense' }, catalog), 'ua.mobile-sam');
  assert.equal(resolveUkrainianInfantryIdentity('uaTank', { armor: true }, catalog), null);
  assert.equal(ukrainianInfantryDirectionFromAngle(-Math.PI / 2), 'n');
  assert.equal(ukrainianInfantryDirectionFromAngle(0), 'e');
  assert.equal(ukrainianInfantryVisualState({ hp: 0, maxHp: 100 }, {}, 0), 'death');
  assert.equal(ukrainianInfantryVisualState({ hp: 0, maxHp: 100, destroyed: true }, {}, 0), 'wreck');
  assert.equal(ukrainianInfantryVisualState({ hp: 35, maxHp: 100, flash: 0 }, {}, 0), 'damaged');
  assert.equal(ukrainianInfantryVisualState({ hp: 100, maxHp: 100, flash: 0.1 }, {}, 0), 'attack');
  assert.equal(ukrainianInfantryVisualState({ hp: 100, maxHp: 100, flash: 0, order: { kind: 'move' } }, {}, 0), 'move');
});


test('renderer art pass installs once, draws eligible UA infantry, and restores exact fallbacks', async () => {
  class Renderer {
    unit() { return 'fallback-unit'; }
    portrait() { return 'fallback-portrait'; }
  }
  const fallbackUnit = Renderer.prototype.unit;
  const fallbackPortrait = Renderer.prototype.portrait;
  const calls = [];
  const runtime = {
    degraded: false,
    drawAnimation(_context, animationId, options) {
      calls.push({ animationId, options });
      return { frameId: 'ua.line-infantry.idle.n.f00' };
    },
    drawFrame() {},
    attachment() { return null; },
  };
  const installation = installUkrainianInfantryArtPass(Renderer, {
    loadAtlas: async () => runtime,
  });
  assert.equal(installUkrainianInfantryArtPass(Renderer), installation);
  await new Promise((resolve) => setImmediate(resolve));

  const renderer = Object.create(Renderer.prototype);
  renderer.g = {
    unitStats: () => ({ archetype: 'infantry' }),
    camera: { z: 1 },
    time: 2,
  };
  renderer.x = {};
  renderer.sp = () => ({ x: 20, y: 30 });
  renderer.selection = () => calls.push({ selection: true });

  const resolved = renderer.unit({
    team: TEAM.UA,
    type: 'uaInfantry',
    x: 10,
    y: 15,
    hp: 100,
    maxHp: 100,
    angle: -Math.PI / 2,
    flash: 0,
  });
  assert.equal(resolved.frameId, 'ua.line-infantry.idle.n.f00');
  assert.equal(calls[0].animationId, 'ua.line-infantry.idle');
  assert.equal(renderer.unit({ team: TEAM.RU, type: 'ruInfantry' }), 'fallback-unit');
  assert.equal(installation.status().ready, true);

  installation.restore();
  assert.equal(Renderer.prototype.unit, fallbackUnit);
  assert.equal(Renderer.prototype.portrait, fallbackPortrait);
});
