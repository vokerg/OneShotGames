import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateUkrainianInfantryAtlas,
  UKRAINIAN_INFANTRY_BATTLEFIELD_PRESENTATION,
} from '../../src/render/ukrainian-infantry-atlas-generator.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = JSON.parse(await readFile(
  resolve(projectRoot, 'art-src/units/ukraine/infantry/ukrainian-infantry-source.json'),
  'utf8',
));

test('Ukrainian infantry battlefield presentation reserves a human-readable footprint', () => {
  const presentation = UKRAINIAN_INFANTRY_BATTLEFIELD_PRESENTATION;
  assert.deepEqual(presentation.frame, { width: 48, height: 48 });
  assert.ok(presentation.standingBody.width >= 24, 'standing body must occupy at least half the frame width');
  assert.ok(presentation.standingBody.height >= 36, 'standing body must occupy at least three quarters of frame height');
  assert.ok(presentation.equipment.maxWidth <= presentation.standingBody.width, 'role equipment must not dominate body width');
  assert.ok(presentation.equipment.maxLength <= presentation.standingBody.height, 'role equipment must not dominate body length');
  assert.ok(presentation.runtimeScale.multiplier >= 1, 'runtime must not shrink the authored battlefield silhouette');
  assert.ok(presentation.runtimeScale.floor >= 0.5, 'strategic zoom must retain a readable pixel footprint');
});

test('generated Ukrainian infantry atlas identifies the readable top-down battlefield revision', () => {
  const generated = generateUkrainianInfantryAtlas(source);
  assert.match(generated.svg, /data-presentation="top-down-readable-v2"/);
  assert.doesNotMatch(generated.svg, /data-presentation="front-elevation"/);
});
