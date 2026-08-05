#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditAudioRelease,
  selectReleaseVoices,
  validateAudioReleaseQaLedger,
  validateAutoplayResumeTrace,
} from '../src/audio/audio-release-qa.js';
import { createAmbienceCatalog, synthesizeAmbience } from '../src/audio/biome-ambience.js';
import { generateAdaptiveMusicArtifacts } from './lib/adaptive-music-generator.mjs';
import { buildCombatSfxOutputs } from './lib/combat-sfx-generator.mjs';
import { buildUiSfxOutputs } from './lib/ui-sfx-generator.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_MEDIA_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);

async function json(path) {
  return JSON.parse(await readFile(resolve(projectRoot, path), 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pcm16Peak(bytes, label) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 46 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error(`${label}: invalid WAV container.`);
  if (view.getUint16(20, true) !== 1 || view.getUint16(34, true) !== 16) throw new Error(`${label}: expected PCM16 audio.`);
  let peak = 0;
  for (let offset = 44; offset + 1 < bytes.byteLength; offset += 2) {
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)) / 32767);
  }
  return peak;
}

async function walkMedia(directory) {
  const absolute = resolve(projectRoot, directory);
  try {
    if (!(await stat(absolute)).isDirectory()) return [];
  } catch {
    return [];
  }
  const found = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) found.push(...await walkMedia(relative(projectRoot, child)));
    else if (AUDIO_MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(relative(projectRoot, child).replaceAll('\\', '/'));
  }
  return found.sort();
}

function publicFigureFlag(provenance = {}) {
  return provenance.publicFigureImpersonation === true;
}

function inventoryRecord({ id, path = null, peak = null, mode = 'generated', provenance }) {
  return {
    id,
    path,
    peak,
    mode,
    provenance: {
      creator: provenance.creator,
      source: provenance.source,
      license: provenance.license,
      redistribution: provenance.redistribution,
      generatedTool: provenance.generatedTool,
      externalInputs: provenance.externalInputs ?? [],
      publicFigureImpersonation: publicFigureFlag(provenance),
    },
  };
}

const ledgerValue = await json('assets/audio/release-qa.json');
const ledger = validateAudioReleaseQaLedger(ledgerValue);
const combatManifest = await json('assets/audio/combat/manifest.json');
const uiManifest = await json('assets/audio/ui/manifest.json');
const musicManifest = await json('assets/audio/music/manifest.json');
const voiceManifest = await json('assets/audio/voice/manifest.json');

const combatGenerated = buildCombatSfxOutputs();
const uiGenerated = buildUiSfxOutputs();
const musicGenerated = generateAdaptiveMusicArtifacts();
assert.deepEqual(combatManifest, combatGenerated.manifest, 'Combat SFX manifest differs from deterministic generation.');
assert.deepEqual(uiManifest, uiGenerated.manifest, 'UI SFX manifest differs from deterministic generation.');
assert.deepEqual(musicManifest, musicGenerated.manifest, 'Adaptive music manifest differs from deterministic generation.');

const generatedPaths = [];
for (const [familyId, manifest, generated, directory, peakCeiling] of [
  ['combat', combatManifest, combatGenerated, 'assets/audio/combat', 0.921],
  ['ui', uiManifest, uiGenerated, 'assets/audio/ui', 0.861],
]) {
  for (const bank of generated.banks) {
    const declared = manifest.banks.find((entry) => entry.id === bank.id);
    assert.ok(declared, `${familyId}: generated bank ${bank.id} is missing from the manifest.`);
    assert.equal(bank.bytes.byteLength, declared.byteLength, `${familyId}:${bank.id}: byte length mismatch.`);
    assert.equal(sha256(bank.bytes), declared.sha256, `${familyId}:${bank.id}: SHA-256 mismatch.`);
    assert.ok(pcm16Peak(bank.bytes, `${familyId}:${bank.id}`) <= peakCeiling + 1e-6, `${familyId}:${bank.id}: clipping ceiling exceeded.`);
    generatedPaths.push(`${directory}/${declared.path}`);
  }
}

const musicBankById = new Map(musicGenerated.banks.map((bank) => [bank.id, bank]));
for (const track of musicManifest.tracks) {
  const bank = musicBankById.get(track.state);
  assert.ok(bank, `music:${track.state}: deterministic bank is missing.`);
  assert.equal(bank.bytes.byteLength, track.byteLength, `music:${track.state}: byte length mismatch.`);
  assert.equal(sha256(bank.bytes), track.sha256, `music:${track.state}: SHA-256 mismatch.`);
  assert.ok(pcm16Peak(bank.bytes, `music:${track.state}`) <= musicManifest.peakCeiling + 1e-6, `music:${track.state}: clipping ceiling exceeded.`);
  generatedPaths.push(`assets/audio/music/${track.path}`);
}

const voiceRecords = [];
for (const hook of voiceManifest.hooks) {
  for (const [language, variants] of Object.entries(hook.variants)) {
    for (const variant of variants) {
      voiceRecords.push(inventoryRecord({
        id: variant.id,
        mode: variant.asset.mode,
        path: variant.asset.path,
        peak: null,
        provenance: variant.asset.provenance,
      }));
      assert.ok(voiceManifest.languages.some((entry) => entry.id === language), `${variant.id}: undeclared language ${language}.`);
      const speaker = hook.speakerId === null ? null : voiceManifest.speakers.find((entry) => entry.id === hook.speakerId);
      if (speaker) {
        assert.equal(speaker.publicFigure, false, `${variant.id}: public figures cannot be voice speakers.`);
        assert.equal(speaker.fictional, true, `${variant.id}: release voice speakers must be fictional.`);
      }
    }
  }
}

const ambienceRecords = [];
const ambienceCatalog = createAmbienceCatalog();
for (const descriptor of ambienceCatalog) {
  const { samples } = synthesizeAmbience(descriptor);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const path = `generated/audio/ambience/${descriptor.id}.f32`;
  generatedPaths.push(path);
  ambienceRecords.push(inventoryRecord({
    id: descriptor.id,
    path,
    peak,
    provenance: {
      creator: 'Fields of Resolve contributors',
      source: descriptor.provenance.source,
      license: descriptor.provenance.license,
      redistribution: 'allowed',
      generatedTool: 'src/audio/biome-ambience.js',
      externalInputs: [],
      publicFigureImpersonation: false,
    },
  }));
}

const bankPath = (directory, byBank, record) => `${directory}/${byBank[record.bankId].path}`;
const inventories = {
  combat: combatManifest.assets.map((asset) => inventoryRecord({
    id: asset.id,
    path: bankPath('assets/audio/combat', Object.fromEntries(combatManifest.banks.map((bank) => [bank.id, bank])), asset),
    peak: asset.peak,
    provenance: asset.provenance,
  })),
  ui: uiManifest.assets.map((asset) => inventoryRecord({
    id: asset.id,
    path: bankPath('assets/audio/ui', Object.fromEntries(uiManifest.banks.map((bank) => [bank.id, bank])), asset),
    peak: asset.peak,
    provenance: asset.provenance,
  })),
  music: musicManifest.tracks.map((track) => inventoryRecord({
    id: track.id,
    path: `assets/audio/music/${track.path}`,
    peak: track.peak,
    provenance: track.provenance,
  })),
  voice: voiceRecords,
  ambience: ambienceRecords,
};

const committedMediaPaths = await walkMedia('assets/audio');
const audit = auditAudioRelease({
  ledger,
  inventories,
  committedPaths: ledger.families.map((family) => family.sourcePath),
  generatedPaths,
  committedMediaPaths,
  coverage: {
    musicStates: musicManifest.tracks.map((track) => track.state),
    ambienceBiomes: [...new Set(ambienceCatalog.map((descriptor) => descriptor.biome))],
  },
});
if (!audit.ok) {
  const details = audit.errors.map((entry) => `${entry.code}: ${entry.message}`).join('\n');
  throw new Error(`Audio release QA failed:\n${details}`);
}

const stressRequests = ledger.families.flatMap((family, familyIndex) =>
  Array.from({ length: ledger.voiceBudgets.buses[family.bus] + 3 }, (_, index) => ({
    id: `${family.id}-${String(index).padStart(2, '0')}`,
    bus: family.bus,
    priority: (familyIndex + 1) * 10 + (index % 3),
    startedAt: index,
  })),
);
const admissions = selectReleaseVoices(stressRequests, ledger.voiceBudgets);
const reverseAdmissions = selectReleaseVoices([...stressRequests].reverse(), ledger.voiceBudgets);
assert.deepEqual(admissions, reverseAdmissions, 'Audio voice admission must not depend on producer iteration order.');
assert.ok(admissions.rejected.length > 0, 'Audio stress scenario must exercise graceful voice dropping.');
for (const [bus, count] of Object.entries(admissions.busCounts)) {
  assert.ok(count <= ledger.voiceBudgets.buses[bus], `${bus} exceeded its release voice budget.`);
}
assert.ok(admissions.admitted.length <= ledger.voiceBudgets.total, 'Global audio voice budget was exceeded.');
assert.ok(admissions.rejected.every((entry) => entry.reason === 'bus-budget' || entry.reason === 'global-budget'), 'Voice drops must have a stable budget reason.');

const lifecycleContract = validateAutoplayResumeTrace([
  { state: 'locked', cause: 'startup' },
  { state: 'running', cause: 'user-gesture' },
  { state: 'paused', cause: 'visibility' },
  { state: 'running', cause: 'resume' },
]);
assert.equal(lifecycleContract.ok, true, lifecycleContract.errors.join(' '));

console.log(
  `[audio-release-qa] verified ${audit.familyCount} families, ${audit.recordCount} records, ` +
  `${audit.generatedOutputCount} generated outputs, ${audit.campaignContextCount} campaign contexts, ` +
  `${admissions.admitted.length} admitted and ${admissions.rejected.length} gracefully dropped stress voices; ` +
  `${committedMediaPaths.length} committed binary media files.`,
);
