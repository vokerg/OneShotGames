import assert from 'node:assert/strict';
import test from 'node:test';

import { TARGET_DOMAINS } from '../../src/combat/combat-schema.js';
import {
  BAILOUT_TRIGGERS,
  DAMAGE_CONDITIONS,
  DEFAULT_DESTRUCTION_POLICY,
  DESTRUCTION_PHASES,
  applyDestructionDamage,
  applyWreckSalvage,
  clearWreckObstruction,
  createDestructionPolicy,
  createDestructionState,
  damageWreck,
  deriveDamageCondition,
  materializeWreck,
  tickBurning,
  validateDestructionPolicy,
} from '../../src/combat/destruction-system.js';

function entity(overrides = {}) {
  return {
    id: 'vehicle-1',
    team: 'blue',
    domain: TARGET_DOMAINS.GROUND,
    hp: 100,
    maxHp: 100,
    crew: 4,
    position: { x: 120, y: 80 },
    radius: 12,
    cost: { metal: 101, fuel: 40 },
    ...overrides,
  };
}

function destroyedState(subject = entity(), policy = DEFAULT_DESTRUCTION_POLICY) {
  const state = createDestructionState(subject, policy);
  return applyDestructionDamage(state, subject, state.hp, {}, policy).state;
}

test('default policy is deeply immutable and validation rejects invalid threshold ordering', () => {
  assert.equal(Object.isFrozen(DEFAULT_DESTRUCTION_POLICY), true);
  assert.equal(Object.isFrozen(DEFAULT_DESTRUCTION_POLICY.bailoutDomains), true);
  assert.deepEqual(validateDestructionPolicy(DEFAULT_DESTRUCTION_POLICY), []);
  assert.throws(
    () => createDestructionPolicy({ damagedThresholdRatio: 0.2, disabledThresholdRatio: 0.4 }),
    /disabledThresholdRatio cannot exceed damagedThresholdRatio/,
  );
  assert.throws(
    () => createDestructionPolicy({ bailoutDomains: ['space'] }),
    /unknown target domain/,
  );
});

test('damage conditions use exact damaged and disabled boundaries', () => {
  const policy = createDestructionPolicy({
    damagedThresholdRatio: 0.6,
    disabledThresholdRatio: 0.2,
  });
  assert.equal(deriveDamageCondition(61, 100, policy), DAMAGE_CONDITIONS.HEALTHY);
  assert.equal(deriveDamageCondition(60, 100, policy), DAMAGE_CONDITIONS.DAMAGED);
  assert.equal(deriveDamageCondition(21, 100, policy), DAMAGE_CONDITIONS.DAMAGED);
  assert.equal(deriveDamageCondition(20, 100, policy), DAMAGE_CONDITIONS.DISABLED);
  assert.equal(deriveDamageCondition(0, 100, policy), DAMAGE_CONDITIONS.DISABLED);
});

test('damage transitions healthy to damaged to disabled with reason-specific events', () => {
  const subject = entity();
  let state = createDestructionState(subject);
  const damaged = applyDestructionDamage(state, subject, 35);
  assert.equal(damaged.state.hp, 65);
  assert.equal(damaged.state.condition, DAMAGE_CONDITIONS.DAMAGED);
  assert.equal(damaged.events[0].type, 'condition-changed');

  const disabled = applyDestructionDamage(damaged.state, subject, 40);
  assert.equal(disabled.state.hp, 25);
  assert.equal(disabled.state.condition, DAMAGE_CONDITIONS.DISABLED);
  assert.equal(disabled.state.phase, DESTRUCTION_PHASES.ACTIVE);
  assert.equal(disabled.events.some((entry) => entry.type === 'crew-bailed-out'), true);
  assert.equal(disabled.state.bailout.survivors, 3);
});

test('explicit ignition applies deterministic burn damage and destroys at burn expiry', () => {
  const policy = createDestructionPolicy({
    burnDamagePerSecond: 10,
    burnDurationSeconds: 2,
    destroyWhenBurnExpires: true,
    bailoutTrigger: BAILOUT_TRIGGERS.BURNING,
  });
  const subject = entity();
  const state = createDestructionState(subject, policy);
  const ignited = applyDestructionDamage(state, subject, 1, { ignite: true }, policy);
  assert.equal(ignited.state.phase, DESTRUCTION_PHASES.BURNING);
  assert.equal(ignited.state.burningRemaining, 2);
  assert.equal(ignited.state.bailout.survivors, 1);

  const firstTick = tickBurning(ignited.state, subject, 1, policy);
  assert.equal(firstTick.state.hp, 89);
  assert.equal(firstTick.state.burningRemaining, 1);
  assert.equal(firstTick.state.phase, DESTRUCTION_PHASES.BURNING);

  const secondTick = tickBurning(firstTick.state, subject, 1, policy);
  assert.equal(secondTick.appliedDamage, 10);
  assert.equal(secondTick.state.hp, 0);
  assert.equal(secondTick.state.phase, DESTRUCTION_PHASES.DESTROYED);
  assert.equal(secondTick.events.some((entry) => entry.type === 'entity-destroyed'), true);
});

test('burning can extinguish without destruction when policy allows it', () => {
  const policy = createDestructionPolicy({
    burnDamagePerSecond: 5,
    burnDurationSeconds: 1,
    destroyWhenBurnExpires: false,
    bailoutTrigger: BAILOUT_TRIGGERS.DESTROYED,
  });
  const subject = entity();
  const state = createDestructionState(subject, policy);
  const ignited = applyDestructionDamage(state, subject, 10, { ignite: true }, policy);
  const ended = tickBurning(ignited.state, subject, 1, policy);
  assert.equal(ended.state.hp, 85);
  assert.equal(ended.state.phase, DESTRUCTION_PHASES.ACTIVE);
  assert.equal(ended.state.burningRemaining, 0);
  assert.equal(ended.events.at(-1).type, 'burning-ended');
  assert.equal(ended.state.bailout, null);
});

test('crew bailout triggers once and respects trigger penalties and domains', () => {
  const burningPolicy = createDestructionPolicy({
    bailoutTrigger: BAILOUT_TRIGGERS.BURNING,
    bailoutSurvivorRatio: 0.8,
    burningSurvivorPenalty: 0.3,
  });
  const subject = entity({ crew: 5 });
  const state = createDestructionState(subject, burningPolicy);
  const burning = applyDestructionDamage(state, subject, 5, { ignite: true }, burningPolicy);
  assert.equal(burning.state.bailout.survivors, 2);
  const destroyed = applyDestructionDamage(burning.state, subject, 500, {}, burningPolicy);
  assert.strictEqual(destroyed.state.bailout, burning.state.bailout);
  assert.equal(destroyed.events.some((entry) => entry.type === 'crew-bailed-out'), false);

  const air = entity({ id: 'air-1', domain: TARGET_DOMAINS.AIR, crew: 3 });
  const airState = createDestructionState(air, burningPolicy);
  const airBurning = applyDestructionDamage(airState, air, 5, { ignite: true }, burningPolicy);
  assert.equal(airBurning.state.bailout, null);
});

test('destroyed entities materialize immutable wrecks with deterministic salvage and obstruction', () => {
  const subject = entity();
  const state = destroyedState(subject);
  const result = materializeWreck(state, subject);
  assert.equal(result.state.phase, DESTRUCTION_PHASES.WRECK);
  assert.equal(result.state.wreck.id, 'vehicle-1:wreck');
  assert.equal(result.state.wreck.hp, 30);
  assert.deepEqual(result.state.wreck.salvageValue, { fuel: 10, metal: 25 });
  assert.deepEqual(result.state.wreck.obstruction, {
    blocksMovement: true,
    blocksLineOfSight: false,
    cleared: false,
  });
  assert.equal(Object.isFrozen(result.state.wreck), true);
  assert.equal(Object.isFrozen(result.state.wreck.position), true);
  assert.equal(result.events[0].type, 'wreck-created');
});

test('authored salvage values override cost-derived salvage', () => {
  const subject = entity({
    salvageBase: { intel: 3, metal: 12 },
    cost: { metal: 999 },
  });
  const state = destroyedState(subject);
  const wreck = materializeWreck(state, subject);
  assert.deepEqual(wreck.state.wreck.salvageValue, { intel: 3, metal: 12 });
});

test('salvage work progresses deterministically and clears obstruction on completion', () => {
  const policy = createDestructionPolicy({ salvageWorkRequired: 50 });
  const subject = entity();
  const state = destroyedState(subject, policy);
  const wreck = materializeWreck(state, subject, policy).state;

  const partial = applyWreckSalvage(wreck, 20, policy);
  assert.equal(partial.appliedWork, 20);
  assert.equal(partial.state.phase, DESTRUCTION_PHASES.WRECK);
  assert.equal(partial.state.wreck.salvageWorkRemaining, 30);

  const completed = applyWreckSalvage(partial.state, 100, policy);
  assert.equal(completed.appliedWork, 30);
  assert.equal(completed.state.phase, DESTRUCTION_PHASES.SALVAGED);
  assert.deepEqual(completed.state.recoveredSalvage, { fuel: 10, metal: 25 });
  assert.equal(completed.state.wreck.obstruction.cleared, true);
  assert.equal(completed.events.at(-1).type, 'salvage-completed');
});

test('wreck destruction forfeits salvage and clears movement and sight obstruction', () => {
  const policy = createDestructionPolicy({ wreckBlocksLineOfSight: true });
  const subject = entity();
  const state = destroyedState(subject, policy);
  const wreck = materializeWreck(state, subject, policy).state;
  const result = damageWreck(wreck, wreck.wreck.hp);
  assert.equal(result.state.phase, DESTRUCTION_PHASES.CLEARED);
  assert.equal(result.state.wreck.hp, 0);
  assert.equal(result.state.wreck.obstruction.cleared, true);
  assert.equal(result.state.wreck.obstruction.blocksMovement, false);
  assert.equal(result.state.wreck.obstruction.blocksLineOfSight, false);
  assert.deepEqual(result.state.recoveredSalvage, {});
  assert.equal(result.events.at(-1).type, 'obstruction-cleared');
});

test('manual cleanup handles persistent salvaged obstructions and is idempotent', () => {
  const policy = createDestructionPolicy({
    salvageWorkRequired: 1,
    clearObstructionOnSalvage: false,
  });
  const subject = entity();
  const state = destroyedState(subject, policy);
  const wreck = materializeWreck(state, subject, policy).state;
  const salvaged = applyWreckSalvage(wreck, 1, policy).state;
  assert.equal(salvaged.phase, DESTRUCTION_PHASES.SALVAGED);
  assert.equal(salvaged.wreck.obstruction.cleared, false);

  const cleared = clearWreckObstruction(salvaged, 'engineer-clearance');
  assert.equal(cleared.state.phase, DESTRUCTION_PHASES.CLEARED);
  assert.equal(cleared.state.lastTransition, 'engineer-clearance');
  assert.equal(cleared.events[0].type, 'obstruction-cleared');

  const repeated = clearWreckObstruction(cleared.state);
  assert.strictEqual(repeated.state, cleared.state);
  assert.equal(repeated.reason, 'not-clearable');
});

test('invalid damage, time, entity mismatches, and phase operations fail safely', () => {
  const subject = entity();
  const state = createDestructionState(subject);
  assert.throws(
    () => applyDestructionDamage(state, subject, -1),
    /non-negative finite number/,
  );
  assert.throws(
    () => tickBurning(state, subject, -0.1),
    /non-negative finite number/,
  );
  assert.throws(
    () => applyDestructionDamage(state, entity({ id: 'other' }), 1),
    /ids do not match/,
  );
  const notDestroyed = materializeWreck(state, subject);
  assert.strictEqual(notDestroyed.state, state);
  assert.equal(notDestroyed.reason, 'not-destroyed');
  const notWreck = applyWreckSalvage(state, 10);
  assert.strictEqual(notWreck.state, state);
  assert.equal(notWreck.reason, 'not-wreck');
});
