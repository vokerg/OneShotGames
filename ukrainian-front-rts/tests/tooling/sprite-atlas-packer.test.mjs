import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { packSpriteAtlasFile } from '../../scripts/pack-sprite-atlas.mjs';
import {
  packSpriteAtlasSource,
  probeImageDimensions,
  probePngDimensions,
  probeSvgDimensions,
  renderSpriteAtlasSvg,
} from '../../scripts/lib/sprite-atlas-packer.mjs';

function source(frames) {
  return {
    schema: 'fields-of-resolve.sprite-atlas-source',
    version: 1,
    id: 'test.pack',
    padding: 1,
    maxWidth: 12,
    output: { image: 'test.svg', manifest: 'test.atlas.json' },
    frames,
    animations: { missing: { frames: ['a'], loop: 'hold' } },
    fallback: { frame: 'a' },
  };
}

test('packer sorts frame IDs and produces deterministic padded shelf placement', () => {
  const layout = packSpriteAtlasSource(source([
    { id: 'b', source: 'b.svg', width: 5, height: 3 },
    { id: 'a', source: 'a.svg', width: 4, height: 4 },
    { id: 'c', source: 'c.svg', width: 3, height: 2 },
  ]));
  assert.deepEqual(layout.frames.map(({ id, x, y }) => ({ id, x, y })), [
    { id: 'a', x: 1, y: 1 },
    { id: 'b', x: 6, y: 1 },
    { id: 'c', x: 1, y: 6 },
  ]);
  assert.deepEqual(layout.manifest.frames.a.rect, { x: 1, y: 1, w: 4, h: 4 });
  assert.equal(layout.width, 12);
  assert.equal(layout.height, 9);
});

test('dimension probes accept PNG headers and SVG view boxes', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png, 0);
  png.writeUInt32BE(48, 16);
  png.writeUInt32BE(24, 20);
  assert.deepEqual(probePngDimensions(png), { width: 48, height: 24 });
  assert.deepEqual(probeSvgDimensions('<svg viewBox="0 0 16 32"></svg>'), { width: 16, height: 32 });
});

test('unsupported source image formats fail both probing and embedding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ufr-atlas-format-'));
  try {
    const sourcePath = join(root, 'unsupported.webp');
    await writeFile(sourcePath, 'not-a-supported-atlas-source');
    await assert.rejects(probeImageDimensions(sourcePath), /not supported/);
    await assert.rejects(
      renderSpriteAtlasSvg({
        width: 1,
        height: 1,
        frames: [{ id: 'unsupported', x: 0, y: 0, width: 1, height: 1, sourcePath }],
      }),
      /Unsupported atlas source image type/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('SVG atlas embeds source images and generated outputs are reproducibly checkable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ufr-atlas-'));
  try {
    await mkdir(join(root, 'sources'));
    await writeFile(join(root, 'sources', 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
    const spec = source([{ id: 'a', source: 'sources/a.svg' }]);
    await writeFile(join(root, 'test.source.json'), JSON.stringify(spec));
    const outputs = await packSpriteAtlasFile(join(root, 'test.source.json'));
    await packSpriteAtlasFile(join(root, 'test.source.json'), { check: true });
    const svg = await readFile(outputs.imagePath, 'utf8');
    const manifest = JSON.parse(await readFile(outputs.manifestPath, 'utf8'));
    assert.match(svg, /data:image\/svg\+xml;base64/);
    assert.equal(manifest.frames.a.rect.w, 4);

    const layout = packSpriteAtlasSource(source([{ id: 'a', source: 'a.svg', sourcePath: join(root, 'sources', 'a.svg'), width: 4, height: 4 }]));
    assert.equal((await renderSpriteAtlasSvg(layout)).includes('image-rendering="pixelated"'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
