#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUiSkinArtifacts } from '../src/ui/ui-skin.js';

async function compare(path, expected) {
  let actual = null;
  try { actual = await readFile(path, 'utf8'); } catch { /* Missing output is stale. */ }
  if (actual !== expected) throw new Error(`Generated UI skin asset is stale: ${path}`);
}

export async function buildUiSkin(projectRoot, { check = false } = {}) {
  const root = resolve(projectRoot);
  const artifacts = buildUiSkinArtifacts();
  for (const artifact of artifacts) {
    const target = resolve(root, artifact.path);
    if (check) await compare(target, artifact.content);
    else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, artifact.content);
    }
  }
  return Object.freeze({ artifactCount: artifacts.length, bytes: artifacts.reduce((sum, artifact) => sum + artifact.content.length, 0), check });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--check')) {
    console.error('Usage: node scripts/build-ui-skin.mjs [--check]');
    process.exitCode = 2;
  } else {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    buildUiSkin(root, { check: args.includes('--check') })
      .then((result) => console.log(`[ui-skin] ${result.check ? 'verified' : 'wrote'} ${result.artifactCount} assets (${result.bytes} bytes)`))
      .catch((error) => {
        console.error(`[ui-skin] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
