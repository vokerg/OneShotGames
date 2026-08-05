#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateBuildingArt } from './lib/building-atlas-generator.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const sourcePath = resolve(projectRoot, 'art-src/buildings/building-art-source.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const output = generateBuildingArt(source);
const outputs = [
  ...output.atlases.flatMap((atlas) => [
    [`assets/atlases/buildings-${atlas.faction}.atlas.json`, atlas.manifest],
    [`assets/atlases/buildings-${atlas.faction}.svg`, atlas.svg],
  ]),
  ['assets/contact-sheets/buildings.svg', output.contactSheet],
];

for (const [path, content] of outputs) {
  const target = resolve(projectRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  process.stdout.write(`[building-art] wrote ${path}\n`);
}
process.stdout.write(
  `[building-art] ${output.buildingCount} buildings, ${output.productionFrameCount} production frames, `
  + `${output.runtimeFrameCount} runtime frames, ${output.animationCount} animations\n`,
);
