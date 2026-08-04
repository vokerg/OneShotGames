import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAdaptiveMusicCatalog } from '../src/audio/adaptive-music.js';
import { generateAdaptiveMusicArtifacts } from './lib/adaptive-music-generator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(projectRoot, 'assets/audio/music/manifest.json');
const committed = JSON.parse(await readFile(manifestPath, 'utf8'));
const generated = generateAdaptiveMusicArtifacts();
if (JSON.stringify(committed) !== JSON.stringify(generated.manifest)) throw new Error('Adaptive music manifest differs from deterministic generation.');
const catalog = validateAdaptiveMusicCatalog(committed, { source: manifestPath });
for (const track of catalog.tracks) {
  const bank = generated.banks.find((entry) => entry.id === track.state);
  if (!bank || bank.bytes.byteLength !== track.byteLength || bank.sampleCount !== track.sampleCount) throw new Error(`Adaptive music bank mismatch for ${track.state}.`);
  const view = new DataView(bank.bytes.buffer, bank.bytes.byteOffset, bank.bytes.byteLength);
  const first = view.getInt16(44, true);
  const last = view.getInt16(bank.bytes.byteLength - 2, true);
  if (Math.abs(first - last) > 16) throw new Error(`Adaptive music loop boundary is discontinuous for ${track.state}.`);
  if (track.peak > committed.peakCeiling) throw new Error(`Adaptive music peak exceeds ceiling for ${track.state}.`);
}
process.stdout.write(`[adaptive-music] verified ${catalog.tracks.length} deterministic loop-safe score states\n`);
