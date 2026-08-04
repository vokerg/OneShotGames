import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAdaptiveMusicArtifacts } from './lib/adaptive-music-generator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(process.argv[2] ?? join(projectRoot, 'artifacts', 'adaptive-music'));
const { manifest, banks } = generateAdaptiveMusicArtifacts();
await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const bank of banks) await writeFile(join(outputRoot, `${bank.id}.wav`), bank.bytes);
process.stdout.write(`[adaptive-music] wrote ${banks.length} review loops to ${outputRoot}\n`);
