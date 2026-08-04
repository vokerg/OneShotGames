import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildCampaignArtRuntimeManifest,
  renderCampaignArtContactSheet,
  renderCampaignArtSymbols,
} from './lib/campaign-art-pipeline.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const outputs = [
  ['assets/campaign/campaign-art-symbols.svg', renderCampaignArtSymbols()],
  ['assets/campaign/campaign-art-manifest.json', buildCampaignArtRuntimeManifest()],
  ['assets/contact-sheets/campaign-art.svg', renderCampaignArtContactSheet()],
];

for (const [path, content] of outputs) {
  const target = resolve(projectRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  process.stdout.write(`[campaign-art] wrote ${path}\n`);
}
