import { RUSSIAN_INFANTRY_UNIT_IDS } from './russian-infantry.js';
import { RUSSIAN_UAS_EW_FIRES_PROFILE_IDS } from './russian-uas-ew-fires.js';
import { RUSSIAN_VEHICLE_IDS } from './russian-vehicles.js';
import { SUPPORT_PROFILE_IDS } from './shared-support-systems.js';
import { UKRAINIAN_FIRES_PROFILE_IDS } from './ukrainian-fires.js';
import { UKRAINIAN_INFANTRY_UNIT_IDS } from './ukrainian-infantry.js';
import { UKRAINIAN_UAS_EW_PROFILE_IDS } from './ukrainian-uas-ew.js';
import { UKRAINIAN_VEHICLE_IDS } from './ukrainian-vehicles.js';

export const DECLARATIVE_CONTENT_FAMILIES = Object.freeze([
  Object.freeze({ owner: 'UFR-071:ukrainian-infantry', ids: UKRAINIAN_INFANTRY_UNIT_IDS }),
  Object.freeze({ owner: 'UFR-072:ukrainian-vehicles', ids: UKRAINIAN_VEHICLE_IDS }),
  Object.freeze({ owner: 'UFR-073:ukrainian-uas-ew', ids: UKRAINIAN_UAS_EW_PROFILE_IDS }),
  Object.freeze({ owner: 'UFR-074:ukrainian-fires', ids: UKRAINIAN_FIRES_PROFILE_IDS }),
  Object.freeze({ owner: 'UFR-075:russian-infantry', ids: RUSSIAN_INFANTRY_UNIT_IDS }),
  Object.freeze({ owner: 'UFR-076:russian-vehicles', ids: RUSSIAN_VEHICLE_IDS }),
  Object.freeze({ owner: 'UFR-077:russian-uas-ew-fires', ids: RUSSIAN_UAS_EW_FIRES_PROFILE_IDS }),
  Object.freeze({ owner: 'UFR-078:shared-support', ids: SUPPORT_PROFILE_IDS }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function validateStableContentOwnership(families = DECLARATIVE_CONTENT_FAMILIES) {
  if (!Array.isArray(families)) throw new TypeError('Content ownership families must be an array.');
  const errors = [];
  const ownersById = new Map();

  for (const family of families) {
    if (!family || typeof family !== 'object' || Array.isArray(family)) {
      errors.push('content ownership family must be an object');
      continue;
    }
    const owner = typeof family.owner === 'string' ? family.owner.trim() : '';
    if (!owner) {
      errors.push('content ownership family requires a non-empty owner');
      continue;
    }
    if (!Array.isArray(family.ids)) {
      errors.push(`${owner}: ids must be an array`);
      continue;
    }
    const local = new Set();
    for (const id of family.ids) {
      if (typeof id !== 'string' || !id) {
        errors.push(`${owner}: stable ID must be a non-empty string`);
        continue;
      }
      if (local.has(id)) errors.push(`${owner}: duplicate stable ID ${id}`);
      local.add(id);
      const owners = ownersById.get(id) ?? [];
      owners.push(owner);
      ownersById.set(id, owners);
    }
  }

  for (const [id, owners] of ownersById) {
    const uniqueOwners = [...new Set(owners)].sort();
    if (uniqueOwners.length > 1) {
      errors.push(`${id}: redefined by ${uniqueOwners.join(', ')}`);
    }
  }

  return deepFreeze([...new Set(errors)].sort());
}

export function assertStableContentOwnership(families = DECLARATIVE_CONTENT_FAMILIES) {
  const errors = validateStableContentOwnership(families);
  if (errors.length) throw new Error(`Stable content ownership validation failed:\n- ${errors.join('\n- ')}`);
  return Object.freeze({
    familyCount: families.length,
    stableIdCount: families.reduce((total, family) => total + family.ids.length, 0),
  });
}
