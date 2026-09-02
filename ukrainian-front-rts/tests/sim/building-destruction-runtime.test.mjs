import assert from 'node:assert/strict';
import test from 'node:test';

import { createDestructionState, materializeWreck } from '../../src/combat/destruction-system.js';
import { TEAM } from '../../src/config.js';
import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import { createBuildingLifecycleController } from '../../src/systems/building-lifecycle-system.js';
import { createCommandCapacityController } from '../../src/systems/command-capacity-system.js';

function firstEntity(game, predicate, label) {
  const entity = [...game.units, ...game.buildings].find(predicate);
  assert.ok(entity, `Expected scenario to contain ${label}.`);
  return entity;
}

function queueOverkillProjectile(game, source, target) {
  game.projectiles.push({
    source,
    target,
    team: source.team,
    x: target.x,
    y: target.y,
    aimX: target.x,
    aimY: target.y,
    speed: 1,
    damage: target.maxHp * 3,
    life: 1,
    hit: true,
    kind: 'runtime-overkill-regression',
    impact: 'kinetic',
  });
}

test('assembled simulation cleans up overkilled buildings without entering an invalid negative-HP lifecycle state', () => {
  const harness = createSimulationHarness();
  const disposeLifecycle = createBuildingLifecycleController(harness.game, {
    destructionApi: { createDestructionState, materializeWreck },
  });
  const disposeCapacity = createCommandCapacityController(harness.game);

  try {
    harness.startScenario({ missionIndex: 0, seed: 'building-overkill-cleanup' });
    const depot = firstEntity(
      harness.game,
      (entity) => entity.team === TEAM.UA && entity.type === 'depot',
      'a Ukrainian logistics depot',
    );
    const barracks = firstEntity(
      harness.game,
      (entity) => entity.team === TEAM.UA && entity.type === 'barracks',
      'a Ukrainian barracks',
    );
    const attacker = firstEntity(
      harness.game,
      (entity) => entity.team === TEAM.RU && entity.maxHp < 500,
      'a Russian combat unit',
    );

    const capBeforeDestruction = harness.game.player.cap;
    const popBeforeQueue = harness.game.player.pop;
    assert.equal(harness.issueCommand({
      type: 'queue',
      buildingId: barracks.id,
      unitType: 'uaInfantry',
    }).ok, true);
    assert.equal(harness.game.player.pop, popBeforeQueue + 2);
    assert.equal(
      harness.issueCommand({ type: 'select', entityIds: [depot.id, barracks.id] }).ok,
      true,
    );

    queueOverkillProjectile(harness.game, attacker, depot);
    queueOverkillProjectile(harness.game, attacker, barracks);

    let state;
    assert.doesNotThrow(() => {
      state = harness.advanceTicks(1);
    });

    assert.equal(state.buildings.some((building) => building.id === depot.id), false);
    assert.equal(state.buildings.some((building) => building.id === barracks.id), false);
    assert.equal(state.selectedIds.includes(depot.id), false);
    assert.equal(state.selectedIds.includes(barracks.id), false);
    assert.equal(harness.game.player.cap, capBeforeDestruction - 8);
    assert.equal(harness.game.player.pop, popBeforeQueue);

    const rubbleSources = new Set(
      harness.game.buildingWrecks.map((wreck) => String(wreck.sourceEntityId)),
    );
    assert.equal(rubbleSources.has(String(depot.id)), true);
    assert.equal(rubbleSources.has(String(barracks.id)), true);
  } finally {
    disposeCapacity();
    disposeLifecycle();
  }
});
