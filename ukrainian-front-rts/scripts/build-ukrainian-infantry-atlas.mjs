#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateUkrainianInfantryAtlas } from './lib/ukrainian-infantry-atlas-generator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, 'art-src/units/ukraine/infantry/ukrainian-infantry-source.json');
const outputRoot = resolve(projectRoot, process.argv[2] || 'artifacts/ukrainian-infantry');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const output = generateUkrainianInfantryAtlas(source);
const outputs = [
  ['ukrainian-infantry.atlas.json', output.manifest],
  ['ukrainian-infantry.svg', output.svg],
  ['ukrainian-infantry-contact-sheet.svg', output.contactSheet],
  ['ukrainian-infantry-art.json', output.catalog],
];
for (const [name, content] of outputs) {
  const target = resolve(outputRoot, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  process.stdout.write(`[ua-infantry-art] wrote ${target}\n`);
}
process.stdout.write(
  `[ua-infantry-art] ${output.catalogObject.counts.units} units, `
  + `${output.catalogObject.counts.battleFrames} battlefield frames, `
  + `${output.catalogObject.counts.animations} animations\n`,
);
