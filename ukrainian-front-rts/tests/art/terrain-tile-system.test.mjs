import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTerrainAtlas } from '../../scripts/lib/terrain-atlas-generator.mjs';
import { validateSpriteAtlasManifest } from '../../src/render/sprite-atlas-manifest.js';
import {
  TERRAIN_ATLAS_ID,
  TERRAIN_ATLAS_PROVENANCE,
  TERRAIN_BIOME_PROFILES,
  TERRAIN_SEMANTIC_IDS,
  TERRAIN_TILE_SCHEMA_VERSION,
  TERRAIN_VARIANT_COUNT,
  TERRAIN_VISUAL_FAMILIES,
  projectAuthoredTerrain,
  projectLegacyTerrain,
  resolveTerrainProjectionFrames,
  resolveTerrainTileFrames,
  stableTerrainHash,
  terrainBiomeId,
  terrainFamilyForSemantic,
  terrainFrameId,
  terrainInnerCornerFrameId,
  terrainNeighborMasks,
  terrainTopology,
  validateTerrainProjection,
} from '../../src/render/terrain-tile-system.js';

test('terrain profiles are versioned, immutable, original, and complete', () => {
  assert.equal(TERRAIN_TILE_SCHEMA_VERSION, 1);
  assert.equal(TERRAIN_VARIANT_COUNT, 2);
  assert.equal(TERRAIN_ATLAS_ID, 'fields-of-resolve.terrain.v1');
  assert.deepEqual(Object.keys(TERRAIN_BIOME_PROFILES), ['donbas', 'zaporizhzhia', 'kherson']);
  assert.ok(Object.isFrozen(TERRAIN_BIOME_PROFILES));
  assert.ok(Object.isFrozen(TERRAIN_BIOME_PROFILES.donbas.palette));
  assert.equal(TERRAIN_ATLAS_PROVENANCE.license, 'CC0-1.0');
  assert.equal(TERRAIN_ATLAS_PROVENANCE.generatedTools.used, false);
  assert.deepEqual(TERRAIN_SEMANTIC_IDS, [
    'open', 'road', 'mud', 'rubble', 'water', 'bridge', 'shelterbelt', 'blocked',
  ]);
  assert.deepEqual(TERRAIN_VISUAL_FAMILIES, [
    'ground', 'road', 'mud', 'rubble', 'water', 'bridge', 'shelterbelt',
    'blocked', 'settlement', 'industrial', 'field', 'bank', 'cliff',
  ]);
  assert.throws(() => {
    TERRAIN_BIOME_PROFILES.donbas.palette.ground = '#000000';
  }, TypeError);
});

test('all cardinal masks, variants, and corner overlays have stable frame IDs', () => {
  const topology = Array.from({ length: 16 }, (_, mask) => terrainTopology(mask));
  assert.equal(new Set(topology).size, 16);
  assert.equal(topology[0], 'isolated');
  assert.equal(topology[5], 'straight-ns');
  assert.equal(topology[10], 'straight-ew');
  assert.equal(topology[15], 'cross');
  for (const biome of Object.keys(TERRAIN_BIOME_PROFILES)) {
    for (const family of TERRAIN_VISUAL_FAMILIES) {
      for (let variant = 0; variant < TERRAIN_VARIANT_COUNT; variant += 1) {
        for (let mask = 0; mask < 16; mask += 1) {
          assert.equal(
            terrainFrameId({ biome, family, cardinalMask: mask, variant }),
            `terrain.${biome}.${family}.v${variant}.m${mask.toString(16).padStart(2, '0')}`,
          );
        }
      }
    }
  }
  assert.equal(terrainInnerCornerFrameId({ biome: 'donbas', innerCornerMask: 0 }), null);
  assert.equal(
    terrainInnerCornerFrameId({ biome: 'donbas', innerCornerMask: 9 }),
    'terrain.donbas.inner.m09',
  );
});

test('neighbor masks use explicit edges and valid inner corners', () => {
  const projection = projectAuthoredTerrain({
    id: 'inner-corner',
    grid: { width: 3, height: 3 },
    terrain: {
      cells: [
        'road', 'road', 'open',
        'road', 'road', 'road',
        'open', 'road', 'road',
      ],
    },
    metadata: { region: 'donbas' },
  });
  const center = terrainNeighborMasks(projection, 1, 1);
  assert.equal(center.cardinalMask, 15);
  assert.equal(center.diagonalMask, 10);
  assert.equal(center.innerCornerMask, 5);

  const edge = projectAuthoredTerrain({
    id: 'edge',
    grid: { width: 1, height: 1 },
    terrain: { cells: ['open'] },
    metadata: { region: 'donbas' },
  });
  assert.equal(terrainNeighborMasks(edge, 0, 0).cardinalMask, 15);

  const isolatedRoad = projectAuthoredTerrain({
    id: 'edge-road',
    grid: { width: 1, height: 1 },
    terrain: { cells: ['road'] },
    metadata: { region: 'donbas' },
  });
  assert.equal(terrainNeighborMasks(isolatedRoad, 0, 0).cardinalMask, 0);
});

test('legacy projection is deterministic, immutable, and road compatible', () => {
  const terrain = [0, 0, 1, 2, 0, 0];
  const road = [[0, 16], [96, 16]];
  const snapshot = JSON.stringify({ terrain, road });
  const first = projectLegacyTerrain({
    terrain,
    width: 3,
    height: 2,
    road,
    region: 'zaporizhzhia',
    mapId: 'legacy-test',
  });
  const second = projectLegacyTerrain({
    terrain,
    width: 3,
    height: 2,
    road,
    region: 'zaporizhzhia',
    mapId: 'legacy-test',
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ terrain, road }), snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.cells));
  assert.deepEqual(first.cells.slice(0, 3).map((cell) => cell.family), ['road', 'road', 'road']);
  assert.equal(first.cells[3].family, 'shelterbelt');
  assert.equal(validateTerrainProjection(first), first);
});

test('authored projection maps surfaces without changing authoritative map data', () => {
  const map = {
    id: 'authored-test',
    grid: { width: 5, height: 2 },
    terrain: {
      cells: [
        'open', 'open', 'open', 'open', 'water',
        'bridge', 'blocked', 'road', 'mud', 'rubble',
      ],
    },
    metadata: {
      region: 'kherson',
      presentation: {
        surfaces: {
          '0,0': 'field',
          '1,0': 'settlement',
          '2,0': 'industrial',
          '3,0': 'bank',
          '1,1': 'cliff',
        },
      },
    },
    passability: [{ cell: { x: 4, y: 0 }, layers: { ground: false } }],
  };
  const before = JSON.stringify(map);
  const projection = projectAuthoredTerrain(map);
  assert.equal(JSON.stringify(map), before);
  assert.deepEqual(projection.cells.map((cell) => cell.family), [
    'field', 'settlement', 'industrial', 'bank', 'water',
    'bridge', 'cliff', 'road', 'mud', 'rubble',
  ]);
  assert.equal(projection.biome, 'kherson');
  assert.equal(resolveTerrainTileFrames(projection, 0, 1).cell.family, 'bridge');
  assert.match(resolveTerrainTileFrames(projection, 1, 1).baseFrame, /\.cliff\.v[01]\./);
});

test('whole-grid resolution is deterministic and uses each cell variant', () => {
  const projection = projectAuthoredTerrain({
    id: 'grid-resolution',
    grid: { width: 3, height: 3 },
    terrain: {
      cells: [
        'road', 'road', 'open',
        'road', 'water', 'water',
        'open', 'bridge', 'blocked',
      ],
    },
    metadata: { region: 'donbas' },
  });
  const frames = resolveTerrainProjectionFrames(projection);
  assert.equal(frames.length, 9);
  assert.ok(Object.isFrozen(frames));
  frames.forEach((resolved, index) => {
    assert.equal(resolved.cell, projection.cells[index]);
    assert.match(resolved.baseFrame, new RegExp(`\\.v${resolved.cell.variant}\\.`));
  });
  assert.deepEqual(frames, resolveTerrainProjectionFrames(projection));
});

test('visual hashing is stable and does not consume random state', () => {
  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    return 0.5;
  };
  try {
    assert.equal(stableTerrainHash('map', 'donbas', 4, 9, 'field'), 1535766720);
    projectLegacyTerrain({
      terrain: [0, 1, 2, 0],
      width: 2,
      height: 2,
      road: [],
      region: 'donbas',
    });
    assert.equal(calls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('surface, biome, coordinates, and variants fail with actionable errors', () => {
  assert.equal(terrainBiomeId('DONBAS'), 'donbas');
  assert.equal(terrainFamilyForSemantic('open', 'field'), 'field');
  assert.equal(terrainFamilyForSemantic('open', 'bank'), 'bank');
  assert.equal(terrainFamilyForSemantic('blocked', 'cliff'), 'cliff');
  assert.throws(() => terrainBiomeId('unknown'), /Unknown terrain biome profile/);
  assert.throws(() => terrainFamilyForSemantic('open', 'lava'), /Unsupported open-terrain/);
  assert.throws(() => terrainFamilyForSemantic('blocked', 'water'), /Unsupported blocked-terrain/);
  assert.throws(
    () => projectLegacyTerrain({ terrain: [9], width: 1, height: 1 }),
    /unknown numeric value/,
  );

  const valid = projectAuthoredTerrain({
    id: 'validation',
    grid: { width: 1, height: 1 },
    terrain: { cells: ['open'] },
    metadata: { region: 'donbas' },
  });
  assert.throws(
    () => validateTerrainProjection({
      ...valid,
      cells: [{ ...valid.cells[0], x: 1 }],
    }),
    /coordinates do not match row-major order/,
  );
  assert.throws(
    () => validateTerrainProjection({
      ...valid,
      cells: [{ ...valid.cells[0], variant: TERRAIN_VARIANT_COUNT }],
    }),
    /variant must be </,
  );
});

test('generated atlas is deterministic, complete, visibly varied, and schema-compatible', () => {
  const first = generateTerrainAtlas();
  const second = generateTerrainAtlas();
  assert.deepEqual(first, second);
  assert.equal(first.frameCount, 1294);
  assert.equal(first.width, 512);
  assert.equal(first.height, 2592);

  const manifest = validateSpriteAtlasManifest(JSON.parse(first.manifest));
  assert.equal(manifest.id, TERRAIN_ATLAS_ID);
  assert.equal(manifest.fallback.frame, 'terrain.missing');
  assert.equal(Object.keys(manifest.frames).length, 1294);
  for (const frame of Object.values(manifest.frames)) {
    assert.ok(frame.rect.x >= 0 && frame.rect.y >= 0);
    assert.ok(frame.rect.x + frame.rect.w <= manifest.image.width);
    assert.ok(frame.rect.y + frame.rect.h <= manifest.image.height);
  }
  for (const biome of Object.keys(TERRAIN_BIOME_PROFILES)) {
    for (const family of TERRAIN_VISUAL_FAMILIES) {
      for (let variant = 0; variant < TERRAIN_VARIANT_COUNT; variant += 1) {
        for (let mask = 0; mask < 16; mask += 1) {
          const id = terrainFrameId({ biome, family, cardinalMask: mask, variant });
          assert.ok(manifest.frames[id], `Missing ${id}`);
        }
      }
    }
    for (let mask = 1; mask < 16; mask += 1) {
      const id = terrainInnerCornerFrameId({ biome, innerCornerMask: mask });
      assert.ok(manifest.frames[id], `Missing ${id}`);
    }
  }

  const group = (id) => first.svg.match(new RegExp(`<g id="${id.replaceAll('.', '\\.')}"[^>]*>(.*?)</g>`))?.[1];
  assert.notEqual(
    group('terrain.donbas.ground.v0.m00'),
    group('terrain.donbas.ground.v1.m00'),
  );
  assert.match(first.svg, /Fields of Resolve authored terrain atlas/);
  assert.match(first.svg, /CC0-1\.0/);
  assert.match(first.svg, /terrain\.missing/);
});
