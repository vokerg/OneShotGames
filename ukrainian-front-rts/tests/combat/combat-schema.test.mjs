import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARMOR_CLASSES,
  canTargetDomain,
  createDefenseProfile,
  createWeaponProfile,
  DAMAGE_CLASSES,
  resolveDamageMultiplier,
  RESISTANCE_CLASSES,
  SPLASH_CLASSES,
  TARGET_DOMAINS,
  validateDefenseProfile,
  validateWeaponProfile,
} from '../../src/combat/combat-schema.js';

test('constructors create valid immutable profiles', () => {
  const weapon = createWeaponProfile({
    damageClass: DAMAGE_CLASSES.AUTOCANNON,
    targetDomains: [TARGET_DOMAINS.GROUND, TARGET_DOMAINS.AIR],
    splashClass: SPLASH_CLASSES.SMALL,
  });
  const defense = createDefenseProfile({
    armorClass: ARMOR_CLASSES.LIGHT,
    resistanceClass: RESISTANCE_CLASSES.VEHICLE,
  });
  assert.deepEqual(validateWeaponProfile(weapon), []);
  assert.deepEqual(validateDefenseProfile(defense), []);
  assert.equal(Object.isFrozen(weapon), true);
  assert.equal(Object.isFrozen(defense), true);
});

test('validators reject unknown classes and empty domains', () => {
  assert.ok(validateWeaponProfile({ schemaVersion: 1, damageClass: 'laser', targetDomains: [], splashClass: 'none', penetration: null }).length >= 2);
  assert.ok(validateDefenseProfile({ schemaVersion: 1, armorClass: 'magic', resistanceClass: 'none' }).length >= 1);
});

test('domain validation prevents invalid target engagement', () => {
  const weapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.KINETIC, targetDomains: [TARGET_DOMAINS.GROUND] });
  assert.equal(canTargetDomain(weapon, TARGET_DOMAINS.GROUND), true);
  assert.equal(canTargetDomain(weapon, TARGET_DOMAINS.AIR), false);
});

test('counter matrix favors kinetic damage against heavy armor', () => {
  const weapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.KINETIC });
  const soft = createDefenseProfile({ armorClass: ARMOR_CLASSES.SOFT });
  const heavy = createDefenseProfile({ armorClass: ARMOR_CLASSES.HEAVY });
  assert.ok(resolveDamageMultiplier(weapon, heavy) > resolveDamageMultiplier(weapon, soft));
});

test('high explosive is stronger against soft targets than heavy armor', () => {
  const weapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.HIGH_EXPLOSIVE });
  const soft = createDefenseProfile({ armorClass: ARMOR_CLASSES.SOFT });
  const heavy = createDefenseProfile({ armorClass: ARMOR_CLASSES.HEAVY });
  assert.ok(resolveDamageMultiplier(weapon, soft) > resolveDamageMultiplier(weapon, heavy));
});

test('resistance and penetration modifiers are deterministic', () => {
  const baseWeapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.SHAPED_CHARGE });
  const reducedWeapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.SHAPED_CHARGE, penetration: 0.5 });
  const normal = createDefenseProfile({ armorClass: ARMOR_CLASSES.MEDIUM });
  const fortified = createDefenseProfile({ armorClass: ARMOR_CLASSES.MEDIUM, resistanceClass: RESISTANCE_CLASSES.FORTIFIED });
  assert.equal(resolveDamageMultiplier(baseWeapon, normal), 1.1);
  assert.equal(resolveDamageMultiplier(reducedWeapon, fortified), 1.1 * 0.8 * 0.5);
});

test('unsupported target domains resolve to zero damage', () => {
  const weapon = createWeaponProfile({ damageClass: DAMAGE_CLASSES.SMALL_ARMS, targetDomains: [TARGET_DOMAINS.GROUND] });
  const defense = createDefenseProfile({ armorClass: ARMOR_CLASSES.LIGHT });
  assert.equal(resolveDamageMultiplier(weapon, defense, TARGET_DOMAINS.AIR), 0);
});
