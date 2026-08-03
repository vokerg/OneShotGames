#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiSfxOutputs, serializeUiSfxManifest } from './lib/ui-sfx-generator.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'assets/audio/ui/manifest.json');
const check = process.argv.includes('--check');
const outputIndex = process.argv.indexOf('--output');
const outputRoot = resolve(root, outputIndex >= 0 ? process.argv[outputIndex + 1] : 'artifacts/ui-sfx');
const { manifest, banks } = buildUiSfxOutputs();
if (check) {
  try {
    assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')), manifest);
    console.log(`[ui-sfx] manifest matches ${banks.length} synthesized banks.`);
  } catch {
    console.error('[ui-sfx] manifest differs from deterministic synthesis.');
    process.exitCode = 1;
  }
} else {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, 'manifest.json'), serializeUiSfxManifest(manifest));
  for (const bank of banks) await writeFile(resolve(outputRoot, bank.path), bank.bytes);
  console.log(`[ui-sfx] wrote ${banks.length} review banks containing ${manifest.assets.length} cues to ${outputRoot}.`);
}
