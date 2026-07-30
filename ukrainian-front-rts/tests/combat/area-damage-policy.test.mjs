import assert from 'node:assert/strict';
import test from 'node:test';

import { TARGET_DOMAINS } from '../../src/combat/combat-schema.js';
import {
  AREA_DAMAGE_OWNERSHIP,
  createAreaDamagePolicy,
  DEFAULT_AREA_DAMAGE_POLICY,
  FRIENDLY_FIRE_MODES,
  resolveAreaDamage,
  SPLASH_FALLOFF_CURVES,
  STRUCTURE_DAMAGE_MODES,
} from '../../src/combat/area-damage-policy.js';

const target = (id, x, overrides = {}) => ({
  id,
  x,
  y: 0,
  side: 'blue',
  domain: TARGET_DOMAINS.GROUND,
  ...overrides,
});

test('default policy is immutable and validated on creation', () => {
  assert.ok(Object.isFrozen(DEFAULT_AREA_DAMAGE_POLICY));
  assert.equal(DEFAULT_AREA_DAMAGE_POLICY.falloffCurve, SPLASH_FALLOFF_CURVES.LINEAR);
  assert.throws(() => createAreaDamagePolicy({ minimumDamageRatio: 1.1 }), /between 0 and 1/);
  assert.throws(() => createAreaDamagePolicy({ falloffCurve: 'inverse-square' }), /Unknown splash falloff/);
});

test('linear falloff preserves full inner damage and applies the minimum ratio at the radius boundary', () => {
  const policy = createAreaDamagePolicy({ innerRadiusRatio: 0.25, minimumDamageRatio: 0.2 });
  const result = resolveAreaDamage({
    impactX: 0,
    impactY: 0,
    radius: 100,
    baseDamage: 100,
    source: { side: 'red' },
    targets: [target('outside', 100.001), target('edge', 100), target('inner', 25), target('middle', 62.5)],
    policy,
  });

  assert.deepEqual(result.applications.map(({ targetId, damage }) => [targetId, damage]), [
    ['edge', 20],
    ['inner', 100],
    ['middle', 50],
  ]);
  assert.deepEqual(result.skipped.map(({ targetId, reason }) => [targetId, reason]), [['outside', 'outside-radius']]);
});

test('constant and quadratic curves produce their documented midpoint damage', () => {
  const common = {
    impactX: 0,
    impactY: 0,
    radius: 100,
    baseDamage: 100,
    source: { side: 'red' },
    targets: [target('midpoint', 50)],
  };
  const constant = resolveAreaDamage({
    ...common,
    policy: createAreaDamagePolicy({
      falloffCurve: SPLASH_FALLOFF_CURVES.CONSTANT,
      innerRadiusRatio: 0,
      minimumDamageRatio: 0,
    }),
  });
  const quadratic = resolveAreaDamage({
    ...common,
    policy: createAreaDamagePolicy({
      falloffCurve: SPLASH_FALLOFF_CURVES.QUADRATIC,
      innerRadiusRatio: 0,
      minimumDamageRatio: 0,
    }),
  });

  assert.equal(constant.applications[0].damage, 100);
  assert.equal(quadratic.applications[0].damage, 25);
});

test('collision radius measures splash distance to the target footprint', () => {
  const result = resolveAreaDamage({
    impactX: 0,
    impactY: 0,
    radius: 10,
    baseDamage: 50,
    source: { side: 'red' },
    targets: [target('wide', 15, { collisionRadius: 5 })],
  });
  assert.equal(result.applications[0].distance, 10);
  assert.equal(result.applications[0].damage, 10);
});

test('friendly-fire modes exclude, fully damage, or scale allies without changing enemies', () => {
  const targets = [target('ally', 0), target('enemy', 0, { side: 'red' })];
  const disabled = resolveAreaDamage({ impactX: 0, impactY: 0, radius: 10, baseDamage: 40, source: { side: 'blue' }, targets });
  assert.deepEqual(disabled.applications.map(({ targetId }) => targetId), ['enemy']);
  assert.equal(disabled.skipped[0].reason, 'friendly-fire-disabled');

  const full = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 40, source: { side: 'blue' }, targets,
    policy: createAreaDamagePolicy({ friendlyFireMode: FRIENDLY_FIRE_MODES.FULL }),
  });
  assert.deepEqual(full.applications.map(({ damage }) => damage), [40, 40]);

  const scaled = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 40, source: { side: 'blue' }, targets,
    policy: createAreaDamagePolicy({ friendlyFireMode: FRIENDLY_FIRE_MODES.SCALED, friendlyFireMultiplier: 0.25 }),
  });
  assert.deepEqual(scaled.applications.map(({ targetId, damage }) => [targetId, damage]), [['ally', 10], ['enemy', 40]]);
});

test('structure damage is independently disabled, full, or scaled', () => {
  const structure = target('building', 0, { side: 'red', domain: TARGET_DOMAINS.STRUCTURE });
  const disabled = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 80, source: { side: 'blue' }, targets: [structure],
    policy: createAreaDamagePolicy({ structureDamageMode: STRUCTURE_DAMAGE_MODES.DISABLED }),
  });
  assert.equal(disabled.skipped[0].reason, 'structure-damage-disabled');

  const full = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 80, source: { side: 'blue' }, targets: [structure],
    policy: createAreaDamagePolicy({ structureDamageMode: STRUCTURE_DAMAGE_MODES.FULL }),
  });
  assert.equal(full.applications[0].damage, 80);

  const scaled = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 80, source: { side: 'blue' }, targets: [structure],
    policy: createAreaDamagePolicy({ structureDamageMode: STRUCTURE_DAMAGE_MODES.SCALED, structureDamageMultiplier: 0.5 }),
  });
  assert.equal(scaled.applications[0].damage, 40);

  const alliedScaled = resolveAreaDamage({
    impactX: 0, impactY: 0, radius: 10, baseDamage: 80, source: { side: 'blue' },
    targets: [target('allied-building', 0, { domain: TARGET_DOMAINS.STRUCTURE })],
    policy: createAreaDamagePolicy({
      friendlyFireMode: FRIENDLY_FIRE_MODES.SCALED,
      friendlyFireMultiplier: 0.5,
      structureDamageMode: STRUCTURE_DAMAGE_MODES.SCALED,
      structureDamageMultiplier: 0.5,
    }),
  });
  assert.equal(alliedScaled.applications[0].damage, 20);
});

test('target resolution is stable by id and effect output contains no live target references', () => {
  const targets = [target('zulu', 0, { side: 'red' }), target('alpha', 0, { side: 'red' })];
  const result = resolveAreaDamage({ impactX: 4, impactY: 5, radius: 12, baseDamage: 10, source: { side: 'blue' }, targets });

  assert.deepEqual(result.applications.map(({ targetId }) => targetId), ['alpha', 'zulu']);
  assert.deepEqual(result.effect, {
    owner: AREA_DAMAGE_OWNERSHIP.effect,
    kind: 'blast',
    x: 4,
    y: 5,
    radius: 12,
    affectedTargetIds: ['alpha', 'zulu'],
  });
  assert.equal(result.owner, AREA_DAMAGE_OWNERSHIP.damage);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.effect.affectedTargetIds));
  assert.equal('target' in result.applications[0], false);
});

test('zero-radius splash only affects a footprint touching the impact point', () => {
  const result = resolveAreaDamage({
    impactX: 0,
    impactY: 0,
    radius: 0,
    baseDamage: 30,
    source: { side: 'red' },
    targets: [target('exact', 0), target('touching', 4, { collisionRadius: 4 }), target('outside', 0.001)],
  });
  assert.deepEqual(result.applications.map(({ targetId, damage }) => [targetId, damage]), [['exact', 30], ['touching', 30]]);
  assert.deepEqual(result.skipped.map(({ targetId }) => targetId), ['outside']);
});

test('invalid and ambiguous inputs fail before producing partial results', () => {
  assert.throws(() => resolveAreaDamage({ impactX: 0, impactY: 0, radius: -1, baseDamage: 10 }), /non-negative/);
  assert.throws(() => resolveAreaDamage({ impactX: 0, impactY: 0, radius: 1, baseDamage: 10, targets: [target('same', 0), target('same', 0)] }), /Duplicate/);
  assert.throws(() => resolveAreaDamage({ impactX: 0, impactY: 0, radius: 1, baseDamage: 10, targets: [target('bad', 0, { domain: 'subterranean' })] }), /Unknown target domain/);
});
