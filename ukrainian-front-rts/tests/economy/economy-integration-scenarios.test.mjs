import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_TYPES, TEAM, UNIT_TYPES, UPGRADES } from '../../src/config.js';
import { createEconomyIntegrationScenario } from '../fixtures/economy-integration-runtime.js';

const EPSILON = 1e-6;

function byType(collection, type, team = TEAM.UA) {
  const entity = collection.find((candidate) => candidate.type === type && candidate.team === team);
  assert.ok(entity, `Expected ${team === TEAM.UA ? 'Ukrainian' : 'Russian'} ${type}.`);
  return entity;
}

function select(game, ...entities) {
  game.select(null);
  entities.forEach((entity, index) => game.select(entity, index > 0));
}

function approximately(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, `${message}: expected ${expected}, received ${actual}`);
}

function advanceUntil(harness, predicate, maxTicks, message) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (predicate()) return tick;
    harness.advanceTicks(1);
  }
  assert.ok(predicate(), message);
  return maxTicks;
}

function validPlacement(game, type, candidates = []) {
  for (const point of candidates) {
    const preview = game.previewBuildingPlacement(point.x, point.y);
    if (preview?.valid) return preview;
  }
  for (let y = 1056; y <= 1536; y += 32) {
    for (let x = 544; x <= 1056; x += 32) {
      const preview = game.previewBuildingPlacement(x, y);
      if (preview?.valid) return preview;
    }
  }
  assert.fail(`No valid deterministic placement found for ${type}.`);
}

function construct(game, harness, worker, type, candidates = []) {
  select(game, worker);
  assert.equal(game.beginBuild(type), true, game.lastError);
  const placement = validPlacement(game, type, candidates);
  assert.equal(game.placeBuilding(placement.x, placement.y), true, game.lastError);
  const building = game.buildings.find(
    (candidate) => candidate.type === type && candidate.team === TEAM.UA && candidate.underConstruction,
  );
  assert.ok(building, `Expected an unfinished ${type}.`);
  advanceUntil(
    harness,
    () => !building.underConstruction,
    600,
    `${type} construction did not complete within 60 simulated seconds.`,
  );
  return building;
}

function totalNodeAmount(game, kind) {
  return game.nodes
    .filter((node) => node.kind === kind)
    .reduce((sum, node) => sum + node.amount, 0);
}

function carriedAmount(game, kind) {
  return game.units
    .filter((unit) => unit.carryKind === kind)
    .reduce((sum, unit) => sum + unit.carry, 0);
}

test('first worker order funds expansion and deterministic army production without resource loss', () => {
  const scenario = createEconomyIntegrationScenario({
    missionIndex: 0,
    seed: 'ufr-068-worker-expansion',
  });
  const { game, harness } = scenario;
  try {
    const engineers = game.units
      .filter((unit) => unit.team === TEAM.UA && UNIT_TYPES[unit.type]?.worker)
      .sort((left, right) => left.id - right.id);
    assert.equal(engineers.length, 2);
    const metalNode = game.nodes.find((node) => node.kind === 'metal');
    const initialMetalNodes = totalNodeAmount(game, 'metal');
    const initialMetal = game.player.metal;

    select(game, engineers[0]);
    assert.equal(game.assignGather('metal', metalNode), true, game.lastError);
    const workshop = construct(game, harness, engineers[1], 'workshop', [
      { x: 672, y: 1456 },
      { x: 736, y: 1376 },
      { x: 640, y: 1184 },
    ]);

    assert.equal(workshop.underConstruction, false);
    assert.equal(workshop.hp, workshop.maxHp);
    assert.ok(workshop.placement?.footprint);
    assert.deepEqual(workshop.dropOffKinds, []);
    assert.ok(game.player.mined > 0);
    assert.ok(game.resourceIncomeRates().metal > 0);

    advanceUntil(
      harness,
      () => game.player.metal >= UNIT_TYPES.uaInfantry.cost.metal,
      400,
      'Gathering did not make a line squad affordable.',
    );

    const barracks = byType(game.buildings, 'barracks');
    select(game, barracks);
    assert.equal(game.setProductionRally(900, 1250), true, game.lastError);
    const unitsBefore = game.units.length;
    assert.equal(game.queue('uaInfantry'), true, game.lastError);
    assert.equal(game.commandCapacitySnapshot().reserved, UNIT_TYPES.uaInfantry.pop);
    advanceUntil(
      harness,
      () => game.productionAcknowledgements.length > 0,
      80,
      'Queued infantry did not leave production within eight simulated seconds.',
    );

    assert.equal(game.units.length, unitsBefore + 1);
    const acknowledgement = game.productionAcknowledgements.at(-1);
    const produced = game.units.find((unit) => unit.id === acknowledgement.unitId);
    assert.equal(produced.type, 'uaInfantry');
    assert.equal(produced.order?.rally, true);
    assert.equal(barracks.queue.length, 0);
    const capacity = game.commandCapacitySnapshot();
    assert.equal(capacity.reserved, 0);
    assert.equal(capacity.used, capacity.fielded);

    const depletedMetal = initialMetalNodes - totalNodeAmount(game, 'metal');
    approximately(
      depletedMetal,
      game.player.mined + carriedAmount(game, 'metal'),
      'Extracted metal must remain delivered or carried',
    );
    const deliveredMetal = depletedMetal - carriedAmount(game, 'metal');
    approximately(
      game.player.metal,
      initialMetal
        - BUILDING_TYPES.workshop.cost.metal
        - UNIT_TYPES.uaInfantry.cost.metal
        + deliveredMetal,
      'Metal balance must conserve construction, production, delivery, and carry state',
    );
    approximately(
      game.player.fuel,
      110 - BUILDING_TYPES.workshop.cost.fuel,
      'Workshop fuel cost must be charged exactly once',
    );
    assert.equal(game.player.intel, 25);
  } finally {
    scenario.dispose();
  }
});

function runProductionResearchScenario() {
  const scenario = createEconomyIntegrationScenario({
    missionIndex: 1,
    seed: 'ufr-068-production-research',
    tickSeconds: 1,
  });
  const { game, harness } = scenario;
  try {
    const workshop = game.addBuilding('workshop', TEAM.UA, 700, 1320);
    const tank = game.addUnit('uaTank', TEAM.UA, 650, 1320);
    const tankMaxBefore = tank.maxHp;
    select(game, workshop);
    assert.equal(game.setProductionRally(980, 1180), true, game.lastError);
    assert.equal(game.queue('uaDrone'), true, game.lastError);
    assert.equal(game.research('cageArmor'), true, game.lastError);
    assert.equal(workshop.researchQueueState.queue[0].remaining, 20);

    harness.advanceTicks(7);
    assert.equal(workshop.queue.length, 0);
    assert.equal(workshop.researchQueueState.queue[0].remaining, 20);
    assert.equal(game.productionAcknowledgements.length, 1);
    assert.equal(game.commandCapacitySnapshot().reserved, 0);

    harness.advanceTicks(1);
    assert.equal(workshop.researchQueueState.queue[0].remaining, 19);
    harness.advanceTicks(19);
    assert.equal(workshop.researchQueueState.queue.length, 0);
    assert.equal(game.player.upgrades.has('cageArmor'), true);
    assert.ok(tank.maxHp > tankMaxBefore);
    assert.equal(tank.hp, tank.maxHp);
    assert.deepEqual(
      {
        metal: game.player.metal,
        fuel: game.player.fuel,
        intel: game.player.intel,
      },
      {
        metal: 320 - UNIT_TYPES.uaDrone.cost.metal - UPGRADES.cageArmor.cost.metal,
        fuel: 190 - UNIT_TYPES.uaDrone.cost.fuel,
        intel: 70 - UPGRADES.cageArmor.cost.intel,
      },
    );

    const produced = game.units.find((unit) => unit.id === game.productionAcknowledgements[0].unitId);
    return Object.freeze({
      resources: Object.freeze({
        metal: game.player.metal,
        fuel: game.player.fuel,
        intel: game.player.intel,
      }),
      capacity: game.commandCapacitySnapshot(),
      produced: Object.freeze({
        type: produced.type,
        x: produced.x,
        y: produced.y,
        order: produced.order ? { ...produced.order } : null,
      }),
      tank: Object.freeze({ hp: tank.hp, maxHp: tank.maxHp }),
      acknowledgements: Object.freeze(game.productionAcknowledgements.map((entry) => ({ ...entry }))),
      researchEvents: Object.freeze(game.researchQueueEvents.map((entry) => ({ ...entry }))),
    });
  } finally {
    scenario.dispose();
  }
}

test('production contention pauses research and same-seed assembled outcomes are deterministic', () => {
  assert.deepEqual(runProductionResearchScenario(), runProductionResearchScenario());
});

test('depot loss preserves forces, blocks new reservations, repairs armor, and recovery restores capacity', () => {
  const scenario = createEconomyIntegrationScenario({
    missionIndex: 0,
    seed: 'ufr-068-loss-recovery',
    tickSeconds: 1,
  });
  const { game, harness } = scenario;
  try {
    const workshop = game.addBuilding('workshop', TEAM.UA, 650, 1320);
    const tank = game.addUnit('uaTank', TEAM.UA, 710, 1320);
    tank.hp = tank.maxHp - 36;
    game.reconcileCommandCapacity('scenario-force-added');
    const startingMetal = game.player.metal;
    const depot = byType(game.buildings, 'depot');
    depot.hp = 0;
    harness.advanceTicks(1);

    assert.equal(game.buildings.includes(depot), false);
    assert.ok(game.buildingWrecks.some((wreck) => String(wreck.sourceEntityId) === String(depot.id)));
    let capacity = game.commandCapacitySnapshot();
    assert.equal(capacity.capacity, 14);
    assert.equal(capacity.state, 'over');
    assert.equal(capacity.preservesExistingForces, true);
    assert.equal(game.units.includes(tank), true);

    const barracks = byType(game.buildings, 'barracks');
    select(game, barracks);
    assert.equal(game.queue('uaInfantry'), false);
    assert.match(game.lastError, /capacity/i);

    select(game, tank);
    assert.equal(game.returnSelectedForRepair(), true, game.lastError);
    advanceUntil(
      harness,
      () => tank.hp === tank.maxHp,
      5,
      'Workshop repair did not restore the damaged tank.',
    );
    assert.equal(tank.tacticalCommand, undefined);
    assert.deepEqual(
      game.repairRuntimeEvents.map((event) => event.repairedHp),
      [18, 18],
    );

    const engineer = game.units.find(
      (unit) => unit.team === TEAM.UA && UNIT_TYPES[unit.type]?.worker,
    );
    const replacement = construct(game, harness, engineer, 'depot', [
      { x: 608, y: 1120 },
      { x: 736, y: 1088 },
      { x: 864, y: 1216 },
    ]);
    assert.equal(replacement.capacityGranted, true);
    capacity = game.commandCapacitySnapshot();
    assert.equal(capacity.capacity, 22);
    assert.notEqual(capacity.state, 'over');

    select(game, barracks);
    assert.equal(game.queue('uaInfantry'), true, game.lastError);
    assert.equal(game.commandCapacitySnapshot().reserved, UNIT_TYPES.uaInfantry.pop);
    approximately(
      game.player.metal,
      startingMetal
        - 36 * 0.5 * 0.8
        - BUILDING_TYPES.depot.cost.metal
        - UNIT_TYPES.uaInfantry.cost.metal,
      'Loss recovery must charge repair, rebuilding, and the resumed reservation exactly once',
    );
  } finally {
    scenario.dispose();
  }
});
