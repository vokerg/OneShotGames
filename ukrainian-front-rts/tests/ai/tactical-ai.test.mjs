import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TACTICAL_AI_POSTURES,
  createTacticalAiPolicy,
  planTacticalAi,
} from '../../src/ai/tactical-ai.js';

function doctrine(overrides = {}) {
  return {
    riskTolerance: 0.55,
    retreatThreshold: 0.3,
    ...overrides,
  };
}

function unit(id, x, y, overrides = {}) {
  return {
    id: `unit:${id}`,
    kind: 'ruInfantry',
    x,
    y,
    hp: 100,
    maxHp: 100,
    strength: 10,
    speed: 60,
    sight: 220,
    combat: true,
    scout: false,
    support: false,
    ...overrides,
  };
}

function contact(id, x, y, overrides = {}) {
  return {
    id: `unit:${id}`,
    kind: 'uaInfantry',
    state: 'confirmed',
    lastSeenTick: 30,
    position: { x, y },
    strength: 10,
    details: { entityKind: 'unit', entityId: id, type: 'uaInfantry' },
    ...overrides,
  };
}

function plan(overrides = {}) {
  return planTacticalAi({
    tick: 30,
    decisionIndex: 2,
    doctrine: doctrine(),
    goals: [{ id: 'attack', kind: 'attack', priority: 60, createdTick: 0 }],
    knowledge: [],
    ownUnits: [
      unit(1, 200, 200, { scout: true, speed: 110 }),
      unit(2, 220, 200),
      unit(3, 200, 220),
      unit(4, 220, 220),
    ],
    ownStructures: [{ id: 'building:10', kind: 'hq', x: 160, y: 160, strength: 30 }],
    ...overrides,
  });
}

test('scouts with observed-only knowledge while retaining a reserve', () => {
  const result = plan();
  assert.equal(result.posture, TACTICAL_AI_POSTURES.SCOUTING);
  assert.equal(result.target, null);
  assert.equal(result.commands.some((command) => command.role === 'scout'), true);
  assert.equal(result.commands.some((command) => command.role === 'reserve'), true);
  assert.equal(result.metrics.bounded, true);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.commands));
});

test('responds defensively to the highest-priority observed threat near a structure', () => {
  const result = plan({
    knowledge: [
      contact(90, 225, 190, { strength: 4 }),
      contact(91, 1400, 900, { strength: 30 }),
    ],
  });
  assert.equal(result.posture, TACTICAL_AI_POSTURES.DEFENDING);
  assert.equal(result.target.id, 'unit:90');
  assert.equal(
    result.commands.every((command) => ['defense-engage', 'defense-response', 'defense-support'].includes(command.role)),
    true,
  );
});

test('retreats deterministically when force readiness falls below doctrine threshold', () => {
  const result = plan({
    knowledge: [contact(90, 900, 700)],
    ownUnits: [
      unit(1, 200, 200, { hp: 20 }),
      unit(2, 220, 200, { hp: 25 }),
      unit(3, 200, 220, { hp: 20 }),
    ],
  });
  assert.equal(result.posture, TACTICAL_AI_POSTURES.RETREATING);
  assert.deepEqual(result.commands.map((command) => command.role), ['retreat']);
  assert.deepEqual(result.commands[0].target, { x: 160, y: 160 });
});

test('assembles when observed strength is too high for the current force', () => {
  const result = plan({
    knowledge: [contact(90, 1200, 800, { strength: 200 })],
  });
  assert.equal(result.posture, TACTICAL_AI_POSTURES.RETREATING);
  assert.match(result.reason, /force ratio/i);
});

test('reinforces separated units while the main force screens the target', () => {
  const result = plan({
    knowledge: [contact(90, 900, 500)],
    ownStructures: [],
    ownUnits: [
      unit(1, 180, 180),
      unit(2, 205, 180),
      unit(3, 190, 205),
      unit(4, 1250, 1100),
    ],
  });
  assert.equal(result.posture, TACTICAL_AI_POSTURES.REINFORCING);
  assert.equal(result.commands.some((command) => command.role === 'reinforcement'), true);
  assert.equal(result.commands.some((command) => command.role === 'screen'), true);
});

test('splits a concentrated superior force into stable main and flank groups', () => {
  const ownUnits = Array.from({ length: 9 }, (_, index) =>
    unit(index + 1, 300 + (index % 3) * 12, 300 + Math.floor(index / 3) * 12));
  const input = {
    tick: 45,
    decisionIndex: 3,
    doctrine: doctrine({ riskTolerance: 0.8 }),
    goals: [{ id: 'attack', kind: 'attack', priority: 60, createdTick: 0 }],
    knowledge: [contact(90, 1000, 700, { strength: 20, lastSeenTick: 45 })],
    ownUnits,
    ownStructures: [],
  };
  const first = planTacticalAi(input);
  const second = planTacticalAi(input);
  assert.equal(first.posture, TACTICAL_AI_POSTURES.FLANKING);
  assert.deepEqual(second, first);
  assert.equal(first.commands.some((command) => command.role === 'main-attack'), true);
  assert.equal(first.commands.some((command) => command.role === 'flank'), true);
  const assigned = first.commands.flatMap((command) => command.unitIds);
  assert.equal(new Set(assigned).size, assigned.length);
});

test('bounds unit, contact, and command work deterministically', () => {
  const policy = createTacticalAiPolicy({ maxUnits: 10, maxContacts: 5, maxCommands: 3 });
  const result = planTacticalAi({
    tick: 60,
    decisionIndex: 4,
    doctrine: doctrine(),
    goals: [],
    knowledge: Array.from({ length: 40 }, (_, index) =>
      contact(100 + index, 1500 + index, 800, { lastSeenTick: 60 })),
    ownUnits: Array.from({ length: 80 }, (_, index) => unit(index + 1, 200 + index, 200)),
    ownStructures: [],
    policy,
  });
  assert.equal(result.metrics.unitsConsidered, 10);
  assert.equal(result.metrics.contactsConsidered, 5);
  assert.ok(result.metrics.commandGroups <= 3);
  assert.equal(result.metrics.bounded, true);
});
