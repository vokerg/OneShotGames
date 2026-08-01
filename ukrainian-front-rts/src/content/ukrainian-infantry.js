import {
  UKRAINIAN_INFANTRY_BRANCH,
  validateUkrainianInfantryBranch as validateUkrainianInfantryData,
} from './ukrainian-infantry-data.js';

export * from './ukrainian-infantry-data.js';

const COLLECTION_FIELDS = Object.freeze([
  'weapons',
  'capabilities',
  'counterDomains',
  'vulnerabilityDomains',
  'supportLinks',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeCollectionEntries(record, field, path, errors) {
  const value = record[field];
  if (!Array.isArray(value)) {
    errors.push(`${path}: ${field} must be an array`);
    return [];
  }

  if (field !== 'weapons' && field !== 'capabilities') return value;
  return value.map((entry, index) => {
    if (isRecord(entry)) return entry;
    errors.push(`${path}: ${field}[${index}] must be an object`);
    return {};
  });
}

function sanitizeUnitRecord(record, index, errors) {
  if (!isRecord(record)) return record;
  const path = record.id || `<unit-${index}>`;
  const sanitized = { ...record };
  for (const field of COLLECTION_FIELDS) {
    sanitized[field] = sanitizeCollectionEntries(record, field, path, errors);
  }
  return sanitized;
}

export function validateUkrainianInfantryBranch(branch = UKRAINIAN_INFANTRY_BRANCH) {
  if (!isRecord(branch) || !Array.isArray(branch.units)) {
    return Object.freeze([...validateUkrainianInfantryData(branch)]);
  }

  const structuralErrors = [];
  const sanitizedBranch = {
    ...branch,
    units: branch.units.map((record, index) => sanitizeUnitRecord(record, index, structuralErrors)),
  };
  const dataErrors = validateUkrainianInfantryData(sanitizedBranch);
  return Object.freeze([...new Set([...dataErrors, ...structuralErrors])].sort());
}
