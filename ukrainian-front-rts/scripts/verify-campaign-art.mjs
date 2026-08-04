import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyCampaignArtArtifacts } from './lib/campaign-art-pipeline.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const sourceManifest = await readFile(resolve(projectRoot, 'art-src/campaign/campaign-art-source.json'), 'utf8');
const result = verifyCampaignArtArtifacts({ sourceManifest });
process.stdout.write(
  `[campaign-art] ${result.assetCount} assets verified across ${Object.keys(result.familyCounts).length} families; `
  + `${result.symbolBytes} symbol bytes, ${result.runtimeManifestBytes} manifest bytes, and `
  + `${result.contactSheetBytes} contact-sheet bytes reproducible\n`,
);
