import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UPGRADE_HEALTH_POLICIES,
  UPGRADE_MODIFIER_OPERATIONS,
  createNewEntityUpgradePatch,
  createUpgradeDefinition,
  createUpgradeModifierState,
  createUpgradeSaveSnapshot,
  reconcileExistingEntityUpgrades,
  resolveUpgradeApplication,
  restoreUpgradeSaveSnapshot,
  upgradeAppliesTo,
  validateUpgradeDefinition,
} from '../../src/systems/upgrade-modifier-system.js';

const entity = Object.freeze({
  id: 'unit-7',
  faction: 'ukraine',
  unitType: 'uaTank',
  archetype: 'tank',
  vehicleClass: 'tank',
  tags: ['armor', 'tracked'],
  abilities: ['smokeLaunchers'],
});

const base = Object.freeze({
  baseStats: Object.freeze({ hp: 100, damage: 20, sight: 50 }),
  baseAbilities: Object.freeze({ smokeLaunchers: Object.freeze({ cooldown: 10, radius: 30, label: 'Smoke' }) }),
  baseVisual: Object.freeze({ tokens: Object.freeze(['base']), variants: Object.freeze({ hull: 't64' }) }),
});

function definition(id, overrides = {}) {
  return createUpgradeDefinition({ id, ...overrides });
}

test('definitions and state normalize deeply and reject invalid operations', () => {
  const upgrade = definition(' armor ', {
    priority: 2,
    target: { unitTypes: ['uaTank', 'uaTank'], tags: ['tracked'] },
    statModifiers: [{ stat: 'hp', operation: 'multiply', value: 1.2 }],
    visual: { tokens: ['cage', 'cage'], variants: { roof: 'slat' } },
  });
  assert.equal(upgrade.id, 'armor');
  assert.deepEqual(upgrade.target.unitTypes, ['uaTank']);
  assert.deepEqual(upgrade.visual.tokens, ['cage']);
  assert(Object.isFrozen(upgrade.target));
  assert(Object.isFrozen(createUpgradeModifierState({ activeUpgradeIds: ['b', 'a', 'a'] })));
  assert.deepEqual(createUpgradeModifierState({ activeUpgradeIds: ['b', 'a', 'a'] }).activeUpgradeIds, ['a', 'b']);
  assert.match(validateUpgradeDefinition({ id: 'bad', statModifiers: [{ stat: 'hp', operation: 'divide', value: 2 }] })[0], /Unknown/);
});

test('target filters require every declared dimension and ability', () => {
  const upgrade = definition('thermal', {
    target: {
      factions: ['ukraine'], unitTypes: ['uaTank'], archetypes: ['tank'], vehicleClasses: ['tank'],
      tags: ['armor'], requiresAbilities: ['smokeLaunchers'],
    },
  });
  assert.equal(upgradeAppliesTo(upgrade, entity), true);
  assert.equal(upgradeAppliesTo(upgrade, { ...entity, tags: [] }), false);
  assert.equal(upgradeAppliesTo(upgrade, { ...entity, faction: 'russia' }), false);
});

test('all additions apply before all multipliers regardless of input order', () => {
  const upgrades = [
    definition('multiply-first', { priority: -10, statModifiers: [{ stat: 'hp', operation: 'multiply', value: 2 }] }),
    definition('add-later', { priority: 50, statModifiers: [{ stat: 'hp', operation: 'add', value: 10 }] }),
  ];
  const resolved = resolveUpgradeApplication({
    ...base,
    entity,
    definitions: upgrades,
    state: createUpgradeModifierState({ activeUpgradeIds: ['multiply-first', 'add-later'] }),
  });
  assert.equal(resolved.stats.hp, 220);
  assert.deepEqual(resolved.provenance.stats.hp.map((item) => item.operation), ['add', 'multiply']);
});

test('definition priority and ID deterministically resolve visual conflicts', () => {
  const low = definition('z-low', { priority: 1, visual: { tokens: ['cage'], variants: { hull: 'low' } } });
  const highA = definition('a-high', { priority: 2, visual: { tokens: ['thermal'], variants: { hull: 'high-a' } } });
  const highZ = definition('z-high', { priority: 2, visual: { tokens: ['thermal'], variants: { hull: 'high-z' } } });
  const options = {
    ...base, entity,
    state: createUpgradeModifierState({ activeUpgradeIds: ['z-high', 'z-low', 'a-high'] }),
  };
  const left = resolveUpgradeApplication({ ...options, definitions: [highZ, low, highA] });
  const right = resolveUpgradeApplication({ ...options, definitions: [highA, highZ, low] });
  assert.deepEqual(left, right);
  assert.equal(left.visual.variants.hull, 'high-z');
  assert.deepEqual(left.visual.tokens, ['base', 'cage', 'thermal']);
});

test('ability modifiers use the same additive-then-multiplicative rule', () => {
  const upgrade = definition('smoke-suite', {
    target: { requiresAbilities: ['smokeLaunchers'] },
    abilityModifiers: [
      { abilityId: 'smokeLaunchers', stat: 'radius', operation: 'multiply', value: 1.5 },
      { abilityId: 'smokeLaunchers', stat: 'radius', operation: 'add', value: 10 },
      { abilityId: 'smokeLaunchers', stat: 'cooldown', operation: 'multiply', value: 0.8 },
    ],
  });
  const resolved = resolveUpgradeApplication({
    ...base, entity, definitions: [upgrade],
    state: createUpgradeModifierState({ activeUpgradeIds: ['smoke-suite'] }),
  });
  assert.equal(resolved.abilities.smokeLaunchers.radius, 60);
  assert.equal(resolved.abilities.smokeLaunchers.cooldown, 8);
  assert.equal(resolved.abilities.smokeLaunchers.label, 'Smoke');
});

test('ability modifiers reject unknown ability targets instead of silently drifting', () => {
  const upgrade = definition('bad-ability', {
    abilityModifiers: [{ abilityId: 'missing', stat: 'range', operation: 'add', value: 5 }],
  });
  assert.throws(() => resolveUpgradeApplication({
    ...base, entity, definitions: [upgrade],
    state: createUpgradeModifierState({ activeUpgradeIds: ['bad-ability'] }),
  }), /unknown ability/);
});

test('additive modifiers may introduce new numeric stats while multiplication requires a base', () => {
  const additive = definition('resistance', {
    statModifiers: [{ stat: 'droneResistance', operation: 'add', value: 0.25 }],
  });
  const resolved = resolveUpgradeApplication({
    ...base, entity, definitions: [additive],
    state: createUpgradeModifierState({ activeUpgradeIds: ['resistance'] }),
  });
  assert.equal(resolved.stats.droneResistance, 0.25);
  const multiplier = definition('bad-new-stat', {
    statModifiers: [{ stat: 'unknown', operation: 'multiply', value: 2 }],
  });
  assert.throws(() => resolveUpgradeApplication({
    ...base, entity, definitions: [multiplier],
    state: createUpgradeModifierState({ activeUpgradeIds: ['bad-new-stat'] }),
  }), /requires a finite base value/);
});

test('new and existing entities receive identical upgraded profiles', () => {
  const upgrade = definition('durability', {
    statModifiers: [{ stat: 'hp', operation: UPGRADE_MODIFIER_OPERATIONS.MULTIPLY, value: 1.5 }],
    visual: { tokens: ['reinforced'] },
  });
  const before = resolveUpgradeApplication({ ...base, entity, definitions: [upgrade], state: createUpgradeModifierState() });
  const after = resolveUpgradeApplication({
    ...base, entity, definitions: [upgrade],
    state: createUpgradeModifierState({ activeUpgradeIds: ['durability'] }),
  });
  const fresh = createNewEntityUpgradePatch(after);
  const existing = reconcileExistingEntityUpgrades({ hp: 50, maxHp: 100 }, before, after);
  assert.equal(fresh.hp, 150);
  assert.equal(existing.hp, 75);
  assert.strictEqual(fresh.stats, existing.stats);
  assert.strictEqual(fresh.abilities, existing.abilities);
  assert.strictEqual(fresh.visual, existing.visual);
});

test('existing health reconciliation supports ratio, deficit, and clamp policies', () => {
  const previous = resolveUpgradeApplication({ ...base, entity });
  const next = resolveUpgradeApplication({
    ...base, entity,
    definitions: [definition('hp', { statModifiers: [{ stat: 'hp', operation: 'add', value: 50 }] })],
    state: createUpgradeModifierState({ activeUpgradeIds: ['hp'] }),
  });
  const live = { hp: 40, maxHp: 100 };
  assert.equal(reconcileExistingEntityUpgrades(live, previous, next).hp, 60);
  assert.equal(reconcileExistingEntityUpgrades(live, previous, next, { healthPolicy: UPGRADE_HEALTH_POLICIES.PRESERVE_DEFICIT }).hp, 90);
  assert.equal(reconcileExistingEntityUpgrades(live, previous, next, { healthPolicy: UPGRADE_HEALTH_POLICIES.CLAMP_CURRENT }).hp, 40);
});

test('resolution is reference-free, frozen, and does not mutate inputs', () => {
  const mutableStats = { hp: 100, damage: 20 };
  const mutableAbility = { smokeLaunchers: { cooldown: 10 } };
  const resolved = resolveUpgradeApplication({
    baseStats: mutableStats,
    baseAbilities: mutableAbility,
    entity,
    definitions: [definition('damage', { statModifiers: [{ stat: 'damage', operation: 'multiply', value: 1.2 }] })],
    state: createUpgradeModifierState({ activeUpgradeIds: ['damage'] }),
  });
  assert.deepEqual(mutableStats, { hp: 100, damage: 20 });
  assert.deepEqual(mutableAbility, { smokeLaunchers: { cooldown: 10 } });
  assert.equal(resolved.stats.damage, 24);
  assert(Object.isFrozen(resolved));
  assert(Object.isFrozen(resolved.abilities.smokeLaunchers));
});

test('save snapshots round trip deterministically and reject unknown or future data', () => {
  const state = createUpgradeModifierState({ activeUpgradeIds: ['thermal', 'armor'] });
  const snapshot = createUpgradeSaveSnapshot(state);
  assert.deepEqual(snapshot, { schemaVersion: 1, activeUpgradeIds: ['armor', 'thermal'] });
  assert.deepEqual(restoreUpgradeSaveSnapshot(snapshot, { knownUpgradeIds: ['thermal', 'armor', 'ammo'] }), state);
  assert.throws(() => restoreUpgradeSaveSnapshot(snapshot, { knownUpgradeIds: ['armor'] }), /unknown upgrades/);
  assert.throws(() => restoreUpgradeSaveSnapshot({ ...snapshot, schemaVersion: 2 }), /Unsupported/);
});

test('unknown active upgrades and duplicate definitions fail closed', () => {
  assert.throws(() => resolveUpgradeApplication({
    ...base, entity, definitions: [],
    state: createUpgradeModifierState({ activeUpgradeIds: ['missing'] }),
  }), /Unknown active upgrades/);
  const duplicate = definition('duplicate');
  assert.throws(() => resolveUpgradeApplication({
    ...base, entity, definitions: [duplicate, duplicate],
    state: createUpgradeModifierState(),
  }), /Duplicate upgrade definition/);
});
