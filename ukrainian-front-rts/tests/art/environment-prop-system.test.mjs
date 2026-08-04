import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENVIRONMENT_PROP_ATLAS_ID,
  ENVIRONMENT_PROP_BIOMES,
  ENVIRONMENT_PROP_FAMILIES,
  ENVIRONMENT_PROP_PROFILES,
  ENVIRONMENT_PROP_PROVENANCE,
  ENVIRONMENT_PROP_SYSTEM_VERSION,
  compareEnvironmentPropPresentation,
  environmentPropFamilyForType,
  environmentPropFrameId,
  environmentPropState,
  environmentPropVisibility,
  projectEnvironmentProp,
  projectEnvironmentProps,
  stableEnvironmentPropHash,
  validateEnvironmentPropPresentation,
} from '../../src/render/environment-prop-system.js';
import { generateEnvironmentPropAtlas } from '../../scripts/lib/environment-prop-atlas-generator.mjs';

test('environment prop profiles are complete, immutable, original, and visibility-safe', () => {
  assert.equal(ENVIRONMENT_PROP_SYSTEM_VERSION, 1);
  assert.equal(ENVIRONMENT_PROP_ATLAS_ID, 'fields-of-resolve.environment-props.v1');
  assert.deepEqual(ENVIRONMENT_PROP_FAMILIES, [
    'shelterbelt', 'tree', 'wall', 'fence', 'house', 'industrial', 'crater', 'wreckage',
  ]);
  assert.deepEqual(ENVIRONMENT_PROP_BIOMES, ['donbas', 'zaporizhzhia', 'kherson']);
  assert.equal(ENVIRONMENT_PROP_PROVENANCE.license, 'CC0-1.0');
  assert.equal(ENVIRONMENT_PROP_PROVENANCE.generatedTools.used, false);
  assert.ok(Object.isFrozen(ENVIRONMENT_PROP_PROFILES));
  for (const family of ENVIRONMENT_PROP_FAMILIES) {
    const profile = ENVIRONMENT_PROP_PROFILES[family];
    assert.ok(profile.aliases.length >= 4, `${family} needs authored type aliases`);
    assert.ok(profile.states.length >= 1, `${family} needs lifecycle coverage`);
    assert.ok(profile.seasons.length >= 3, `${family} needs seasonal coverage`);
    assert.ok(profile.variants >= 2, `${family} needs deterministic variation`);
    if (profile.layer === 'tall-occluder') {
      assert.ok(profile.occlusion, `${family} needs visibility-safe occlusion metadata`);
      assert.ok(profile.occlusion.alpha > 0 && profile.occlusion.alpha < 1);
      assert.ok(profile.occlusion.region.w > 0 && profile.occlusion.region.h > 0);
    }
  }
  assert.throws(() => {
    ENVIRONMENT_PROP_PROFILES.tree.variants = 99;
  }, TypeError);
});

test('authored type aliases resolve every required family', () => {
  const samples = {
    shelterbelt: 'windbreak', tree: 'conifer', wall: 'concrete-wall', fence: 'wire-fence',
    house: 'farmhouse', industrial: 'pipe-rack', crater: 'shell-crater', wreckage: 'vehicle-wreck',
  };
  for (const [family, alias] of Object.entries(samples)) {
    assert.equal(environmentPropFamilyForType(alias), family);
    assert.equal(environmentPropFamilyForType(alias.toUpperCase()), family);
  }
  assert.equal(environmentPropFamilyForType('unknown-prop'), null);
});

test('authored prop projection is immutable, reference-free, and preserves gameplay semantics', () => {
  const prop = {
    id: 'farmhouse-a',
    type: 'farmhouse',
    cell: { x: 7, y: 11 },
    footprint: { width: 3, height: 2 },
    blockingLayers: ['ground', 'amphibious', 'ground'],
    metadata: {
      season: 'wet',
      lifecycle: 'damaged',
      nested: { label: 'civilian-site' },
    },
  };
  const snapshot = JSON.stringify(prop);
  const result = projectEnvironmentProp(prop, { biome: 'kherson', mapId: 'safe-passage' });
  assert.equal(JSON.stringify(prop), snapshot);
  assert.equal(result.family, 'house');
  assert.equal(result.state, 'damaged');
  assert.equal(result.season, 'wet');
  assert.deepEqual(result.cell, prop.cell);
  assert.deepEqual(result.footprint, prop.footprint);
  assert.deepEqual(result.blockingLayers, ['amphibious', 'ground']);
  assert.equal(result.metadata.nested.label, 'civilian-site');
  assert.notEqual(result.metadata, prop.metadata);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.metadata));
  assert.deepEqual(validateEnvironmentPropPresentation(result), []);
});

test('destruction and wreck lifecycle states map without duplicating gameplay policy', () => {
  assert.equal(environmentPropState('house', { phase: 'active' }), 'intact');
  assert.equal(environmentPropState('house', { condition: 'disabled' }), 'damaged');
  assert.equal(environmentPropState('house', { phase: 'burning' }), 'damaged');
  assert.equal(environmentPropState('house', { phase: 'destroyed' }), 'destroyed');
  assert.equal(environmentPropState('wreckage', { phase: 'disabled' }), 'disabled');
  assert.equal(environmentPropState('wreckage', { phase: 'burning' }), 'burning');
  assert.equal(environmentPropState('wreckage', { phase: 'wreck' }), 'wreck');
  assert.equal(environmentPropState('wreckage', { phase: 'salvaged' }), 'salvaged');

  const cleared = projectEnvironmentProp({
    id: 'wreck-cleared', type: 'wreck', cell: { x: 2, y: 2 }, footprint: { width: 2, height: 1 },
    blockingLayers: [], metadata: {},
  }, { lifecycle: { phase: 'cleared' } });
  assert.equal(cleared.visible, false);
  assert.equal(cleared.frameId, null);
  assert.deepEqual(environmentPropVisibility(cleared), { draw: false, alpha: 0, cutaway: false, outline: false });
});

test('frame selection and variant choice are deterministic without simulation RNG', () => {
  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => {
    randomCalls += 1;
    return 0.5;
  };
  try {
    const input = {
      id: 'tree-4', type: 'tree', cell: { x: 4, y: 9 }, footprint: { width: 1, height: 1 },
      blockingLayers: ['ground'], metadata: { season: 'autumn' },
    };
    const first = projectEnvironmentProp(input, { biome: 'donbas', mapId: 'map-a' });
    const second = projectEnvironmentProp(input, { biome: 'donbas', mapId: 'map-a' });
    assert.deepEqual(first, second);
    assert.equal(randomCalls, 0);
    assert.equal(first.variant, stableEnvironmentPropHash('map-a', 'donbas', 'tree-4', 'tree', 4, 9, 'intact', 'autumn') % 3);
    assert.equal(
      first.frameId,
      environmentPropFrameId({ biome: 'donbas', family: 'tree', state: 'intact', season: 'autumn', variant: first.variant }),
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('missing authored coverage fails visibly while malformed geometry fails closed', () => {
  const fallback = projectEnvironmentProp({
    id: 'unknown-a', type: 'mystery-pole', cell: { x: 1, y: 1 },
    footprint: { width: 1, height: 1 }, blockingLayers: ['ground'], metadata: {},
  }, { biome: 'zaporizhzhia' });
  assert.equal(fallback.family, 'missing');
  assert.equal(fallback.frameId, 'environment.missing');
  assert.equal(fallback.visible, true);
  assert.match(fallback.diagnosticReason, /Unknown authored prop type/);
  assert.deepEqual(validateEnvironmentPropPresentation(fallback), []);

  const unsupportedSeason = projectEnvironmentProp({
    id: 'wall-a', type: 'wall', cell: { x: 1, y: 1 }, footprint: { width: 1, height: 1 },
    blockingLayers: ['ground'], metadata: { season: 'autumn' },
  });
  assert.equal(unsupportedSeason.frameId, 'environment.missing');
  assert.match(unsupportedSeason.diagnosticReason, /Unsupported season/);

  assert.throws(() => projectEnvironmentProp({ id: '', type: 'tree', cell: { x: 0, y: 0 } }), /prop.id/);
  assert.throws(() => projectEnvironmentProp({ id: 'x', type: 'tree', cell: { x: -1, y: 0 } }), /prop.cell/);
  assert.throws(() => projectEnvironmentProp({
    id: 'x', type: 'tree', cell: { x: 0, y: 0 }, footprint: { width: 0, height: 1 },
  }), /prop.footprint/);
  assert.throws(() => projectEnvironmentProp({
    id: 'x', type: 'tree', cell: { x: 0, y: 0 }, blockingLayers: ['space'],
  }), /unknown movement layer/);
});

test('draw ordering is stable across layers, depth, coordinates, and ids', () => {
  const props = [
    { id: 'tree-z', type: 'tree', cell: { x: 2, y: 1 }, blockingLayers: ['ground'], metadata: {} },
    { id: 'crater-a', type: 'crater', cell: { x: 9, y: 9 }, blockingLayers: [], metadata: {} },
    { id: 'wall-b', type: 'wall', cell: { x: 1, y: 3 }, blockingLayers: ['ground'], metadata: {} },
    { id: 'wall-a', type: 'wall', cell: { x: 1, y: 3 }, blockingLayers: ['ground'], metadata: {} },
    { id: 'wreck-a', type: 'wreckage', cell: { x: 1, y: 2 }, blockingLayers: ['ground'], metadata: {} },
  ];
  const ordered = projectEnvironmentProps(props, { biome: 'donbas', mapId: 'ordering' });
  assert.deepEqual(ordered.map((entry) => entry.id), ['crater-a', 'wall-a', 'wall-b', 'wreck-a', 'tree-z']);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(compareEnvironmentPropPresentation(ordered[index - 1], ordered[index]) <= 0);
  }
  assert.throws(() => projectEnvironmentProps([props[0], { ...props[0] }]), /Duplicate environment prop id/);
});

test('tall occluders expose deterministic fade and cutaway behavior', () => {
  const tree = projectEnvironmentProp({
    id: 'tree-a', type: 'tree', cell: { x: 4, y: 4 }, footprint: { width: 1, height: 1 },
    blockingLayers: ['ground'], metadata: {},
  });
  assert.deepEqual(environmentPropVisibility(tree), { draw: true, alpha: 1, cutaway: false, outline: false });
  assert.deepEqual(environmentPropVisibility(tree, { focusCell: { x: 4, y: 4 } }), {
    draw: true, alpha: 0.36, cutaway: false, outline: true,
  });

  const house = projectEnvironmentProp({
    id: 'house-a', type: 'house', cell: { x: 5, y: 5 }, footprint: { width: 2, height: 2 },
    blockingLayers: ['ground'], metadata: {},
  });
  assert.deepEqual(environmentPropVisibility(house, { selected: true }), {
    draw: true, alpha: 0.32, cutaway: true, outline: true,
  });
});

test('generated atlas is deterministic, complete, visibly varied, and UFR-107 compatible', () => {
  const first = generateEnvironmentPropAtlas();
  const second = generateEnvironmentPropAtlas();
  assert.deepEqual(first, second);
  assert.equal(first.frameCount, 730);
  assert.equal(first.width, 1023);
  assert.equal(first.height, 3329);

  const manifest = JSON.parse(first.manifest);
  assert.equal(manifest.schema, 'fields-of-resolve.sprite-atlas');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.id, ENVIRONMENT_PROP_ATLAS_ID);
  assert.equal(manifest.fallback.frame, 'environment.missing');
  assert.equal(Object.keys(manifest.frames).length, 730);
  assert.equal(manifest.metadata.provenance.license, 'CC0-1.0');
  assert.equal(manifest.metadata.provenance.generatedTools.used, false);

  for (const frame of Object.values(manifest.frames)) {
    assert.ok(frame.rect.x >= 0 && frame.rect.y >= 0);
    assert.ok(frame.rect.x + frame.rect.w <= manifest.image.width);
    assert.ok(frame.rect.y + frame.rect.h <= manifest.image.height);
    assert.ok(frame.anchor.x >= 0 && frame.anchor.x <= frame.sourceSize.w);
    assert.ok(frame.anchor.y >= 0 && frame.anchor.y <= frame.sourceSize.h);
  }

  for (const biome of ENVIRONMENT_PROP_BIOMES) {
    for (const family of ENVIRONMENT_PROP_FAMILIES) {
      const profile = ENVIRONMENT_PROP_PROFILES[family];
      for (const state of profile.states.filter((candidate) => candidate !== 'cleared')) {
        for (const season of profile.seasons) {
          for (let variant = 0; variant < profile.variants; variant += 1) {
            const id = environmentPropFrameId({ biome, family, state, season, variant });
            assert.ok(manifest.frames[id], `Missing ${id}`);
          }
        }
      }
    }
  }

  const tree0 = 'environment.donbas.tree.intact.green.v0';
  const tree1 = 'environment.donbas.tree.intact.green.v1';
  assert.notEqual(first.frameMarkup[tree0], first.frameMarkup[tree1]);
  assert.match(first.frameMarkup[tree0], /fill="#53684a"/);
  assert.match(first.svg, /Fields of Resolve authored environment prop atlas/);
  assert.match(first.svg, /environment\.missing/);
  assert.match(first.svg, /CC0-1\.0/);
});
