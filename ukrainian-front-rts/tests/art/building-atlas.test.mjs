import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { generateBuildingArt, validateBuildingArtSource, verifyBuildingArtArtifacts } from '../../scripts/lib/building-atlas-generator.mjs';
import { FACTION_TECH_TREES } from '../../src/content/faction-tech-trees.js';
import {
  BUILDING_ATLAS_ATTACHMENTS,
  BUILDING_ATLAS_DIMENSIONS,
  BUILDING_ATLAS_IDS,
  BUILDING_ATLAS_PROVENANCE,
  BUILDING_ATLAS_SCHEMA_VERSION,
  BUILDING_ATLAS_STATES,
  buildingAtlasAnimation,
  buildingAtlasFaction,
  buildingAtlasFrame,
  buildingAtlasId,
  buildingAtlasImagePath,
  buildingAtlasManifestPath,
} from '../../src/render/building-atlas.js';
import { validateSpriteAtlasManifest } from '../../src/render/sprite-atlas-manifest.js';

const projectRoot = resolve(new URL('../..', import.meta.url).pathname);
const source = JSON.parse(await readFile(resolve(projectRoot, 'art-src/buildings/building-art-source.json'), 'utf8'));

function canonicalStructures(factionId) {
  return FACTION_TECH_TREES.factions[factionId].nodes
    .filter((node) => node.kind === 'structure')
    .map((node) => node.id)
    .sort();
}

test('building art source is versioned, original, immutable after validation, and canonical', () => {
  const normalized = validateBuildingArtSource(source);
  assert.equal(normalized.version, BUILDING_ATLAS_SCHEMA_VERSION);
  assert.equal(normalized.buildings.length, 16);
  assert.equal(BUILDING_ATLAS_PROVENANCE.license, 'CC0-1.0');
  assert.equal(BUILDING_ATLAS_PROVENANCE.redistribution, 'allowed');
  assert.equal(BUILDING_ATLAS_PROVENANCE.generatedTools.used, false);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.buildings));
  assert.deepEqual([...BUILDING_ATLAS_IDS.ukraine].sort(), canonicalStructures('ukraine'));
  assert.deepEqual([...BUILDING_ATLAS_IDS.russia].sort(), canonicalStructures('russia'));
  assert.deepEqual(
    normalized.buildings.map((building) => building.id),
    [...canonicalStructures('russia'), ...canonicalStructures('ukraine')].sort(),
  );
});

test('source validation rejects duplicate, missing, mismatched, or mirrored role records', () => {
  const duplicate = structuredClone(source);
  duplicate.buildings.push(structuredClone(duplicate.buildings[0]));
  assert.throws(() => validateBuildingArtSource(duplicate), /Duplicate building art source ID/);

  const missing = structuredClone(source);
  missing.buildings.pop();
  assert.throws(() => validateBuildingArtSource(missing), /exact canonical production-structure roster/);

  const mismatched = structuredClone(source);
  mismatched.buildings[0].faction = 'ukraine';
  assert.throws(() => validateBuildingArtSource(mismatched), /faction does not match/);

  const mirrored = structuredClone(source);
  const russianCommand = mirrored.buildings.find((building) => building.id === 'ru.regimental-command');
  russianCommand.role = 'logistics';
  assert.throws(() => validateBuildingArtSource(mirrored), /cover every visual role exactly once/);
});

test('building lookup is strict, faction-specific, and lifecycle-stable', () => {
  assert.equal(buildingAtlasFaction('ua.command-post'), 'ukraine');
  assert.equal(buildingAtlasFaction('ru.supply-depot'), 'russia');
  assert.equal(buildingAtlasId('ukraine'), 'fields-of-resolve.buildings.ukraine.v1');
  assert.equal(buildingAtlasAnimation('ua.motor-pool', 'active'), 'ua.motor-pool.active');
  assert.equal(buildingAtlasFrame('ru.fires-regiment', 'destruction', { phase: 2 }), 'ru.fires-regiment.destruction.f2');
  assert.equal(buildingAtlasManifestPath('ua.engineer-park'), 'assets/atlases/buildings-ukraine.atlas.json');
  assert.equal(buildingAtlasImagePath('ru.armored-park'), 'assets/atlases/buildings-russia.svg');
  assert.throws(() => buildingAtlasFaction('neutral.site'), /Unknown building atlas ID/);
  assert.throws(() => buildingAtlasAnimation('ua.command-post', 'moving'), /Unknown building atlas state/);
  assert.throws(() => buildingAtlasFrame('ru.supply-depot', 'destruction', { phase: 3 }), /phase/);
});

test('generated building atlases are deterministic and cover all required states', () => {
  const first = generateBuildingArt(source);
  const second = generateBuildingArt(source);
  assert.deepEqual(first, second);
  assert.equal(first.buildingCount, 16);
  assert.equal(first.productionFrameCount, 208);
  assert.equal(first.runtimeFrameCount, 210);
  assert.equal(first.animationCount, 176);
  assert.equal(first.atlases.length, 2);

  for (const atlas of first.atlases) {
    const manifest = validateSpriteAtlasManifest(JSON.parse(atlas.manifest));
    assert.equal(manifest.id, buildingAtlasId(atlas.faction));
    assert.equal(manifest.sampling, 'nearest');
    assert.equal(Object.keys(manifest.frames).length, 105);
    assert.equal(Object.keys(manifest.animations).length, 88);
    assert.match(atlas.svg, new RegExp(`${atlas.faction} production building atlas`));
    assert.ok(atlas.width <= 1024);
    for (const id of BUILDING_ATLAS_IDS[atlas.faction]) {
      for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
        const animation = manifest.animations[buildingAtlasAnimation(id, state)];
        assert.ok(animation, `${id}.${state} animation missing`);
        assert.equal(animation.frames.length, contract.frames);
        for (let phase = 0; phase < contract.frames; phase += 1) {
          assert.ok(manifest.frames[buildingAtlasFrame(id, state, { phase })], `${id}.${state}.${phase} missing`);
        }
      }
    }
  }
});

test('battlefield states preserve footprint origin, attachments, and obstruction masks', () => {
  const output = generateBuildingArt(source);
  for (const atlas of output.atlases) {
    const manifest = validateSpriteAtlasManifest(JSON.parse(atlas.manifest));
    for (const id of BUILDING_ATLAS_IDS[atlas.faction]) {
      for (const state of ['placement', 'foundation', 'frame', 'fitout', 'idle', 'active', 'damaged', 'critical', 'destruction', 'rubble']) {
        const contract = BUILDING_ATLAS_STATES[state];
        for (let phase = 0; phase < contract.frames; phase += 1) {
          const frame = manifest.frames[buildingAtlasFrame(id, state, { phase })];
          assert.deepEqual(frame.anchor, BUILDING_ATLAS_DIMENSIONS.battlefield.anchor);
          assert.deepEqual(frame.masks.footprint, { x: 8, y: 55, w: 80, h: 37 });
          for (const attachment of BUILDING_ATLAS_ATTACHMENTS) assert.ok(frame.attachments[attachment], `${id}.${state} missing ${attachment}`);
        }
      }
      const icon = manifest.frames[buildingAtlasFrame(id, 'icon')];
      assert.deepEqual(icon.sourceSize, { w: 40, h: 40 });
      assert.deepEqual(icon.anchor, BUILDING_ATLAS_DIMENSIONS.icon.anchor);
    }
  }
});

test('factions and building roles use distinct visible silhouettes without external content', () => {
  const output = generateBuildingArt(source);
  const allIdle = [];
  for (const atlas of output.atlases) {
    const idle = BUILDING_ATLAS_IDS[atlas.faction].map((id) => atlas.frameMarkups[buildingAtlasFrame(id, 'idle')]);
    assert.equal(new Set(idle).size, 8, `${atlas.faction} role silhouettes must be distinct`);
    allIdle.push(...idle);
    assert.doesNotMatch(atlas.svg, /<script\b|<foreignObject\b|href=["']https?:/i);
  }
  assert.equal(new Set(allIdle).size, 16, 'faction variants must not collapse to palette-identical silhouettes');
  assert.doesNotMatch(output.contactSheet, /<script\b|<foreignObject\b|href=["']https?:/i);
});

test('authoritative verifier reproduces manifests, atlases, and review sheet in memory', () => {
  const result = verifyBuildingArtArtifacts(source);
  assert.equal(result.buildingCount, 16);
  assert.equal(result.productionFrameCount, 208);
  assert.equal(result.runtimeFrameCount, 210);
  assert.equal(result.animationCount, 176);
  assert.ok(result.atlasBytes > 300000);
  assert.ok(result.contactSheetBytes > 100000);
});
