import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_TYPES, MISSIONS, UNIT_TYPES } from '../../src/config.js';
import {
  LEGACY_RUNTIME_UNIT_ID_MIGRATIONS,
  migrateRuntimeContentReferences,
  migrateRuntimeUnitId,
  reconcileActiveRuntimeContent,
  RUNTIME_CANONICAL_ROSTER_MAP,
  validateActiveRuntimeContent,
} from '../../src/content/runtime-content-reconciliation.js';

const PUBLIC_FIGURE_NAMES = [
  'Volodymyr Zelenskyy',
  'Valerii Zaluzhnyi',
  'Vladimir Putin',
  'Yevgeny Prigozhin',
];

test('legacy command-character IDs migrate deterministically and unknown IDs fail actionably', () => {
  for (const [legacyId, currentId] of Object.entries(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    assert.deepEqual(migrateRuntimeUnitId(legacyId), {
      status: 'migrated',
      id: currentId,
      legacyId,
      error: null,
    });
  }

  const unsupported = migrateRuntimeUnitId('uaUnknownPrototypeHero');
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.id, null);
  assert.match(unsupported.error, /Update the save or configuration/);
});

test('nested save and configuration references migrate without mutating the source record', () => {
  const source = {
    selected: 'uaZelenskyy',
    units: [
      { type: 'uaZaluzhnyi', target: 'ruPutin' },
      { type: 'ruPrigozhin' },
    ],
  };

  const migrated = migrateRuntimeContentReferences(source);

  assert.deepEqual(migrated, {
    selected: 'uaCommandVarta',
    units: [
      { target: 'ruCommandBastion', type: 'uaCommandSapsan' },
      { type: 'ruCommandGranit' },
    ],
  });
  assert.equal(source.selected, 'uaZelenskyy');
});

test('runtime reconciliation replaces public figures and preserves valid mission command references', () => {
  const first = reconcileActiveRuntimeContent();
  const second = reconcileActiveRuntimeContent();
  assert.strictEqual(second, first);

  for (const [legacyId, currentId] of Object.entries(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    assert.equal(UNIT_TYPES[legacyId], undefined);
    assert.equal(UNIT_TYPES[currentId].hero, true);
    assert.equal(UNIT_TYPES[currentId].fictional, true);
  }

  for (const unit of Object.values(UNIT_TYPES)) {
    const playerFacing = `${unit.name} ${unit.short} ${unit.role}`;
    for (const name of PUBLIC_FIGURE_NAMES) assert.equal(playerFacing.includes(name), false);
    assert.ok(Number.isInteger(unit.pop) && unit.pop > 0);
    assert.ok(Object.values(unit.cost).some((amount) => amount > 0));
  }

  for (const mission of MISSIONS) {
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
      for (const id of mission[field]) {
        assert.ok(UNIT_TYPES[id], `${mission.id}.${field} references ${id}`);
        assert.equal(UNIT_TYPES[id].hero, true);
      }
    }
  }
});

test('runtime production paths map to current units and canonical roster ownership', () => {
  reconcileActiveRuntimeContent();

  for (const [buildingId, building] of Object.entries(BUILDING_TYPES)) {
    for (const unitId of building.produces ?? []) {
      assert.ok(UNIT_TYPES[unitId], `${buildingId} produces missing ${unitId}`);
      assert.ok(RUNTIME_CANONICAL_ROSTER_MAP[unitId], `${unitId} lacks canonical ownership`);
    }
  }

  assert.deepEqual(validateActiveRuntimeContent(), []);
});
