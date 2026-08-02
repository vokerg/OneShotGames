import assert from 'node:assert/strict';
import test from 'node:test';

import { packSpriteAtlasSource } from '../../scripts/lib/sprite-atlas-packer.mjs';

function source(frames) {
  return {
    schema: 'fields-of-resolve.sprite-atlas-source',
    version: 1,
    id: 'test.binary-order',
    padding: 0,
    maxWidth: 32,
    output: { image: 'test.svg', manifest: 'test.atlas.json' },
    frames,
    animations: { idle: { frames: ['Z'], loop: 'hold' } },
    fallback: { frame: 'Z' },
  };
}

test('packer uses locale-independent binary stable-ID ordering', () => {
  const layout = packSpriteAtlasSource(source([
    { id: 'ä', source: 'umlaut.svg', width: 1, height: 1 },
    { id: 'a', source: 'lower.svg', width: 1, height: 1 },
    { id: 'Z', source: 'upper.svg', width: 1, height: 1 },
    { id: 'z', source: 'last-ascii.svg', width: 1, height: 1 },
  ]));

  assert.deepEqual(layout.frames.map(({ id }) => id), ['Z', 'a', 'z', 'ä']);
  assert.deepEqual(
    layout.frames.map(({ id, x }) => ({ id, x })),
    [
      { id: 'Z', x: 0 },
      { id: 'a', x: 1 },
      { id: 'z', x: 2 },
      { id: 'ä', x: 3 },
    ],
  );
});
