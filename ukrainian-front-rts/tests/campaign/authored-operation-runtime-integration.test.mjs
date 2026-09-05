import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD } from '../../src/config.js';
import { CAMPAIGN_OPERATION_SEQUENCE } from '../../src/content/campaign/campaign-operation-registry.js';
import { Game } from '../../src/game.js';
import { initializeAuthoredOperation } from '../../src/systems/authored-operation-runtime.js';

const expectedTerrainCells = (WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile);

function authoredStartCount(map) {
  return Object.values(map.starts ?? {}).reduce((total, entries) => total + entries.length, 0);
}

test('every authored campaign operation mounts its own map, starts, objectives, and script contract', () => {
  assert.equal(CAMPAIGN_OPERATION_SEQUENCE.length, 9);
  const mountedMapIds = new Set();

  CAMPAIGN_OPERATION_SEQUENCE.forEach((operation, operationIndex) => {
    const game = new Game();
    const mounted = initializeAuthoredOperation(game, operation, { operationIndex });

    assert.equal(mounted.operationId, operation.id);
    assert.equal(mounted.mapId, operation.map.id);
    assert.equal(game.mission.id, operation.id);
    assert.equal(game.mission.mapId, operation.map.id);
    assert.equal(game.mission.authored, true);
    assert.equal(game.authoredMap.id, operation.map.id);
    assert.equal(game.missionIndex, operationIndex);
    assert.equal(game.mission.waves.maxWaves, 0, `${operation.id} must not retain legacy wave spawning`);
    assert.equal(game.terrain.length, expectedTerrainCells);
    assert.equal(mounted.startCount, authoredStartCount(game.authoredMap));
    assert.equal(game.units.length + game.buildings.length, mounted.startCount);
    assert.equal(game.nodes.length, game.authoredMap.resources.length);
    assert.deepEqual(game.mission.objectiveDefinitions, operation.mission.objectiveDefinitions);
    assert.equal(game.player.objectives.length, operation.mission.objectiveDefinitions.length);

    if (operation.mission.script) {
      assert.equal(game.mission.script.id, operation.mission.script.id);
      assert.equal(game.mission.script, operation.mission.script);
    }

    const authoredScriptIds = new Set(
      Object.values(game.authoredMap.starts)
        .flat()
        .map((start) => start.metadata?.scriptId ?? start.id),
    );
    const runtimeScriptIds = new Set(
      [...game.units, ...game.buildings].map((entity) => entity.scriptId),
    );
    assert.deepEqual(runtimeScriptIds, authoredScriptIds);
    mountedMapIds.add(mounted.mapId);
  });

  assert.equal(mountedMapIds.size, CAMPAIGN_OPERATION_SEQUENCE.length, 'campaign operations must mount distinct authored maps');
});
