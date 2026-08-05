import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import { TEAM } from '../../src/config.js';
import { TACTICAL_COMMAND_KINDS } from '../../src/core/tactical-command-contract.js';
import { repairRuntimeSnapshot } from '../../src/systems/repair-runtime.js';

function scenario({ metal = 100, tickSeconds = 1 } = {}) {
  const harness = createSimulationHarness({ tickSeconds });
  harness.startScenario({ missionIndex: 0, seed: 'repair-runtime' });
  harness.game.enemy.clock = Number.POSITIVE_INFINITY;
  harness.game.player.metal = metal;
  const workshop = harness.game.addBuilding('workshop', TEAM.UA, 700, 1300);
  return { harness, workshop };
}

function damagedTank(harness, workshop, { missingHp = 90 } = {}) {
  const tank = harness.game.addUnit('uaTank', TEAM.UA, workshop.x + 70, workshop.y);
  tank.hp = tank.maxHp - missingHp;
  tank.tacticalCommand = {
    id: harness.game.tacticalCommandSequence ?? tank.id,
    kind: TACTICAL_COMMAND_KINDS.RETURN_FOR_REPAIR,
    facilityId: workshop.id,
    status: 'waiting',
  };
  tank.awaitingRepairAt = workshop.id;
  return tank;
}

test('facility repair consumes live resources and completes the tactical command', () => {
  const { harness, workshop } = scenario();
  const tank = damagedTank(harness, workshop, { missingHp: 30 });
  const startHp = tank.hp;

  harness.advanceTicks(1);
  assert.equal(tank.hp, startHp + 18);
  assert.equal(harness.game.player.metal, 92.8);
  assert.equal(tank.tacticalCommand.kind, TACTICAL_COMMAND_KINDS.RETURN_FOR_REPAIR);

  harness.advanceTicks(1);
  assert.equal(tank.hp, tank.maxHp);
  assert.equal(harness.game.player.metal, 88);
  assert.equal(tank.tacticalCommand, undefined);
  assert.equal(tank.awaitingRepairAt, undefined);
  assert.equal(harness.game.lastCommandMessage, 'Vehicle repair complete.');

  const snapshot = repairRuntimeSnapshot(harness.game);
  assert.equal(snapshot.active.length, 0);
  assert.deepEqual(snapshot.events.map((event) => event.repairedHp), [18, 12]);
  assert.deepEqual(snapshot.events.map((event) => event.cost.metal), [7.2, 4.8]);
});

test('a fully restored vehicle cannot retain a stale workshop wait command', () => {
  const { harness, workshop } = scenario();
  const tank = damagedTank(harness, workshop, { missingHp: 30 });
  tank.hp = tank.maxHp;
  const metalBefore = harness.game.player.metal;

  harness.advanceTicks(1);

  assert.equal(tank.tacticalCommand, undefined);
  assert.equal(tank.awaitingRepairAt, undefined);
  assert.equal(harness.game.player.metal, metalBefore);
  assert.equal(repairRuntimeSnapshot(harness.game).events.length, 0);
});

test('facility repair remains waiting with an actionable blocked reason when metal is exhausted', () => {
  const { harness, workshop } = scenario({ metal: 0 });
  const tank = damagedTank(harness, workshop, { missingHp: 140 });
  const startHp = tank.hp;

  harness.advanceTicks(1);
  assert.equal(tank.hp, startHp);
  assert.equal(tank.repairBlockedReason, 'insufficient-resources');
  assert.equal(tank.tacticalCommand.status, 'waiting');
  assert.equal(repairRuntimeSnapshot(harness.game).events.length, 0);
});

test('limited repair resources are committed in stable unit-id order', () => {
  const { harness, workshop } = scenario({ metal: 10 });
  const first = damagedTank(harness, workshop);
  const second = damagedTank(harness, workshop);
  const firstHp = first.hp;
  const secondHp = second.hp;

  harness.advanceTicks(1);
  assert.equal(first.hp, firstHp + 18);
  assert.equal(second.hp, secondHp + 7);
  assert.equal(harness.game.player.metal, 0);
  assert.deepEqual(
    repairRuntimeSnapshot(harness.game).events.map((event) => event.unitId),
    [first.id, second.id],
  );
});

test('a mission restart clears prior repair events and transient order state', () => {
  const { harness, workshop } = scenario();
  damagedTank(harness, workshop, { missingHp: 30 });
  harness.advanceTicks(1);
  assert.equal(repairRuntimeSnapshot(harness.game).events.length, 1);

  harness.startScenario({ missionIndex: 0, seed: 'repair-runtime-restart' });
  harness.game.enemy.clock = Number.POSITIVE_INFINITY;
  harness.advanceTicks(1);
  assert.deepEqual(repairRuntimeSnapshot(harness.game), { events: [], active: [] });
  assert.equal(harness.game.units.some((unit) => unit.facilityRepairOrder), false);
});
