#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCombatSfxCatalog } from '../src/audio/combat-sfx-catalog.js';
import { buildCombatSfxOutputs, serializeCombatSfxManifest } from './lib/combat-sfx-generator.mjs';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const root = resolve(projectRoot, 'assets/audio/combat'); const manifestPath = resolve(root, 'manifest.json');
const catalog = validateCombatSfxCatalog(JSON.parse(await readFile(manifestPath, 'utf8')), { source: manifestPath }); const generated = buildCombatSfxOutputs();
if (await readFile(manifestPath, 'utf8') !== serializeCombatSfxManifest(generated.manifest)) throw new Error('Combat SFX manifest differs from deterministic generation.');
for (const bank of catalog.banks) {
  const data = await readFile(resolve(root, bank.path));
  if (data.length !== bank.byteLength) throw new Error(`${bank.id}: byte length mismatch.`);
  if (createHash('sha256').update(data).digest('hex') !== bank.sha256) throw new Error(`${bank.id}: SHA-256 mismatch.`);
  if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WAVE') throw new Error(`${bank.id}: invalid WAV header.`);
  if (data.readUInt16LE(20) !== 1 || data.readUInt16LE(22) !== bank.channels || data.readUInt32LE(24) !== bank.sampleRate || data.readUInt16LE(34) !== bank.bitsPerSample) throw new Error(`${bank.id}: PCM format mismatch.`);
  let peak = 0; for (let offset = 44; offset + 1 < data.length; offset += 2) peak = Math.max(peak, Math.abs(data.readInt16LE(offset)) / 32767);
  if (peak > 0.921) throw new Error(`${bank.id}: peak ${peak} exceeds 0.921.`);
}
console.log(`[combat-sfx] verified ${catalog.banks.length} banks containing ${catalog.assets.length} deterministic original cues.`);
