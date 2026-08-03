#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUiSfxCatalog } from '../src/audio/ui-sfx.js';
import { buildUiSfxOutputs } from './lib/ui-sfx-generator.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const current = JSON.parse(await readFile(resolve(root, 'assets/audio/ui/manifest.json'), 'utf8'));
const catalog = validateUiSfxCatalog(current);
const generated = buildUiSfxOutputs();
assert.deepEqual(current, generated.manifest);
for (const bank of generated.banks) {
  if (createHash('sha256').update(bank.bytes).digest('hex') !== catalog.byBank[bank.id].sha256) throw new Error(`${bank.id}: SHA-256 mismatch.`);
  const view = new DataView(bank.bytes.buffer, bank.bytes.byteOffset, bank.bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bank.bytes.subarray(offset, offset + length));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE' || view.getUint16(20, true) !== 1 || view.getUint32(24, true) !== catalog.sampleRate) throw new Error(`${bank.id}: WAV format mismatch.`);
  let peak = 0;
  for (let offset = 44; offset + 1 < bank.bytes.byteLength; offset += 2) peak = Math.max(peak, Math.abs(view.getInt16(offset, true)) / 32767);
  if (peak > 0.861) throw new Error(`${bank.id}: clipping ceiling exceeded.`);
}
console.log(`[ui-sfx] verified ${catalog.banks.length} banks containing ${catalog.assets.length} original cues.`);
