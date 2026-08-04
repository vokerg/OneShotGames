import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyUiArtArtifacts } from './lib/ui-art-pipeline.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const read = (path) => readFile(resolve(projectRoot, path), 'utf8');

const [sourceManifest, runtimeManifest, symbols, contactSheet] = await Promise.all([
  read('art-src/ui/ui-art-source.json'),
  read('assets/ui/ui-art-manifest.json'),
  read('assets/ui/ui-art-symbols.svg'),
  read('assets/contact-sheets/ui-art.svg'),
]);

const result = verifyUiArtArtifacts({ sourceManifest, runtimeManifest, symbols, contactSheet });
process.stdout.write(
  `[ui-art] ${result.assetCount} assets verified across ${Object.keys(result.familyCounts).length} families\n`,
);
