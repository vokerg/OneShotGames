import assert from 'node:assert/strict';
import test from 'node:test';

import { TARGET_DOMAINS } from '../../src/combat/combat-schema.js';
import {
  DEFAULT_REPAIR_POLICY,
  REPAIR_CONTEXTS,
  REPAIR_ORDER_STATES,
  cancelRepairOrder,
  chooseRepairTarget,
  createRepairOrder,
  createRepairPolicy,
  evaluateRepairTarget,
  rankRepairTargets,
  resolveRepairTick,
  validateRepairPolicy,
} from '../../src/combat/repair-system.js';

const target = (overrides = {}) => ({
  id: 'tank-1',
  team: 0,
  domain: TARGET_DOMAINS.GROUND,
  hp: 40,
  maxHp: 100,
  ...overrides,
});

const fieldOrder = (overrides = {}) => createRepairOrder({
  id: 'repair-1',
  team: 0,
  targetId: 'tank-1',
  repairerIds: ['eng-2', 'eng-1'],
  ...overrides,
});

test('default policy is deeply frozen and invalid policies are rejected', () => {
  assert.equal(Object.isFrozen(DEFAULT_REPAIR_POLICY), true);
  assert.equal(Object.isFrozen(DEFAULT_REPAIR_POLICY.resourcePerHp), true);
  assert.deepEqual(DEFAULT_REPAIR_POLICY.repairableDomains, ['air', 'ground', 'structure']);
  assert.deepEqual(validateRepairPolicy(DEFAULT_REPAIR_POLICY), []);
  assert.throws(() => createRepairPolicy({ fieldRepairMaxRatio: 0.9, facilityRepairMaxRatio: 0.8 }), /at least fieldRepairMaxRatio/);
  assert.throws(() => createRepairPolicy({ cooperationEfficiency: 1.1 }), /between 0 and 1/);
});

test('repair orders normalize repairer IDs and reject invalid source contracts', () => {
  const order = fieldOrder();
  assert.deepEqual(order.repairerIds, ['eng-1', 'eng-2']);
  assert.equal(order.state, REPAIR_ORDER_STATES.ACTIVE);
  assert.equal(Object.isFrozen(order), true);
  assert.throws(() => fieldOrder({ repairerIds: [] }), /at least one repairer/);
  assert.throws(() => fieldOrder({ repairerIds: ['eng-1', 'eng-1'] }), /duplicate id/);
  assert.throws(() => createRepairOrder({ id: 'facility-order', team: 0, targetId: 'tank-1', context: REPAIR_CONTEXTS.FACILITY }), /facilityId/);
});

test('field repair combines multiple repairers with deterministic diminishing returns', () => {
  const result = resolveRepairTick({
    order: fieldOrder(),
    target: target(),
    repairers: [
      { id: 'eng-2', team: 0, rateMultiplier: 1 },
      { id: 'eng-1', team: 0, rateMultiplier: 1 },
    ],
    resources: { metal: 100 },
    dt: 1,
  });
  assert.equal(result.rate, 19.2);
  assert.equal(result.repairedHp, 19.2);
  assert.deepEqual(result.contributors, [
    { id: 'eng-1', efficiency: 1, effectiveRate: 12 },
    { id: 'eng-2', efficiency: 0.6, effectiveRate: 7.2 },
  ]);
  assert.equal(result.target.hp, 59.2);
  assert.deepEqual(result.cost, { metal: 9.6 });
  assert.equal(result.resources.metal, 90.4);
  assert.equal(result.event.targetId, 'tank-1');
  assert.equal(Object.hasOwn(result.event, 'target'), false);
});

test('field repair stops exactly at the configured field limit', () => {
  const result = resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target({ hp: 70 }),
    repairers: [{ id: 'eng-1', team: 0 }],
    resources: { metal: 100 },
    dt: 10,
  });
  assert.equal(result.repairedHp, 5);
  assert.equal(result.target.hp, 75);
  assert.equal(result.order.state, REPAIR_ORDER_STATES.COMPLETE);
  assert.equal(result.order.completionReason, 'field-limit');
  assert.equal(evaluateRepairTarget({ target: result.target, team: 0 }).reason, 'repair-cap-reached');
});

test('resource shortages produce deterministic partial repairs without overspending', () => {
  const policy = createRepairPolicy({ baseHpPerSecond: 100, resourcePerHp: { fuel: 0.25, metal: 0.5 } });
  const result = resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target(),
    repairers: [{ id: 'eng-1', team: 0 }],
    resources: { fuel: 2, metal: 100 },
    dt: 1,
    policy,
  });
  assert.equal(result.repairedHp, 8);
  assert.deepEqual(result.cost, { fuel: 2, metal: 4 });
  assert.deepEqual(result.resources, { fuel: 0, metal: 96 });
  const blocked = resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target(),
    repairers: [{ id: 'eng-1', team: 0 }],
    resources: { fuel: 0, metal: 100 },
    dt: 1,
    policy,
  });
  assert.equal(blocked.blockedReason, 'insufficient-resources');
  assert.equal(blocked.target.hp, 40);
});

test('repair facilities restore full health with facility rate and cost modifiers', () => {
  const order = createRepairOrder({
    id: 'facility-repair',
    team: 0,
    targetId: 'tank-1',
    context: REPAIR_CONTEXTS.FACILITY,
    facilityId: 'workshop-1',
  });
  const result = resolveRepairTick({
    order,
    target: target({ hp: 90 }),
    facility: { id: 'workshop-1', team: 0, online: true, rateMultiplier: 2 },
    resources: { metal: 100 },
    dt: 1,
  });
  assert.equal(result.rate, 36);
  assert.equal(result.repairedHp, 10);
  assert.deepEqual(result.cost, { metal: 4 });
  assert.equal(result.target.hp, 100);
  assert.equal(result.order.completionReason, 'fully-repaired');
  const offline = resolveRepairTick({
    order,
    target: target(),
    facility: { id: 'workshop-1', team: 0, online: false },
    resources: { metal: 100 },
    dt: 1,
  });
  assert.equal(offline.blockedReason, 'facility-offline');
});

test('target and repairer eligibility fail closed with reason-specific feedback', () => {
  assert.equal(evaluateRepairTarget({ target: target({ team: 1 }), team: 0 }).reason, 'enemy-target');
  assert.equal(evaluateRepairTarget({ target: target({ destroyed: true }), team: 0 }).reason, 'target-destroyed');
  assert.equal(evaluateRepairTarget({ target: target({ repairable: false }), team: 0 }).reason, 'target-not-repairable');
  const policy = createRepairPolicy({ repairableDomains: [TARGET_DOMAINS.STRUCTURE] });
  assert.equal(evaluateRepairTarget({ target: target(), team: 0, policy }).reason, 'unsupported-domain');
  const result = resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target(),
    repairers: [{ id: 'eng-1', team: 0, inRange: false }],
    resources: { metal: 100 },
    dt: 1,
  });
  assert.equal(result.blockedReason, 'no-eligible-repairers');
});

test('repair resolution is independent of repairer input order and caps contributors', () => {
  const policy = createRepairPolicy({ maxRepairers: 2 });
  const inputs = [
    { id: 'eng-3', team: 0 },
    { id: 'eng-1', team: 0 },
    { id: 'eng-2', team: 0 },
  ];
  const order = fieldOrder({ repairerIds: ['eng-3', 'eng-2', 'eng-1'] });
  const first = resolveRepairTick({ order, target: target(), repairers: inputs, resources: { metal: 100 }, dt: 1, policy });
  const second = resolveRepairTick({ order, target: target(), repairers: [...inputs].reverse(), resources: { metal: 100 }, dt: 1, policy });
  assert.deepEqual(first, second);
  assert.deepEqual(first.contributors.map((entry) => entry.id), ['eng-1', 'eng-2']);
  assert.throws(() => resolveRepairTick({ order, target: target(), repairers: [inputs[0], inputs[0]], resources: { metal: 100 }, dt: 1, policy }), /duplicate id/);
});

test('cancelled and completed orders are immutable no-ops', () => {
  const cancelled = cancelRepairOrder(fieldOrder(), 'player-stop');
  assert.equal(cancelled.state, REPAIR_ORDER_STATES.CANCELLED);
  assert.equal(cancelled.cancellationReason, 'player-stop');
  const result = resolveRepairTick({
    order: cancelled,
    target: target(),
    repairers: [{ id: 'eng-1', team: 0 }, { id: 'eng-2', team: 0 }],
    resources: { metal: 100 },
    dt: 1,
  });
  assert.equal(result.blockedReason, 'order-cancelled');
  assert.equal(result.target.hp, 40);
  assert.strictEqual(cancelRepairOrder(cancelled), cancelled);
});

test('AI target ranking is deterministic, eligibility-aware, and stable on ties', () => {
  const candidates = [
    target({ id: 'bravo', hp: 20, disabled: false, strategicValue: 1, distance: 10 }),
    target({ id: 'alpha', hp: 20, disabled: false, strategicValue: 1, distance: 10 }),
    target({ id: 'disabled', hp: 70, disabled: true, distance: 100 }),
    target({ id: 'enemy', team: 1, hp: 1 }),
    target({ id: 'cap', hp: 75 }),
  ];
  const ranked = rankRepairTargets({ team: 0, candidates });
  assert.deepEqual(ranked.map((entry) => entry.targetId), ['disabled', 'alpha', 'bravo']);
  assert.equal(chooseRepairTarget({ team: 0, candidates }).targetId, 'disabled');
  assert.equal(Object.isFrozen(ranked), true);
  assert.throws(() => rankRepairTargets({ team: 0, candidates: [target(), target()] }), /duplicate id/);
});

test('zero duration is a no-op and negative duration is rejected', () => {
  const zero = resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target(),
    repairers: [{ id: 'eng-1', team: 0 }],
    resources: { metal: 100 },
    dt: 0,
  });
  assert.equal(zero.blockedReason, 'zero-dt');
  assert.throws(() => resolveRepairTick({
    order: fieldOrder({ repairerIds: ['eng-1'] }),
    target: target(),
    repairers: [{ id: 'eng-1', team: 0 }],
    resources: { metal: 100 },
    dt: -1,
  }), /non-negative/);
});
