import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyUiArtArtifacts } from './lib/ui-art-pipeline.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const sourceManifest = await readFile(resolve(projectRoot, 'art-src/ui/ui-art-source.json'), 'utf8');
const result = verifyUiArtArtifacts({ sourceManifest });
process.stdout.write(
  `[ui-art] ${result.assetCount} assets verified across ${Object.keys(result.familyCounts).length} families; `
  + `${result.symbolBytes} symbol bytes and ${result.contactSheetBytes} contact-sheet bytes reproducible\n`,
);
