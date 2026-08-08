import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateUkrainianInfantryAtlas } from '../../src/render/ukrainian-infantry-atlas-generator.js';
import { generateRussianInfantryAtlas } from '../../src/render/russian-infantry-atlas-generator.js';
import { installRussianInfantryArtPass } from '../../src/render/russian-infantry-art-pass.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const uaSource = JSON.parse(await readFile(
  resolve(root, 'art-src/units/ukraine/infantry/ukrainian-infantry-source.json'),
  'utf8',
));
const ruSource = JSON.parse(await readFile(
  resolve(root, 'art-src/units/russia/infantry/russian-infantry-source.json'),
  'utf8',
));

function assertUsefulDetail(svg, family) {
  assert.match(svg, /data-detail="load-bearing-kit"/, `${family} must expose load-bearing equipment detail`);
  assert.match(svg, /data-detail="helmet-fittings"/, `${family} must expose helmet detail`);
  assert.match(svg, /data-detail="boots-knees"/, `${family} must expose leg/boot detail`);
  assert.match(svg, /data-detail="weapon-material"/, `${family} must separate weapon materials`);
}

test('completed infantry families carry useful material detail without changing logical frames', () => {
  const ua = generateUkrainianInfantryAtlas(uaSource);
  const ru = generateRussianInfantryAtlas(ruSource);

  for (const [family, generated] of [['Ukrainian', ua], ['Russian', ru]]) {
    assert.equal(generated.manifestObject.image.pixelRatio, 1, `${family} keeps the current logical/source-pixel contract`);
    const battlefieldFrame = Object.values(generated.manifestObject.frames)
      .find((frame) => frame.tags?.some((tag) => tag.includes('infantry')) && !frame.tags.includes('portrait') && !frame.tags.includes('icon'));
    assert.ok(battlefieldFrame, `${family} exposes battlefield frames`);
    assert.deepEqual(battlefieldFrame.sourceSize, { w: 48, h: 48 });
    assertUsefulDetail(generated.svg, family);
  }
});

test('both infantry families keep screen-upright humanoids for directional coverage', () => {
  const ua = generateUkrainianInfantryAtlas(uaSource);
  const ru = generateRussianInfantryAtlas(ruSource);

  assert.match(ua.svg, /data-directional-body="fixed-upright"/);
  assert.match(ru.svg, /data-directional-body="fixed-upright"/);
  assert.doesNotMatch(ru.svg, /<g transform="rotate\((?:-?90|-?180|-?270) 24 24\) translate/,
    'Russian direction changes must not rotate the whole standing humanoid');
});

test('Russian infantry runtime keeps readable parity at strategic and command zoom', async () => {
  class Renderer {
    unit() { return 'fallback-unit'; }
    portrait() { return 'fallback-portrait'; }
    selection() {}
    sp() { return { x: 100, y: 100 }; }
  }

  const draws = [];
  const runtime = {
    degraded: false,
    drawAnimation(_context, animationId, options) {
      draws.push({ animationId, ...options });
      return { frameId: 'ru.line-infantry.idle.n.f00' };
    },
    drawFrame() {},
    attachment() { return null; },
  };
  const installation = installRussianInfantryArtPass(Renderer, { loadAtlas: async () => runtime });
  await new Promise((resolveMicrotask) => setTimeout(resolveMicrotask, 0));

  const renderer = new Renderer();
  renderer.x = {};
  renderer.px = {};
  renderer.g = {
    time: 0,
    camera: { z: 0.55 },
    unitStats: () => ({ faction: 'russia', archetype: 'infantry', visual: 'ruInfantry' }),
  };
  const entity = { type: 'ruInfantry', x: 10, y: 10, hp: 100, maxHp: 100, angle: 0 };

  Renderer.prototype.unit.call(renderer, entity);
  assert.equal(draws.at(-1).scale, 0.6, 'strategic zoom keeps the same readable floor as Ukrainian infantry');
  assert.equal(draws.at(-1).y, 103.85, 'strategic anchor uses the compact post-readability draw offset');

  renderer.g.camera.z = 1;
  Renderer.prototype.unit.call(renderer, entity);
  assert.equal(draws.at(-1).scale, 1.08, 'command zoom keeps parity with Ukrainian infantry scale');
  assert.equal(draws.at(-1).y, 107, 'command anchor uses the compact post-readability draw offset');

  installation.restore();
});
