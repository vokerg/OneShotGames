import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

import {
  ART_SOURCE_SCHEMA,
  ART_SOURCE_VERSION,
  buildArtSourceOutputs,
  inspectRgbaPng,
  validateArtSourceCatalog,
} from '../../scripts/lib/art-source-pipeline.mjs';
import { buildArtSources } from '../../scripts/build-art-sources.mjs';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function rgbaPng(width, height, pixels, { profileChunk = null } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4)));
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    ...(profileChunk ? [pngChunk(profileChunk, Buffer.from([0]))] : []),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function baseCatalog(frameOverrides = {}, assetOverrides = {}) {
  return {
    schema: ART_SOURCE_SCHEMA,
    version: ART_SOURCE_VERSION,
    id: 'test.sources',
    paletteTokens: { ink: '#111512', accent: '#ff4fa3' },
    outputs: {
      manifest: 'assets/manifests/art-sources.json',
      contactSheet: 'assets/contact-sheets/art-sources.svg',
    },
    assets: [{
      id: 'test.asset',
      kind: 'diagnostic',
      family: 'test',
      faction: 'shared',
      sourceDirectory: 'diagnostic/test',
      atlasSource: 'assets/atlases/test.source.json',
      provenance: {
        creator: 'Tester',
        createdAt: '2026-08-03',
        source: 'Original test fixture',
        license: 'CC0-1.0',
        redistribution: 'allowed',
        transformations: ['fixture'],
        generatedTools: { used: false, details: 'None', humanCorrections: 'Authored manually' },
        reviewer: 'Test suite',
        approval: 'diagnostic',
      },
      frames: [{
        path: 'diagnostic/test/test.asset__idle__d00__f00.svg',
        runtimeId: 'idle',
        animation: 'idle',
        direction: 0,
        frame: 0,
        durationMs: 100,
        canvas: { width: 4, height: 4 },
        contentBounds: { x: 1, y: 1, w: 2, h: 2 },
        requiredPadding: 1,
        paletteTokens: ['ink'],
        anchor: { x: 2, y: 4 },
        attachments: { center: { x: 2, y: 2 } },
        ...frameOverrides,
      }],
      ...assetOverrides,
    }],
  };
}

async function fixture(catalog = baseCatalog(), svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect x="1" y="1" width="2" height="2" fill="#111512"/></svg>') {
  const root = await mkdtemp(join(tmpdir(), 'ufr-art-source-'));
  const sourcePath = join(root, 'art-src', 'diagnostic', 'test', 'test.asset__idle__d00__f00.svg');
  await mkdir(dirname(sourcePath), { recursive: true });
  await mkdir(join(root, 'assets', 'atlases'), { recursive: true });
  await writeFile(join(root, 'art-src', 'manifest.json'), JSON.stringify(catalog));
  await writeFile(sourcePath, svg);
  await writeFile(join(root, 'assets', 'atlases', 'test.source.json'), JSON.stringify({
    schema: 'fields-of-resolve.sprite-atlas-source',
    version: 1,
    id: 'test.atlas',
    directions: { order: ['n', 'e', 's', 'w'], zero: 'n', clockwise: true },
    paletteTokens: { ink: '#111512', accent: '#ff4fa3' },
    frames: [{ id: 'idle', source: '../../art-src/diagnostic/test/test.asset__idle__d00__f00.svg', anchor: { x: 2, y: 4 } }],
    animations: { idle: { defaultDurationMs: 100, frames: ['idle'] } },
  }));
  return root;
}

test('catalog validation enforces canonical filename metadata and provenance', () => {
  const catalog = validateArtSourceCatalog(baseCatalog());
  assert.equal(catalog.assets[0].frames[0].path, 'diagnostic/test/test.asset__idle__d00__f00.svg');
  assert.equal(Object.isFrozen(catalog.assets[0].provenance), true);
  assert.throws(
    () => validateArtSourceCatalog(baseCatalog({ path: 'diagnostic/test/test.asset__move__d00__f00.svg' })),
    /filename fields must match/,
  );
  assert.throws(
    () => validateArtSourceCatalog(baseCatalog({}, { provenance: { ...baseCatalog().assets[0].provenance, redistribution: 'unknown' } })),
    /redistribution/,
  );
});

test('catalog validation rejects insufficient transparent padding and duplicate atlas keys', () => {
  assert.throws(
    () => validateArtSourceCatalog(baseCatalog({ contentBounds: { x: 0, y: 1, w: 2, h: 2 } })),
    /transparent padding/,
  );
  const duplicate = baseCatalog();
  duplicate.assets.push(JSON.parse(JSON.stringify(duplicate.assets[0])));
  duplicate.assets[1].id = 'test.other';
  duplicate.assets[1].sourceDirectory = 'diagnostic/other';
  duplicate.assets[1].frames[0].path = 'diagnostic/other/test.other__idle__d00__f00.svg';
  assert.throws(() => validateArtSourceCatalog(duplicate), /duplicate atlas key/);
});

test('RGBA8 PNG inspection derives exact alpha bounds and palette colors', () => {
  const pixels = new Array(4 * 4 * 4).fill(0);
  for (let y = 1; y <= 2; y += 1) for (let x = 1; x <= 2; x += 1) {
    const offset = (y * 4 + x) * 4;
    pixels.splice(offset, 4, 17, 21, 18, 255);
  }
  const inspected = inspectRgbaPng(rgbaPng(4, 4, pixels));
  assert.deepEqual(inspected.contentBounds, { x: 1, y: 1, w: 2, h: 2 });
  assert.deepEqual(inspected.colors, ['#111512']);
  assert.throws(() => inspectRgbaPng(rgbaPng(4, 4, pixels, { profileChunk: 'iCCP' })), /forbidden color-profile/);
  const corrupt = rgbaPng(4, 4, pixels);
  corrupt[corrupt.length - 1] ^= 0xff;
  assert.throws(() => inspectRgbaPng(corrupt), /invalid CRC/);
});

test('build validates SVG palette and exact atlas handoff', async () => {
  const root = await fixture();
  try {
    const result = await buildArtSourceOutputs(root);
    assert.equal(result.assetCount, 1);
    assert.equal(result.frameCount, 1);
    assert.match(result.contactSheet, /test\.asset/);
    assert.match(result.manifest, /"sha256"/);
    await writeFile(join(root, 'art-src', 'diagnostic', 'test', 'test.asset__idle__d00__f00.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect x="1" y="1" width="2" height="2" fill="#abcdef"/></svg>');
    await assert.rejects(buildArtSourceOutputs(root), /undeclared palette color/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('atlas handoff supports directional sequences and rejects palette drift', async () => {
  const catalog = baseCatalog({ direction: 1, path: 'diagnostic/test/test.asset__idle__d01__f00.svg' });
  const root = await fixture(catalog);
  try {
    const oldSource = join(root, 'art-src', 'diagnostic', 'test', 'test.asset__idle__d00__f00.svg');
    const newSource = join(root, 'art-src', 'diagnostic', 'test', 'test.asset__idle__d01__f00.svg');
    await writeFile(newSource, await readFile(oldSource));
    await rm(oldSource);
    await writeFile(join(root, 'assets', 'atlases', 'test.source.json'), JSON.stringify({
      schema: 'fields-of-resolve.sprite-atlas-source',
      version: 1,
      id: 'test.atlas',
      directions: { order: ['n', 'e', 's', 'w'], zero: 'n', clockwise: true },
      paletteTokens: { ink: '#111512', accent: '#ff4fa3' },
      frames: [{ id: 'idle', source: '../../art-src/diagnostic/test/test.asset__idle__d01__f00.svg', anchor: { x: 2, y: 4 } }],
      animations: { idle: { defaultDurationMs: 100, directions: { e: ['idle'] } } },
    }));
    await buildArtSourceOutputs(root);
    const atlas = JSON.parse(await readFile(join(root, 'assets', 'atlases', 'test.source.json'), 'utf8'));
    atlas.paletteTokens.ink = '#000000';
    await writeFile(join(root, 'assets', 'atlases', 'test.source.json'), JSON.stringify(atlas));
    await assert.rejects(buildArtSourceOutputs(root), /palette token ink drift/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generated manifest and contact sheet are reproducibly checkable', async () => {
  const root = await fixture();
  try {
    const written = await buildArtSources(root);
    await buildArtSources(root, { check: true });
    assert.equal(JSON.parse(await readFile(written.manifestPath, 'utf8')).schema, 'fields-of-resolve.art-export-manifest');
    await writeFile(written.contactSheetPath, 'stale');
    await assert.rejects(buildArtSources(root, { check: true }), /stale/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
