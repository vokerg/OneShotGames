import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { generateSupportVisualAtlas, validateSupportVisualSource } from '../src/render/support-visual-atlas-generator.js';

const source=JSON.parse(await readFile(new URL('../art-src/units/support/support-visual-source.json',import.meta.url),'utf8'));

test('support visual source covers both factions and every required family',()=>{
  assert.deepEqual(validateSupportVisualSource(source),[]);
  const atlas=generateSupportVisualAtlas(source);
  assert.equal(atlas.frameCount,640);
  assert.equal(new Set(atlas.frames.map((frame)=>frame.id)).size,640);
  assert.ok(atlas.frames.some((frame)=>frame.id==='ua.drone.attack.n'));
  assert.ok(atlas.frames.some((frame)=>frame.id==='ru.bridging.wreck.sw'));
});

test('support visual generation is deterministic',()=>{
  const a=generateSupportVisualAtlas(source);
  const b=generateSupportVisualAtlas(structuredClone(source));
  assert.equal(a.svg,b.svg);
  assert.deepEqual(a.frames,b.frames);
});

test('support visual validation fails closed when a family disappears',()=>{
  const broken=structuredClone(source);
  broken.identities=broken.identities.filter((item)=>item.family!=='air-defense');
  assert.match(validateSupportVisualSource(broken).join('\n'),/missing support family: air-defense/);
});
