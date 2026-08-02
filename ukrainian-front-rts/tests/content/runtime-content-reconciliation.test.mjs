import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_TYPES, MISSIONS, UNIT_TYPES } from '../../src/config.js';
import {
  DECLARATIVE_ROSTER_OWNERS,
  LEGACY_RUNTIME_UNIT_ID_MIGRATIONS,
  migrateRuntimeContentReferences,
  migrateRuntimeUnitId,
  migrateRuntimeUnitIds,
  reconcileActiveRuntimeContent,
  RUNTIME_CANONICAL_ROSTER_MAP,
  RUNTIME_RESOURCE_IDS,
  validateActiveRuntimeContent,
  validateStableRosterOwnership,
} from '../../src/content/runtime-content-reconciliation.js';

const PUBLIC_FIGURE_NAMES = [
  'Volodymyr Zelenskyy',
  'Valerii Zaluzhnyi',
  'Vladimir Putin',
  'Yevgeny Prigozhin',
];

test('legacy and canonical unit IDs migrate deterministically while unknown IDs fail actionably', () => {
  for (const [legacyId, currentId] of Object.entries(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    assert.deepEqual(migrateRuntimeUnitId(legacyId), {
      status: 'migrated', id: currentId, legacyId, error: null,
    });
  }
  assert.equal(migrateRuntimeUnitId('ua.command-team').id, 'uaCommandVarta');
  assert.equal(migrateRuntimeUnitId('ru.command-group').id, 'ruCommandBastion');

  const collapsed = migrateRuntimeUnitIds(['uaZelenskyy', 'uaZaluzhnyi']);
  assert.equal(collapsed.status, 'migrated');
  assert.deepEqual(collapsed.ids, ['uaCommandVarta']);

  const unsupported = migrateRuntimeUnitId('uaUnknownPrototypeHero');
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.id, null);
  assert.match(unsupported.error, /Update the save or configuration/);
});

test('save and configuration unit fields migrate strictly without mutating the source record', () => {
  const source = {
    heroes: ['uaZelenskyy', 'uaZaluzhnyi'],
    units: [
      { type: 'uaZaluzhnyi', order: 'hold' },
      { type: 'ruPrigozhin' },
    ],
  };
  const migrated = migrateRuntimeContentReferences(source);
  assert.equal(migrated.status, 'migrated');
  assert.deepEqual(migrated.errors, []);
  assert.deepEqual(migrated.value, {
    heroes: ['uaCommandVarta'],
    units: [
      { order: 'hold', type: 'uaCommandVarta' },
      { type: 'ruCommandBastion' },
    ],
  });
  assert.equal(source.units[0].type, 'uaZaluzhnyi');

  const unsupported = migrateRuntimeContentReferences({ units: [{ type: 'removedUnit' }] });
  assert.equal(unsupported.status, 'unsupported');
  assert.match(unsupported.errors[0], /Unsupported runtime unit ID/);
});

test('runtime reconciliation removes public figures and projects one canonical identity per active unit', () => {
  const first = reconcileActiveRuntimeContent();
  const second = reconcileActiveRuntimeContent();
  assert.strictEqual(second, first);

  for (const [legacyId, currentId] of Object.entries(LEGACY_RUNTIME_UNIT_ID_MIGRATIONS)) {
    assert.equal(UNIT_TYPES[legacyId], undefined);
    assert.equal(UNIT_TYPES[currentId].hero, true);
    assert.equal(UNIT_TYPES[currentId].fictional, true);
  }

  const canonicalIds = new Set();
  for (const [runtimeId, unit] of Object.entries(UNIT_TYPES)) {
    const playerFacing = `${unit.name} ${unit.short} ${unit.role}`;
    for (const name of PUBLIC_FIGURE_NAMES) assert.equal(playerFacing.includes(name), false);
    assert.equal(unit.runtimeId, runtimeId);
    assert.equal(unit.canonicalId, RUNTIME_CANONICAL_ROSTER_MAP[runtimeId]);
    assert.equal(canonicalIds.has(unit.canonicalId), false, `duplicate ${unit.canonicalId}`);
    canonicalIds.add(unit.canonicalId);
    assert.ok(unit.canonicalProducerId);
    assert.ok(Array.isArray(unit.canonicalRequires));
    assert.ok(unit.contentOwner);
    assert.equal(unit.commandCapacityCost, unit.pop);
    assert.deepEqual(Object.keys(unit.cost), RUNTIME_RESOURCE_IDS);
    assert.ok(Object.values(unit.cost).some((amount) => amount > 0));
    assert.ok(unit.targetDomains.length > 0);
  }

  for (const mission of MISSIONS) {
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) {
      assert.equal(new Set(mission[field]).size, mission[field].length);
      for (const id of mission[field]) {
        assert.ok(UNIT_TYPES[id], `${mission.id}.${field} references ${id}`);
        assert.equal(UNIT_TYPES[id].hero, true);
        assert.equal(UNIT_TYPES[id].fictional, true);
      }
    }
  }
});

test('runtime production paths and ownership remain canonical and duplicate owners are rejected', () => {
  reconcileActiveRuntimeContent();
  for (const [buildingId, building] of Object.entries(BUILDING_TYPES)) {
    for (const unitId of building.produces ?? []) {
      assert.ok(UNIT_TYPES[unitId], `${buildingId} produces missing ${unitId}`);
      assert.ok(RUNTIME_CANONICAL_ROSTER_MAP[unitId], `${unitId} lacks canonical ownership`);
      assert.ok(building.canonicalProducerIds.includes(UNIT_TYPES[unitId].canonicalProducerId));
    }
  }
  assert.deepEqual(validateStableRosterOwnership(), []);
  assert.match(
    validateStableRosterOwnership({
      ...DECLARATIVE_ROSTER_OWNERS,
      duplicate: ['ua.command-team'],
    })[0],
    /duplicate stable roster ownership/,
  );
  assert.deepEqual(validateActiveRuntimeContent(), []);
});
