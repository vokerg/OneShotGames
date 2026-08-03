#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCombatSfxOutputs, serializeCombatSfxManifest } from './lib/combat-sfx-generator.mjs';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(projectRoot, 'assets/audio/combat/manifest.json');
const check = process.argv.includes('--check');
const outputFlag = process.argv.indexOf('--output');
const outputRoot = resolve(projectRoot, outputFlag >= 0 ? process.argv[outputFlag + 1] : 'artifacts/combat-sfx');
const { manifest, banks } = buildCombatSfxOutputs();
const serialized = serializeCombatSfxManifest(manifest);
if (check) {
  const current = await readFile(manifestPath, 'utf8');
  if (current !== serialized) { console.error('[combat-sfx] manifest differs from deterministic synthesis.'); process.exitCode = 1; }
  else console.log(`[combat-sfx] manifest matches ${banks.length} deterministic synthesized banks.`);
} else {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, 'manifest.json'), serialized);
  for (const bank of banks) await writeFile(resolve(outputRoot, bank.path), bank.bytes);
  console.log(`[combat-sfx] wrote ${banks.length} review banks containing ${manifest.assets.length} original cues to ${outputRoot}.`);
}
