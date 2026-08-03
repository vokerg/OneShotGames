#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCombatSfxCatalog } from '../src/audio/combat-sfx-catalog.js';
import { buildCombatSfxOutputs, serializeCombatSfxManifest } from './lib/combat-sfx-generator.mjs';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(projectRoot, 'assets/audio/combat/manifest.json');
const current = await readFile(manifestPath, 'utf8');
const catalog = validateCombatSfxCatalog(JSON.parse(current), { source: manifestPath });
const generated = buildCombatSfxOutputs();
if (current !== serializeCombatSfxManifest(generated.manifest)) throw new Error('Combat SFX manifest differs from deterministic synthesis.');
for (const bank of generated.banks) {
  const view = new DataView(bank.bytes.buffer, bank.bytes.byteOffset, bank.bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bank.bytes.subarray(offset, offset + length));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error(`${bank.id}: invalid WAV header.`);
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== catalog.channels || view.getUint32(24, true) !== catalog.sampleRate || view.getUint16(34, true) !== catalog.bitsPerSample) throw new Error(`${bank.id}: PCM format mismatch.`);
  let peak = 0; for (let offset = 44; offset + 1 < bank.bytes.byteLength; offset += 2) peak = Math.max(peak, Math.abs(view.getInt16(offset, true)) / 32767);
  if (peak > 0.921) throw new Error(`${bank.id}: peak ${peak} exceeds 0.921.`);
}
console.log(`[combat-sfx] verified ${catalog.banks.length} synthesized banks containing ${catalog.assets.length} deterministic original cues.`);
