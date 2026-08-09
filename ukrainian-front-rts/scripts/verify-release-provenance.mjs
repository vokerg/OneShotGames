#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_KINDS = Object.freeze(['visual', 'audio', 'font', 'text', 'reference', 'procedural-output']);
const REQUIRED_FIELDS = Object.freeze(['id', 'kind', 'source', 'license', 'redistribution', 'validator']);
const FORBIDDEN_PLACEHOLDERS = /^(?:unknown|todo|tbd|pending|n\/a|none)$/i;

export function validateReleaseProvenance(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (manifest.schema !== 'fields-of-resolve.release-provenance') errors.push('schema must be fields-of-resolve.release-provenance');
  if (manifest.version !== 1) errors.push('version must be 1');
  const allowedRedistribution = new Set(Array.isArray(manifest.policy?.allowedRedistribution) ? manifest.policy.allowedRedistribution : []);
  if (allowedRedistribution.size === 0) errors.push('policy.allowedRedistribution must be a non-empty array');
  const records = Array.isArray(manifest.records) ? manifest.records : [];
  if (records.length === 0) errors.push('records must be a non-empty array');
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    for (const field of REQUIRED_FIELDS) {
      const value = record?.[field];
      if (typeof value !== 'string' || value.trim() === '' || FORBIDDEN_PLACEHOLDERS.test(value.trim())) {
        errors.push(`records[${index}].${field} must contain explicit metadata`);
      }
    }
    if (typeof record?.redistribution === 'string' && !allowedRedistribution.has(record.redistribution)) {
      errors.push(`records[${index}].redistribution is not permitted: ${record.redistribution}`);
    }
    if (record?.sourcePaths !== undefined && (!Array.isArray(record.sourcePaths) || record.sourcePaths.length === 0 || record.sourcePaths.some((path) => typeof path !== 'string' || path.trim() === ''))) {
      errors.push(`records[${index}].sourcePaths must be a non-empty string array when provided`);
    }
    if (typeof record?.id === 'string') {
      if (ids.has(record.id)) errors.push(`duplicate provenance id: ${record.id}`);
      ids.add(record.id);
    }
  }
  for (const kind of REQUIRED_KINDS) {
    if (!records.some((record) => record?.kind === kind)) errors.push(`missing required provenance kind: ${kind}`);
  }
  return errors;
}

export async function verifyReleaseProvenance(projectRoot) {
  const manifestPath = resolve(projectRoot, 'provenance/release-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const errors = validateReleaseProvenance(manifest);
  if (errors.length) throw new Error(errors.join('\n'));

  for (const record of manifest.records) {
    const validatorPath = resolve(projectRoot, record.validator);
    await access(validatorPath).catch(() => { throw new Error(`missing provenance validator: ${record.validator}`); });
    const sourcePaths = Array.isArray(record.sourcePaths) ? record.sourcePaths : [record.source];
    for (const source of sourcePaths) {
      const sourcePath = resolve(projectRoot, source);
      await access(sourcePath).catch(() => { throw new Error(`missing provenance source: ${source}`); });
    }
  }
  return Object.freeze({ recordCount: manifest.records.length, kinds: Object.freeze([...new Set(manifest.records.map((record) => record.kind))].sort()) });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  verifyReleaseProvenance(projectRoot)
    .then(({ recordCount, kinds }) => console.log(`[provenance] verified ${recordCount} records across ${kinds.length} provenance kinds`))
    .catch((error) => { console.error(`[provenance] ${error.message}`); process.exitCode = 1; });
}
