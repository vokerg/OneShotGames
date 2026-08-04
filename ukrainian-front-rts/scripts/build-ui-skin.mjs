#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UI_SKIN_ASSET_CSS_PATH,
  buildUiSkinAssetCss,
} from '../src/ui/ui-skin.js';

export async function buildUiSkin(projectRoot, { check = false } = {}) {
  const root = resolve(projectRoot);
  const target = resolve(root, UI_SKIN_ASSET_CSS_PATH);
  const expected = buildUiSkinAssetCss();
  if (check) {
    const actual = await readFile(target, 'utf8');
    if (actual !== expected) throw new Error(`Generated UI skin assets are stale: ${UI_SKIN_ASSET_CSS_PATH}`);
  } else {
    await writeFile(target, expected);
  }
  return Object.freeze({ target, bytes: expected.length, check });
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
      .then((result) => console.log(`[ui-skin] ${result.check ? 'verified' : 'wrote'} ${result.bytes} bytes`))
      .catch((error) => {
        console.error(`[ui-skin] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
