#!/usr/bin/env node
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_KINDS = Object.freeze(['visual', 'audio', 'font', 'text', 'reference', 'procedural-output']);
const REQUIRED_FIELDS = Object.freeze(['id', 'kind', 'source', 'license', 'redistribution', 'validator']);
const FORBIDDEN_PLACEHOLDERS = /^(?:unknown|todo|tbd|pending|n\/a|none)$/i;
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2', '.eot']);

function explicit(value) {
  return typeof value === 'string' && value.trim() !== '' && !FORBIDDEN_PLACEHOLDERS.test(value.trim());
}

function slash(path) {
  return path.replaceAll('\\', '/');
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  return files;
}

export function validateReleaseProvenance(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (manifest.schema !== 'fields-of-resolve.release-provenance') errors.push('schema must be fields-of-resolve.release-provenance');
  if (manifest.version !== 1) errors.push('version must be 1');
  if (manifest.policy?.failClosed !== true) errors.push('policy.failClosed must be true');
  const requiredFields = new Set(Array.isArray(manifest.policy?.requiredFields) ? manifest.policy.requiredFields : []);
  for (const field of REQUIRED_FIELDS) if (!requiredFields.has(field)) errors.push(`policy.requiredFields must include ${field}`);
  const allowedRedistribution = new Set(Array.isArray(manifest.policy?.allowedRedistribution) ? manifest.policy.allowedRedistribution : []);
  if (allowedRedistribution.size === 0) errors.push('policy.allowedRedistribution must be a non-empty array');
  const records = Array.isArray(manifest.records) ? manifest.records : [];
  if (records.length === 0) errors.push('records must be a non-empty array');
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    for (const field of REQUIRED_FIELDS) {
      if (!explicit(record?.[field])) errors.push(`records[${index}].${field} must contain explicit metadata`);
    }
    if (typeof record?.redistribution === 'string' && !allowedRedistribution.has(record.redistribution)) {
      errors.push(`records[${index}].redistribution is not permitted: ${record.redistribution}`);
    }
    if (record?.sourcePaths !== undefined && (!Array.isArray(record.sourcePaths) || record.sourcePaths.length === 0 || record.sourcePaths.some((path) => !explicit(path)))) {
      errors.push(`records[${index}].sourcePaths must be a non-empty explicit string array when provided`);
    }
    if (typeof record?.id === 'string') {
      if (ids.has(record.id)) errors.push(`duplicate provenance id: ${record.id}`);
      ids.add(record.id);
    }
  }
  for (const kind of REQUIRED_KINDS) if (!records.some((record) => record?.kind === kind)) errors.push(`missing required provenance kind: ${kind}`);
  return errors;
}

export function validateVisualSourceCatalog(catalog, actualSvgPaths = []) {
  const errors = [];
  if (catalog?.schema !== 'fields-of-resolve.art-source-catalog') errors.push('visual source catalog has invalid schema');
  const assets = Array.isArray(catalog?.assets) ? catalog.assets : [];
  if (assets.length === 0) errors.push('visual source catalog has no assets');
  const declaredFrames = new Set();
  for (const [index, asset] of assets.entries()) {
    for (const field of ['creator', 'source', 'license', 'redistribution']) {
      if (!explicit(asset?.provenance?.[field])) errors.push(`visual asset ${asset?.id ?? index} missing provenance.${field}`);
    }
    const frames = Array.isArray(asset?.frames) ? asset.frames : [];
    if (frames.length === 0) errors.push(`visual asset ${asset?.id ?? index} has no source frames`);
    for (const frame of frames) if (explicit(frame?.path)) declaredFrames.add(slash(frame.path));
  }
  for (const path of actualSvgPaths.map(slash)) if (!declaredFrames.has(path)) errors.push(`untracked visual source: ${path}`);
  return errors;
}

export function validateAudioReleaseLedger(ledger) {
  const errors = [];
  if (ledger?.schema !== 'fields-of-resolve.audio-release-qa') errors.push('audio release ledger has invalid schema');
  const families = Array.isArray(ledger?.families) ? ledger.families : [];
  if (families.length === 0) errors.push('audio release ledger has no families');
  for (const [index, family] of families.entries()) {
    for (const field of ['id', 'sourcePath', 'license', 'redistribution']) {
      if (!explicit(family?.[field])) errors.push(`audio family ${family?.id ?? index} missing ${field}`);
    }
  }
  return errors;
}

async function validateVisualDomain(projectRoot, record) {
  const catalogPath = resolve(projectRoot, record.source);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const artRoot = resolve(projectRoot, 'art-src');
  const actualSvgPaths = (await listFiles(artRoot))
    .filter((path) => extname(path).toLowerCase() === '.svg')
    .map((path) => slash(relative(artRoot, path)));
  const errors = validateVisualSourceCatalog(catalog, actualSvgPaths);
  for (const asset of catalog.assets ?? []) {
    for (const frame of asset.frames ?? []) {
      if (!explicit(frame?.path)) continue;
      await access(resolve(artRoot, frame.path)).catch(() => errors.push(`missing visual source frame: ${frame.path}`));
    }
  }
  return errors;
}

async function validateAudioDomain(projectRoot, record) {
  const ledger = JSON.parse(await readFile(resolve(projectRoot, record.source), 'utf8'));
  const errors = validateAudioReleaseLedger(ledger);
  for (const family of ledger.families ?? []) {
    if (!explicit(family?.sourcePath)) continue;
    await access(resolve(projectRoot, family.sourcePath)).catch(() => errors.push(`missing audio provenance source: ${family.sourcePath}`));
  }
  return errors;
}

async function validateFontDomain(projectRoot) {
  const assetRoot = resolve(projectRoot, 'assets');
  const bundledFonts = (await listFiles(assetRoot)).filter((path) => FONT_EXTENSIONS.has(extname(path).toLowerCase()));
  return bundledFonts.map((path) => `bundled font binary lacks explicit provenance record: ${slash(relative(projectRoot, path))}`);
}

export async function verifyReleaseProvenance(projectRoot) {
  const manifestPath = resolve(projectRoot, 'provenance/release-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const errors = validateReleaseProvenance(manifest);

  for (const record of manifest.records ?? []) {
    const validatorPath = resolve(projectRoot, record.validator);
    await access(validatorPath).catch(() => errors.push(`missing provenance validator: ${record.validator}`));
    const sourcePaths = Array.isArray(record.sourcePaths) ? record.sourcePaths : [record.source];
    for (const source of sourcePaths) await access(resolve(projectRoot, source)).catch(() => errors.push(`missing provenance source: ${source}`));
    if (record.kind === 'visual') errors.push(...await validateVisualDomain(projectRoot, record));
    if (record.kind === 'audio') errors.push(...await validateAudioDomain(projectRoot, record));
    if (record.kind === 'font') errors.push(...await validateFontDomain(projectRoot));
  }

  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  return Object.freeze({ recordCount: manifest.records.length, kinds: Object.freeze([...new Set(manifest.records.map((record) => record.kind))].sort()) });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyReleaseProvenance(projectRoot)
    .then(({ recordCount, kinds }) => console.log(`[provenance] verified ${recordCount} records across ${kinds.length} provenance kinds with delegated completeness checks`))
    .catch((error) => { console.error(`[provenance] ${error.message}`); process.exitCode = 1; });
}
