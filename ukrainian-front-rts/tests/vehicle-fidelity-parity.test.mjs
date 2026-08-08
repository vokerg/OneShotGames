import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { generateUkrainianVehicleAtlas } from '../src/render/ukrainian-vehicle-atlas-generator.js';
import { generateRussianVehicleAtlas } from '../src/render/russian-vehicle-atlas-generator.js';

const uaSourceUrl = new URL('../art-src/units/ukraine/vehicles/ukrainian-vehicle-source.json', import.meta.url);
const ruSourceUrl = new URL('../art-src/units/russia/vehicles/russian-vehicle-source.json', import.meta.url);
const REQUIRED_DETAIL_MARKERS = Object.freeze([
  'road-wheels',
  'side-skirts',
  'hatch-lines',
  'optic-cluster',
  'tow-cable',
  'recognition-panel',
]);

async function source(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function assertFidelityFamily(generated, faction) {
  const { manifestObject, svg } = generated;
  for (const marker of REQUIRED_DETAIL_MARKERS) {
    assert.match(svg, new RegExp(`data-detail="${marker}"`), `${faction} atlas must author ${marker} detail`);
  }
  assert.match(svg, new RegExp(`data-faction-detail="${faction}"`));
  for (const [frameId, frame] of Object.entries(manifestObject.frames)) {
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 }, `${frameId} logical source size changed`);
    assert.deepEqual(frame.anchor, { x: 32, y: 55 }, `${frameId} anchor changed`);
    assert.deepEqual(frame.masks.hit, { x: 6, y: 7, w: 52, h: 50 }, `${frameId} hit mask changed`);
    assert.deepEqual(frame.masks.selection, { x: 7, y: 10, w: 50, h: 45 }, `${frameId} selection mask changed`);
  }
}

test('paired vehicle fidelity adds useful micro-detail without changing gameplay-facing frame geometry', async () => {
  const [ua, ru] = await Promise.all([source(uaSourceUrl), source(ruSourceUrl)]);
  const generatedUa = generateUkrainianVehicleAtlas(ua);
  const generatedRu = generateRussianVehicleAtlas(ru);
  assertFidelityFamily(generatedUa, 'ukraine');
  assertFidelityFamily(generatedRu, 'russia');
  assert.equal(generatedUa.catalogObject.frameCount, generatedRu.catalogObject.frameCount);
  assert.equal(generatedUa.catalogObject.animationCount, generatedRu.catalogObject.animationCount);
});
