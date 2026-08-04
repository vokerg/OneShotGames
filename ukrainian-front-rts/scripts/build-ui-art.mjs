import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildUiArtRuntimeManifest,
  renderUiArtContactSheet,
  renderUiArtSymbols,
} from './lib/ui-art-pipeline.mjs';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const outputs = [
  ['assets/ui/ui-art-symbols.svg', renderUiArtSymbols()],
  ['assets/ui/ui-art-manifest.json', buildUiArtRuntimeManifest()],
  ['assets/contact-sheets/ui-art.svg', renderUiArtContactSheet()],
];

for (const [path, content] of outputs) {
  const target = resolve(projectRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  process.stdout.write(`[ui-art] wrote ${path}\n`);
}
