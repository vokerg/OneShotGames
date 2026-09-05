import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD } from '../../src/config.js';
import { CAMPAIGN_OPERATION_SEQUENCE } from '../../src/content/campaign/campaign-operation-registry.js';
import { createCampaignProfile } from '../../src/core/campaign-profile.js';
import { Game } from '../../src/game.js';
import { initializeAuthoredOperation } from '../../src/systems/authored-operation-runtime.js';
import { RUNTIME_TERRAIN_BY_VALUE } from '../../src/systems/terrain-movement-system.js';

const expectedTerrainCells = (WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile);

function compositionEntityCount(operation) {
  const composition = operation.mission?.composition ?? {};
  return ['startingForces', 'enemyForces', 'player', 'enemy', 'enemyTargets', 'engineerObjects']
    .reduce((total, key) => total + (Array.isArray(composition[key]) ? composition[key].length : 0), 0);
}

function metadataStartCount(map) {
  return Object.values(map.starts ?? {}).flat()
    .filter((start) => start.metadata?.type && [0, 1].includes(start.metadata?.team)).length;
}

test('every authored campaign operation mounts its own battlefield, forces, objectives, and script contract', () => {
  assert.equal(CAMPAIGN_OPERATION_SEQUENCE.length, 9);
  const mountedMapIds = new Set();
  const finaleProfile = createCampaignProfile({
    profileId: 'runtime-test',
    initialOperationIds: CAMPAIGN_OPERATION_SEQUENCE.map((entry) => entry.id),
  });

  CAMPAIGN_OPERATION_SEQUENCE.forEach((operation, operationIndex) => {
    const game = new Game();
    const runtimeOperation = operation.missionFactory
      ? { ...operation, mission: operation.missionFactory(finaleProfile) }
      : operation;
    const mounted = initializeAuthoredOperation(game, runtimeOperation, { operationIndex });

    assert.equal(mounted.operationId, operation.id);
    assert.equal(game.mission.id, operation.id);
    assert.equal(game.mission.mapId, mounted.mapId);
    assert.equal(game.mission.authored, true);
    assert.equal(game.authoredMap.id, mounted.mapId);
    assert.equal(game.missionIndex, operationIndex);
    assert.equal(game.mission.waves.maxWaves, 0, `${operation.id} must not retain legacy wave spawning`);
    assert.equal(game.terrain.length, expectedTerrainCells);
    assert.equal(mounted.startCount, game.units.length + game.buildings.length);
    assert.ok(mounted.startCount >= metadataStartCount(game.authoredMap) + compositionEntityCount(runtimeOperation));
    assert.equal(game.nodes.length, game.authoredMap.resources.length);
    assert.deepEqual(
      game.mission.objectiveDefinitions.map((objective) => objective.id),
      runtimeOperation.mission.objectiveDefinitions.map((objective) => objective.id),
    );
    assert.equal(game.player.objectives.length, runtimeOperation.mission.objectiveDefinitions.length);
    assert.ok([...game.units, ...game.buildings].every((entity) => entity.scriptId), `${operation.id} runtime entities need script IDs`);

    if (runtimeOperation.mission.script) {
      assert.equal(game.mission.script.id, runtimeOperation.mission.script.id);
      assert.equal(game.mission.script, runtimeOperation.mission.script);
    }

    if (operation.map) assert.equal(mounted.mapId, operation.map.id);
    else assert.equal(game.authoredMap.metadata.generatedFromMissionComposition, true);
    mountedMapIds.add(mounted.mapId);
  });

  assert.equal(mountedMapIds.size, CAMPAIGN_OPERATION_SEQUENCE.length, 'campaign operations must mount distinct battlefields');
});

test('authored road and blocked terrain retain explicit runtime navigation values', () => {
  assert.equal(RUNTIME_TERRAIN_BY_VALUE[5], 'road');
  assert.equal(RUNTIME_TERRAIN_BY_VALUE[6], 'blocked');
});
