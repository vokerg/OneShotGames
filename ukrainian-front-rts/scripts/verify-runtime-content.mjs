import assert from 'node:assert/strict';

import { BUILDING_TYPES, MISSIONS, UNIT_TYPES } from '../src/config.js';
import {
  LEGACY_RUNTIME_UNIT_ID_MIGRATIONS,
  migrateRuntimeContentReferences,
  reconcileActiveRuntimeContent,
  RUNTIME_CANONICAL_ROSTER_MAP,
  validateActiveRuntimeContent,
} from '../src/content/runtime-content-reconciliation.js';
import { assertStableContentOwnership } from '../src/content/runtime-content-ownership.js';

const snapshot = reconcileActiveRuntimeContent();
assertStableContentOwnership();
const errors = validateActiveRuntimeContent();
if (errors.length) {
  console.error('Runtime content reconciliation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

for (const legacyId of Object.keys(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
  assert.equal(UNIT_TYPES[legacyId], undefined, `${legacyId} must not remain active.`);
}
for (const [runtimeId, canonicalId] of Object.entries(RUNTIME_CANONICAL_ROSTER_MAP)) {
  assert.equal(UNIT_TYPES[runtimeId]?.canonicalId, canonicalId, `${runtimeId} canonical projection drifted.`);
}
for (const mission of MISSIONS) {
  for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
    assert.equal(new Set(mission[field]).size, mission[field].length, `${mission.id}.${field} contains duplicates.`);
  }
}
for (const building of Object.values(BUILDING_TYPES)) {
  for (const runtimeId of building.produces || []) {
    assert.ok(building.canonicalProducerIds.includes(UNIT_TYPES[runtimeId].canonicalProducerId));
  }
}

const unsupported = migrateRuntimeContentReferences({ units: [{ type: 'unsupportedLegacyUnit' }] });
assert.equal(unsupported.status, 'unsupported');
assert.match(unsupported.errors[0], /Unsupported runtime unit ID/);

console.log(
  `Runtime content reconciliation passed for ${snapshot.runtimeUnitIds.length} units, ` +
  `${snapshot.missionIds.length} missions, and ${Object.keys(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS).length} legacy migrations.`,
);
