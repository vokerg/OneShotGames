#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateEnvironmentPropAtlas } from './lib/environment-prop-atlas-generator.mjs';

async function compare(path, expected) {
  let actual = null;
  try {
    actual = await readFile(path, 'utf8');
  } catch {
    // Missing generated output is stale.
  }
  if (actual !== expected) throw new Error(`Generated environment prop output is stale: ${path}`);
}

export async function buildEnvironmentPropAtlas(projectRoot, { check = false } = {}) {
  const root = resolve(projectRoot);
  const outputDirectory = join(root, 'assets', 'atlases');
  const manifestPath = join(outputDirectory, 'environment-props.atlas.json');
  const imagePath = join(outputDirectory, 'environment-props.svg');
  const generated = generateEnvironmentPropAtlas();
  if (check) {
    await compare(manifestPath, generated.manifest);
    await compare(imagePath, generated.svg);
  } else {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(manifestPath, generated.manifest);
    await writeFile(imagePath, generated.svg);
  }
  return Object.freeze({ ...generated, manifestPath, imagePath });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => argument.startsWith('--') && argument !== '--check');
  if (unknown.length) {
    console.error('Usage: node scripts/build-environment-prop-atlas.mjs [--check]');
    process.exitCode = 2;
  } else {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    buildEnvironmentPropAtlas(projectRoot, { check: args.includes('--check') })
      .then(({ frameCount, manifestPath, imagePath }) => {
        const verb = args.includes('--check') ? 'verified' : 'wrote';
        console.log(`[environment-props] ${verb} ${manifestPath}`);
        console.log(`[environment-props] ${verb} ${imagePath}`);
        console.log(`[environment-props] ${frameCount} deterministic frame(s)`);
      })
      .catch((error) => {
        console.error(`[environment-props] ${error.message}`);
        process.exitCode = 1;
      });
  }
}
