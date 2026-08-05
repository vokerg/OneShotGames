import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyBuildingArtArtifacts } from './lib/building-atlas-generator.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const sourceManifest = JSON.parse(await readFile(resolve(projectRoot, 'art-src/buildings/building-art-source.json'), 'utf8'));
const result = verifyBuildingArtArtifacts(sourceManifest);
process.stdout.write(
  `[building-art] ${result.buildingCount} buildings and ${result.productionFrameCount} production frames verified; `
  + `${result.runtimeFrameCount} runtime frames, ${result.animationCount} animations, `
  + `${result.atlasBytes} atlas bytes, ${result.contactSheetBytes} contact-sheet bytes reproducible\n`,
);
